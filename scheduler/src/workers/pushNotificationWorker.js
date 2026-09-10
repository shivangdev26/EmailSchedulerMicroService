const axios = require("axios");
const { connection } = require("../bullmq");
const { getAuthToken } = require("../services/common/apiAuthService");
const { fetchDomainData } = require("../services/common/urlService");
const {
  triggerPushAlertsProcedure,
  fetchPendingPushNotifications,
  updateAlertFrequencyLastRun,
  processSinglePushNotification,
} = require("../services/pushNotification/pushNotificationService");
const logger = require("../utils/logger");

let isPolling = false;
const POLL_INTERVAL =
  Number(process.env.PUSH_NOTIFICATION_POLL_INTERVAL) || 15000;
const CONCURRENCY = Number(process.env.PUSH_NOTIFICATION_CONCURRENCY) || 10;
const BATCH_LIMIT = Number(process.env.PUSH_NOTIFICATION_BATCH_LIMIT) || 100;

const DB_API =
  process.env.DATABASES_API_URL ||
  "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// const fetchAllDatabases = async (retries = 3) => {
//   let lastError = null;
//   for (let i = 0; i < retries; i++) {
//     try {
//       const response = await axios.get(DB_API, { timeout: 30000 });
//       const databases = response.data?.data || [];
//       const dbNames = databases.map((db) => db.DBName).filter(Boolean);
//       return [...new Set(dbNames)];
//     } catch (err) {
//       lastError = err;
//       if (i < retries - 1) {
//         await sleep(2000 * (i + 1));
//       }
//     }
//   }
//   logger.warn("PushNotification: Falling back to default database", {
//     error: lastError?.message,
//   });

const fetchAllDatabases = async () => {
  return ["DCCBusinessSuite_mowara_test"];
};

const pollPushNotifications = async () => {
  if (isPolling) {
    logger.debug(
      "Previous push notification poll still running, skipping cycle",
    );
    return;
  }
  isPolling = true;

  try {
    const dbs = await fetchAllDatabases();

    for (const db of dbs) {
      try {
        const domainData = await fetchDomainData(db);
        if (!domainData || !domainData.BLApiUrl) {
          continue;
        }

        const token = await getAuthToken(
          connection,
          db,
          false,
          domainData.BLApiUrl,
        );
        if (!token) continue;

        const blApiUrl = domainData.BLApiUrl;

        await triggerPushAlertsProcedure({ token, blApiUrl });

        const notifications = await fetchPendingPushNotifications({
          token,
          blApiUrl,
          limit: BATCH_LIMIT,
        });

        if (!notifications || notifications.length === 0) {
          continue;
        }

        logger.info(
          `Processing ${notifications.length} push notifications concurrently (batch concurrency: ${CONCURRENCY})`,
          { db },
        );

        const alertIds = [];

        for (let i = 0; i < notifications.length; i += CONCURRENCY) {
          const chunk = notifications.slice(i, i + CONCURRENCY);

          const settledResults = await Promise.allSettled(
            chunk.map((item) =>
              processSinglePushNotification({ item, token, blApiUrl }),
            ),
          );

          for (const res of settledResults) {
            if (res.status === "fulfilled" && res.value?.alertId) {
              if (!alertIds.includes(res.value.alertId)) {
                alertIds.push(res.value.alertId);
              }
            }
          }

          if (i + CONCURRENCY < notifications.length) {
            await sleep(250);
          }
        }

        if (alertIds.length > 0) {
          await updateAlertFrequencyLastRun({ token, blApiUrl, alertIds });
        }

        await sleep(300);
      } catch (dbErr) {
        logger.error(`Error processing push notifications for database ${db}`, {
          error: dbErr.message,
        });
      }
    }
  } catch (err) {
    logger.error("Push Notification poll cycle error", {
      error: err.message,
    });
  } finally {
    isPolling = false;
  }
};

const startPushNotificationWorker = () => {
  logger.info(
    `Push notification worker starting (Poll: ${POLL_INTERVAL}ms, Concurrency: ${CONCURRENCY})...`,
  );
  const intervalId = setInterval(pollPushNotifications, POLL_INTERVAL);

  pollPushNotifications().catch((err) => {
    logger.error("Initial push notification poll failed", {
      error: err.message,
    });
  });

  return {
    intervalId,
    close: async () => {
      if (intervalId) {
        clearInterval(intervalId);
        logger.info("Push notification worker stopped");
      }
    },
    isAlive: () => intervalId !== null && intervalId !== undefined,
  };
};

module.exports = { startPushNotificationWorker };
