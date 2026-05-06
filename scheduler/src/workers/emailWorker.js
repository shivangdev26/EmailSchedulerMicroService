const { Worker } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { sendEmail } = require("../services/emailSenderService");
const { getAuthToken } = require("../services/apiAuthService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
const { updateEmailQueueStatus } = require("../services/ackService");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const normalizeRecipients = (value) => {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[;,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
};

const buildEmailPayloadFromConfig = (config, smtp) => {
  if (!smtp) throw new Error("Missing SMTP");

  return {
    smtp: {
      server: smtp.server || smtp.server_name,
      email: smtp.email || smtp.user_name,
      password: smtp.password,
      port: smtp.port || smtp.port_number,
    },
    from: smtp.email_address || smtp.user_name,
    to: normalizeRecipients(config.recipients),
    cc: normalizeRecipients(config.cc),
    bcc: normalizeRecipients(config.bcc),
    subject: config.title || "No Subject",
    text: config.msg_body || "No body",
    html: config.msg_body ? `<div>${config.msg_body}</div>` : "No content",
  };
};

const startEmailWorker = () => {
  console.log(" Email Worker started");

  new Worker(
    emailQueueName,
    async (job) => {
      console.log(` Processing job ${job.id} (${job.name})`);

      try {
        if (job.name === "send-email") {
          const { action, smtp, db, advanced } = job.data.payload || job.data;
          const tz = advanced?.tz || action?.timezone || "UTC";
          const now = dayjs().tz(tz);

          if (advanced) {
            const startDate = dayjs(advanced.startDate).tz(tz);
            if (now.isBefore(startDate, "day")) {
              console.log(
                ` Skipping: Job ${job.id} is before start date ${advanced.startDate}`,
              );
              return;
            }

            // Check Time Window (startH:startM to endH:endM)
            const currentH = now.hour();
            const currentM = now.minute();
            const currentTimeInMins = currentH * 60 + currentM;
            const startTotalMins =
              advanced.startH * 60 + (advanced.startM || 0);
            const endTotalMins = advanced.endH * 60 + (advanced.endM || 0);

            if (
              currentTimeInMins < startTotalMins ||
              currentTimeInMins > endTotalMins
            ) {
              console.log(
                ` Skipping: Job ${job.id} is outside time window ${advanced.startH}:${advanced.startM} - ${advanced.endH}:${advanced.endM}`,
              );
              return;
            }
          }

          // 2. Build and Send
          const emailPayload = {
            smtp: {
              server: smtp.server || smtp.server_name,
              email: smtp.email || smtp.user_name,
              password: smtp.password,
              port: smtp.port || smtp.port_number,
              secure: smtp.secure || smtp.is_ssl === "Y",
            },
            from: smtp.email_address || smtp.user_name,
            to: normalizeRecipients(action.to),
            cc: normalizeRecipients(action.cc),
            bcc: normalizeRecipients(action.bcc),
            subject:
              action.display_name ||
              action.title ||
              action.subject ||
              "Scheduled Email",
            text: action.display_name || "No content",
            html: action.display_name
              ? `<div>${action.display_name}</div>`
              : "No content",
          };

          if (!emailPayload.to.length) {
            console.warn(` No recipients for action ${action.id}, skipping`);
            return;
          }

          await sendEmail(emailPayload);
          console.log(
            ` Email sent successfully for action ${action.id} (DB: ${db})`,
          );
          return;
        }

        if (job.name === "process-email-trigger") {
          const {
            Email_Event_Config_Id,
            ID,
            dbName,
            EntityId,
            ChildId,
            retry_count = 0,
          } = job.data;

          let token = await getAuthToken(connection, dbName);

          const configUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/${Email_Event_Config_Id}`;

          console.log(`Fetching config from: ${configUrl}`);
          console.log(`Using token: ${token}`);

          let configResponse;
          let configData;

          const fetchConfig = async (authToken) => {
            let response;
            try {
              response = await fetch(configUrl, {
                method: "GET",
                headers: {
                  Authorization: authToken,
                  "Content-Type": "application/json",
                },
              });
            } catch (error) {
              console.log(`Auth attempt failed: ${error.message}`);
              return null;
            }

            // If fails, try without Bearer prefix or with it depending on what was passed
            if (!response || !response.ok) {
              const cleanToken = authToken.replace(/^Bearer\s+/i, "");
              const bearerToken = authToken.startsWith("Bearer ")
                ? authToken
                : `Bearer ${authToken}`;

              const altToken = authToken.startsWith("Bearer ")
                ? cleanToken
                : bearerToken;

              console.log(`Trying with alternative token format...`);
              response = await fetch(configUrl, {
                method: "GET",
                headers: {
                  Authorization: altToken,
                  "Content-Type": "application/json",
                },
              });
            }
            return response;
          };

          configResponse = await fetchConfig(token);

          if (configResponse && configResponse.ok) {
            configData = await configResponse.json();

            // Handle the case where API returns 200 but body says 401
            if (
              configData.status === 401 ||
              (configData.message &&
                configData.message.toLowerCase().includes("unauthorized"))
            ) {
              console.log(
                "Detected unauthorized message in 200 response. Refreshing token...",
              );
              token = await getAuthToken(connection, dbName, true);
              configResponse = await fetchConfig(token);
              if (configResponse && configResponse.ok) {
                configData = await configResponse.json();
              }
            }
          }

          console.log(`Config API response status: ${configResponse?.status}`);

          if (!configResponse || !configResponse.ok) {
            const errorText = configResponse
              ? await configResponse.text()
              : "No response";
            console.error(`Config API error response: ${errorText}`);
            throw new Error(
              `Failed to fetch event configuration: ${configResponse?.status} - ${errorText}`,
            );
          }

          console.log(
            `Config API response data:`,
            JSON.stringify(configData, null, 2),
          );

          if (
            !configData.data ||
            !configData.data.length ||
            configData.status === 401
          ) {
            throw new Error(
              `No configuration found or unauthorized for evnt_id: ${Email_Event_Config_Id}. Message: ${configData.message}`,
            );
          }

          const config = configData.data[0];

          // Log complete event configuration details
          console.log(`\n=== EMAIL EVENT CONFIGURATION DETAILS ===`);
          console.log(`Event ID: ${Email_Event_Config_Id}`);
          console.log(`Event Name: ${config.event_name}`);
          console.log(`Event Title: ${config.title}`);
          console.log(`Event Active: ${config.is_active}`);
          console.log(`Email Account: ${config.email_account}`);
          console.log(`Email Group: ${config.email_group}`);
          console.log(`Recipients: ${config.recipients}`);
          console.log(`CC: ${config.cc}`);
          console.log(`BCC: ${config.bcc}`);
          console.log(`Message Body: ${config.msg_body}`);
          console.log(`Action Add: ${config.action_add}`);
          console.log(`Action Update: ${config.action_update}`);
          console.log(`Action Delete: ${config.action_delete}`);
          console.log(`Action Cancel: ${config.action_cancel}`);
          console.log(`========================================\n`);

          // 3. Fetch SMTP config
          // You might want to use config.email_account to fetch specific SMTP config
          const smtp = await fetchSmtpConfig({ token });
          if (!smtp) {
            throw new Error("SMTP configuration unavailable");
          }

          console.log(`\n=== SMTP CONFIGURATION DETAILS ===`);
          console.log(`SMTP Host: ${smtp.host}`);
          console.log(`SMTP Port: ${smtp.port}`);
          console.log(`SMTP Secure: ${smtp.secure}`);
          console.log(`SMTP User: ${smtp.auth?.user || "N/A"}`);
          console.log(
            `SMTP Email: ${smtp.email_address || smtp.user_name || "N/A"}`,
          );
          console.log(`====================================\n`);

          // 4. Send email
          const emailPayload = buildEmailPayloadFromConfig(config, smtp);
          if (!emailPayload.to.length) {
            console.warn(
              ` No recipients for event ${Email_Event_Config_Id}, skipping email`,
            );
          } else {
            console.log(`\n=== EMAIL SENDING DETAILS ===`);
            console.log(`From: ${emailPayload.from}`);
            console.log(`To: ${emailPayload.to.join(", ")}`);
            if (emailPayload.cc?.length)
              console.log(`CC: ${emailPayload.cc.join(", ")}`);
            if (emailPayload.bcc?.length)
              console.log(`BCC: ${emailPayload.bcc.join(", ")}`);
            console.log(`Subject: ${emailPayload.subject}`);
            console.log(`Body (Text): ${emailPayload.text}`);
            console.log(`Body (HTML): ${emailPayload.html}`);
            console.log(
              `SMTP Server: ${emailPayload.smtp.server}:${emailPayload.smtp.port}`,
            );

            await sendEmail(emailPayload);
            console.log(
              ` Email sent successfully for event ${Email_Event_Config_Id}`,
            );
          }

          await updateEmailQueueStatus({
            token,
            id: ID,
            email_queue_id: Email_Event_Config_Id,
            ack_status: "Y",
            tgr_status: "Y",
            status: "SENT",
            dbName: dbName,
            EntityId: EntityId,
            ChildId: ChildId,
            response: "Email sent successfully",
            retry_count: job.attemptsMade,
          });
        } else {
          console.log(` Unhandled job type: ${job.name}`);
        }
      } catch (err) {
        console.error(` Job ${job.id} failed:`, err.message);

        const { Email_Event_Config_Id, ID, dbName, EntityId, ChildId } =
          job.data;
        if (Email_Event_Config_Id) {
          try {
            const token = await getAuthToken(connection, dbName);
            const isLastAttempt = job.attemptsMade >= 3;

            await updateEmailQueueStatus({
              token,
              id: ID,
              email_queue_id: Email_Event_Config_Id,
              ack_status: "Y",
              tgr_status: "Y",
              status: isLastAttempt ? "failed" : "pending",
              dbName: dbName,
              EntityId: EntityId,
              ChildId: ChildId,
              response: err.message,
              retry_count: job.attemptsMade,
            });
          } catch (ackErr) {
            console.error(" Failed to update failure status:", ackErr.message);
          }
        }

        throw err;
      }
    },
    { connection },
  );
};

module.exports = { startEmailWorker };
