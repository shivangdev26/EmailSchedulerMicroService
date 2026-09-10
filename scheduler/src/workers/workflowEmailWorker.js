const axios = require("axios");
const { connection } = require("../bullmq");
const { getAuthToken } = require("../services/common/apiAuthService");
const { fetchDomainData } = require("../services/common/urlService");
const {
  fetchPendingWorkflowEmails,
  processAndSendWorkflowEmail,
} = require("../services/workflowEmail/workflowEmailService");
const logger = require("../utils/logger");

let isPolling = false;
const POLL_INTERVAL = Number(process.env.WORKFLOW_EMAIL_POLL_INTERVAL) || 30000;
const CONCURRENCY = Number(process.env.WORKFLOW_EMAIL_CONCURRENCY) || 5;

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
//   logger.warn("WorkflowEmail: Falling back to default database", {
//     error: lastError?.message,
//   });
// };
const fetchAllDatabases = async () => {
  return ["DCCBusinessSuite_mowara_test"];
};

const pollWorkflowEmails = async () => {
  if (isPolling) {
    logger.debug("Previous workflow email poll still running, skipping cycle");
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

        const workflowItems = await fetchPendingWorkflowEmails({
          token,
          blApiUrl,
        });

        if (!workflowItems || workflowItems.length === 0) {
          continue;
        }

        logger.info(
          `Processing ${workflowItems.length} workflow emails concurrently (concurrency: ${CONCURRENCY})`,
          { db },
        );

        for (let i = 0; i < workflowItems.length; i += CONCURRENCY) {
          const chunk = workflowItems.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            chunk.map((item) =>
              processAndSendWorkflowEmail({
                workflowItem: item,
                token,
                blApiUrl,
              }),
            ),
          );
        }
      } catch (dbErr) {
        logger.error(`Error processing workflow emails for database ${db}`, {
          error: dbErr.message,
        });
      }
    }
  } catch (err) {
    logger.error("Workflow Email poll cycle error", {
      error: err.message,
    });
  } finally {
    isPolling = false;
  }
};

const startWorkflowEmailWorker = () => {
  logger.info(
    `Workflow email worker starting (Poll: ${POLL_INTERVAL}ms, Concurrency: ${CONCURRENCY})...`,
  );
  const intervalId = setInterval(pollWorkflowEmails, POLL_INTERVAL);

  pollWorkflowEmails().catch((err) => {
    logger.error("Initial workflow email poll failed", {
      error: err.message,
    });
  });

  return {
    intervalId,
    close: async () => {
      if (intervalId) {
        clearInterval(intervalId);
        logger.info("Workflow email worker stopped");
      }
    },
    isAlive: () => intervalId !== null && intervalId !== undefined,
  };
};

module.exports = { startWorkflowEmailWorker };
