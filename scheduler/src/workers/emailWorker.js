const { Worker } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { sendEmail } = require("../services/emailSenderService");
const { getAuthToken } = require("../services/apiAuthService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
const { updateEmailQueueStatus } = require("../services/ackService");
const { fetchUdfData, replacePlaceholders } = require("../services/udfService");

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
            CombinedIds,
            retry_count = 0,
          } = job.data;

          let token;
          try {
            token = await getAuthToken(connection, dbName);
            if (!token) {
              throw new Error(`Authentication failed for database: ${dbName}`);
            }
            console.log(
              `Email worker authentication successful for database: ${dbName}`,
            );
          } catch (authError) {
            console.error(
              ` Email worker authentication failed for database: ${dbName}`,
              authError.message,
            );
            throw new Error(
              `Cannot process email - authentication failed: ${authError.message}`,
            );
          }

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

            if (!response || !response.ok) {
              const cleanToken = authToken.replace(/^Bearer\s+/i, "");
              const bearerToken = authToken.startsWith("Bearer ")
                ? authToken
                : `Bearer ${authToken}`;

              const altToken = authToken.startsWith("Bearer ")
                ? cleanToken
                : bearerToken;

              console.log(`Trying with alternative token format: ${altToken}`);
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

          // Calculate link_expiry date based on confirmation_req (declare here for error handling scope)
          let linkExpiryDate;
          const confirmationReq = config.confirmation_req;
          const maxExpiryHours = config.max_expiry_hours || 48; // Default to 48 hours if not specified

          if (confirmationReq === "Y") {
            // If confirmation is required, set expiry to max_expiry_hours from now (default 48 hours)
            const expiryTime = new Date();
            expiryTime.setHours(expiryTime.getHours() + maxExpiryHours);
            linkExpiryDate = expiryTime.toISOString().split("T")[0]; // Format as YYYY-MM-DD
            console.log(
              ` Confirmation required - Link expiry set to: ${linkExpiryDate} (${maxExpiryHours} hours from now)`,
            );
          } else {
            // If confirmation is not required or null, set to 9999-12-31
            linkExpiryDate = "9999-12-31";
            console.log(
              ` No confirmation required - Link expiry set to: ${linkExpiryDate}`,
            );
          }

          let dynamicData = null;
          if (EntityId && config.event_name) {
            dynamicData = await fetchUdfData({
              token,
              tableName: config.event_name,
              entityId: EntityId,
            });

            if (dynamicData) {
              console.log(
                ` Dynamic data fetched for placeholders:`,
                JSON.stringify(dynamicData, null, 2),
              );
              const originalSubject = config.event_name;
              const originalTitle = config.title;
              const originalBody = config.msg_body;

              config.event_name = replacePlaceholders(
                config.event_name,
                dynamicData,
              );
              config.title = replacePlaceholders(config.title, dynamicData);
              config.msg_body = replacePlaceholders(
                config.msg_body,
                dynamicData,
              );

              console.log(` Placeholder Replacement Summary:`);
              if (originalSubject !== config.event_name)
                console.log(`   - Subject updated`);
              if (originalTitle !== config.title)
                console.log(`   - Title updated`);
              if (originalBody !== config.msg_body)
                console.log(`   - Body updated`);
            } else {
              console.warn(
                ` No dynamic data found for placeholders using EntityId: ${EntityId}`,
              );
            }
          }

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
          console.log(
            `Confirmation Required: ${config.confirmation_req || "N/null"}`,
          );
          console.log(
            `Max Expiry Hours: ${config.max_expiry_hours || "Not specified"}`,
          );
          console.log(`========================================\n`);

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
            CombinedIds: CombinedIds,
            link_expiry: linkExpiryDate,
            response: "Email sent successfully",
            retry_count: job.attemptsMade,
          });
        } else {
          console.log(` Unhandled job type: ${job.name}`);
        }
      } catch (err) {
        console.error(` Job ${job.id} failed:`, err.message);

        const {
          Email_Event_Config_Id,
          ID,
          dbName,
          EntityId,
          ChildId,
          CombinedIds,
        } = job.data;
        if (Email_Event_Config_Id) {
          try {
            const token = await getAuthToken(connection, dbName);
            const isLastAttempt = job.attemptsMade >= 2;

            await updateEmailQueueStatus({
              token,
              id: ID,
              email_queue_id: Email_Event_Config_Id,
              ack_status: "Y",
              status: isLastAttempt ? "FAILED" : "PENDING",
              dbName: dbName,
              EntityId: EntityId,
              ChildId: ChildId,
              CombinedIds: CombinedIds,
              link_expiry: linkExpiryDate,
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
