const { alertQueue, connection } = require("../bullmq");
const axios = require("axios");
const { getAuthToken } = require("../services/apiAuthService");
const { fetchDomainData } = require("../services/urlService");
const { fetchAlertSetups } = require("../services/alertService");
const logger = require("../utils/logger");
const dayjs = require("dayjs");

let isPolling = false;
const scheduledJobCache = new Map();
const POLL_INTERVAL = 30000;

// Config
const DB_API =
  process.env.DATABASES_API_URL ||
  "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";

// Helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Token
const getToken = async (db) => {
  try {
    return await getAuthToken(connection, db);
  } catch {
    return null;
  }
};

// Fetch DB
const fetchAllDatabases = async (retries = 3) => {
  let lastError = null;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(DB_API, { timeout: 30000 });
      const databases = response.data?.data || [];
      const dbNames = databases.map((db) => db.DBName).filter(Boolean);
      return [...new Set(dbNames)];
    } catch (err) {
      lastError = err;
      logger.warn(`Alert Fetch databases attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        await sleep(2000 * (i + 1));
      }
    }
  }
  logger.error("Alert Error fetching databases after retries", { error: lastError?.message });
  return ["DCCBusinessSuite_mowara_test"];
};

const addRepeatJob = async (payload, cron, jobId) => {
  if (scheduledJobCache.get(jobId) === cron) {
    logger.debug(`Alert Job already scheduled with same cron, skipping`, { jobId, cron });
    return;
  }

  const existing = await alertQueue.getRepeatableJobs();
  for (const j of existing) {
    if (j.key && j.key.includes(jobId)) {
      logger.info(`Removing old repeatable alert job`, { jobId, pattern: j.pattern });
      await alertQueue.removeRepeatableByKey(j.key);
    }
  }

  await alertQueue.add("send-alert", payload, {
    repeat: { cron, tz: "UTC" },
    jobId,
  });

  scheduledJobCache.set(jobId, cron);
  logger.info(`Scheduled alert job`, { jobId, cron });
};

const buildCronExpression = (freqName, interval) => {
  if (!interval || interval <= 0) interval = 1;
  const code = String(freqName || "").trim().toUpperCase();
  switch (code) {
    case "N": // Minutes
      if (interval >= 60) return "* * * * *"; // Over 60 mins -> worker will check
      return `*/${interval} * * * *`;
    case "H": // Hours
      return `0 */${interval} * * *`;
    case "D": // Days
      return `0 0 */${interval} * *`;
    case "W": // Weeks
      return `0 0 * * 0`;
    case "M": // Months
      return `0 0 1 */${interval} *`;
    default:
      return null;
  }
};

const pollAlertScheduler = async () => {
  if (isPolling) {
    logger.warn("Previous alert poll still running, skipping this cycle");
    return;
  }
  isPolling = true;

  try {
    const dbs = await fetchAllDatabases();
    const activeJobKeys = new Set();

    for (const db of dbs) {
      const token = await getToken(db);
      if (!token) continue;

      const domainData = await fetchDomainData(db);
      if (!domainData || !domainData.BLApiUrl) {
        logger.warn(`No BLApiUrl found for db: ${db}`);
        continue;
      }

      const alertSetups = await fetchAlertSetups({ token, blApiUrl: domainData.BLApiUrl });
      
      for (const alertSetup of alertSetups) {
        if (alertSetup.is_active !== "Y") continue;
        
        const frequencies = alertSetup.m_alert_setup_frequency || [];
        for (const freq of frequencies) {
          const cron = buildCronExpression(freq.frequency_name, freq.interval);
          if (cron) {
            const jobId = `${db}-alert-${alertSetup.id}-${freq.id}`;
            activeJobKeys.add(jobId);
            
            const payload = {
              db,
              blApiUrl: domainData.BLApiUrl,
              alertSetup,
              frequency: freq
            };
            
            await addRepeatJob(payload, cron, jobId);
          }
        }
      }
    }

    // Clean up inactive jobs
    const existingJobs = await alertQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      if (!job.key) continue;
      
      let isActive = false;
      for (const activeJobId of activeJobKeys) {
        if (job.key.includes(":" + activeJobId + ":")) {
          isActive = true;
          break;
        }
      }
      
      if (!isActive) {
        logger.info(`Removing inactive alert job`, { jobKey: job.key });
        await alertQueue.removeRepeatableByKey(job.key);
      }
    }
  } catch (err) {
    logger.error("Alert Scheduler error", { error: err.message, stack: err.stack });
  } finally {
    isPolling = false;
  }
};

const startAlertPolling = () => {
  logger.info("Alert polling worker starting...");
  const intervalId = setInterval(pollAlertScheduler, POLL_INTERVAL);
  
  pollAlertScheduler().catch((err) => {
    logger.error("Initial alert poll failed", { error: err.message });
  });

  return {
    intervalId,
    close: async () => {
      if (intervalId) {
        clearInterval(intervalId);
        logger.info("Alert polling worker stopped");
      }
    },
    isAlive: () => intervalId !== null && intervalId !== undefined,
  };
};

module.exports = { startAlertPolling };
