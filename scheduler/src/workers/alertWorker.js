const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { getAuthToken } = require("../services/apiAuthService");
const { executeAlertQuery } = require("../services/alertService");
const { alertQueueName, connection } = require("../bullmq");
const logger = require("../utils/logger");

const createWorkerRedis = () =>
  new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 100, 5000),
    enableReadyCheck: true,
    connectTimeout: 10000,
  });

const formatQueryResultsToHtml = (results) => {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return "<p>No data returned for this alert.</p>";
  }
  
  const keys = Object.keys(results[0]);
  let html = `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-family: Arial, sans-serif; font-size: 12px; border: 1px solid #ddd;">`;
  
  // Header
  html += `<thead><tr style="background-color: #f2f2f2; text-align: left;">`;
  keys.forEach(k => {
    html += `<th style="padding: 8px; border: 1px solid #ddd;">${k}</th>`;
  });
  html += `</tr></thead><tbody>`;
  
  // Body
  results.forEach(row => {
    html += `<tr>`;
    keys.forEach(k => {
      html += `<td style="padding: 8px; border: 1px solid #ddd;">${row[k] !== null && row[k] !== undefined ? row[k] : ""}</td>`;
    });
    html += `</tr>`;
  });
  
  html += `</tbody></table>`;
  return html;
};

const resolveUserEmail = async (userId, db, token) => {
  // Placeholder for fetching user details.
  // Implementing systems usually have an endpoint like /api/Users/{id}
  return `user_${userId}@example.com`; 
};

const startAlertWorker = () => {
  logger.info("Starting Alert Worker...");
  const workerConnection = createWorkerRedis();

  workerConnection.on("error", (err) => logger.error("AlertWorker Redis error", { error: err.message }));
  workerConnection.on("connect", () => logger.info("AlertWorker Redis connected"));
  workerConnection.on("ready", () => logger.info("AlertWorker Redis ready"));

  const worker = new Worker(
    alertQueueName,
    async (job) => {
      try {
        if (job.name === "send-alert") {
          const { db, blApiUrl, alertSetup } = job.data;
          logger.info("=== send-alert job picked up ===", { jobId: job.id, db, alertSetupId: alertSetup.id });

          const token = await getAuthToken(connection, db);
          if (!token) {
            logger.warn("Could not get auth token for db", { db });
            return;
          }

          // 1. Execute Query
          const queryResult = await executeAlertQuery({
            token,
            query: alertSetup.alert_query,
            blApiUrl
          });

          const htmlContent = formatQueryResultsToHtml(queryResult);

          // 2. Filter Users
          const eligibleUsers = (alertSetup.m_alert_setup_user || []).filter(u => u.alert === "Y");
          
          if (eligibleUsers.length === 0) {
            logger.info("No eligible users with alert='Y' found.", { alertSetupId: alertSetup.id });
            return;
          }

          // 3. Send Alerts
          for (const user of eligibleUsers) {
            // Note: If you need to send via Email, SMS, WhatsApp based on flags:
            // user.email === 'Y', user.sms === 'Y', user.whatsapp === 'Y'
            logger.info(`Sending alert to User ID: ${user.user_id}`, {
              alertSetupId: alertSetup.id,
              userId: user.user_id,
              emailFlag: user.email,
              smsFlag: user.sms,
              whatsappFlag: user.whatsapp
            });
            
            // Example of how the email dispatch could look:
            if (user.email === "Y") {
               const emailAddress = await resolveUserEmail(user.user_id, db, token);
               logger.info(`[Mock] Dispatching Email Alert`, {
                 to: emailAddress,
                 subject: `Alert: ${alertSetup.title}`,
                 bodyLength: htmlContent.length
               });
               // sendEmail({ to: emailAddress, subject: alertSetup.title, html: htmlContent, ... });
            }
          }
          
          logger.info("=== send-alert job completed ===", { jobId: job.id });
        }
      } catch (err) {
        logger.error("Error processing alert job", { jobId: job.id, error: err.message, stack: err.stack });
        throw err;
      }
    },
    {
      connection: workerConnection,
      concurrency: Number(process.env.ALERT_WORKER_CONCURRENCY) || 5,
    }
  );

  return worker;
};

module.exports = { startAlertWorker };
