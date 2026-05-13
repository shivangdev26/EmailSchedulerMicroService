const { Worker } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { sendEmail } = require("../services/emailSenderService");
const { getAuthToken, buildApiHeaders } = require("../services/apiAuthService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
const { updateEmailQueueStatus } = require("../services/ackService");
const { fetchUdfData, replacePlaceholders } = require("../services/udfService");
// const {
//   processEmailQueueStatus,
// } = require("../services/emailQueueCronService");
const axios = require("axios");

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

const buildEmailPayloadFromConfig = (config, smtp, attachments = []) => {
  if (!smtp) throw new Error("Missing SMTP");

  const payload = {
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

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  return payload;
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

            const nowDateOnly = now.startOf("day");
            const startDateOnly = startDate.startOf("day");
            const daysSinceStart = nowDateOnly.diff(startDateOnly, "day");

            console.log(
              `Checking day interval: today=${now.format("YYYY-MM-DD")}, start=${startDate.format("YYYY-MM-DD")}, days since start=${daysSinceStart}, every ${advanced.everyDays} days`,
            );

            if (daysSinceStart % advanced.everyDays !== 0) {
              console.log(
                ` Skipping: Job ${job.id} is not on a scheduled day (every ${advanced.everyDays} days)`,
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

          console.log(
            `[USER EMAIL FETCH] Checking config: email_group=${config.email_group}, m_email_event_configurations_user=${config.m_email_event_configurations_user?.length || 0}`,
          );

          if (
            config.email_group === "0" &&
            config.m_email_event_configurations_user &&
            config.m_email_event_configurations_user.length > 0
          ) {
            console.log(
              `[USER EMAIL FETCH] email_group is 0, fetching user emails`,
            );

            try {
              const userIds = config.m_email_event_configurations_user
                .filter((u) => u.email === "Y")
                .map((u) => u.user_id)
                .filter((id) => id);

              console.log(`[USER EMAIL FETCH] User IDs with email=Y:`, userIds);

              if (userIds.length > 0) {
                const UDF_QUERY_URL = process.env.UDF_QUERY_URL;
                const query = `select * from m_user_master where id in (${userIds.join(",")})`;
                console.log(`[USER EMAIL FETCH] UDF Query: ${query}`);

                const userResponse = await axios.post(
                  UDF_QUERY_URL,
                  { query: query },
                  {
                    headers: {
                      ...buildApiHeaders({ bearerToken: token }),
                      "Content-Type": "application/json",
                    },
                  },
                );

                console.log(
                  `[USER EMAIL FETCH] User UDF Query response:`,
                  JSON.stringify(userResponse.data, null, 2),
                );

                let userData = userResponse.data;
                if (typeof userData === "string") {
                  try {
                    userData = JSON.parse(userData);
                  } catch (e) {
                    console.warn(
                      "[USER EMAIL FETCH] User UDF response is string but not valid JSON",
                    );
                  }
                }

                const users =
                  userData?.tblData || userData?.data || userData?.result || [];

                if (Array.isArray(users) && users.length > 0) {
                  const userEmails = users
                    .map((u) => u.email || u.email_address || u.user_email)
                    .filter((email) => email)
                    .join(",");

                  console.log(
                    `[USER EMAIL FETCH] Found user emails: ${userEmails}`,
                  );

                  config.recipients = userEmails;
                  console.log(
                    `[USER EMAIL FETCH] Updated config.recipients to: ${config.recipients}`,
                  );
                } else {
                  console.log(
                    `[USER EMAIL FETCH] No users found in UDF response`,
                  );
                }
              } else {
                console.log(
                  `[USER EMAIL FETCH] No user IDs with email=Y found`,
                );
              }
            } catch (userFetchError) {
              console.error(
                `[USER EMAIL FETCH] Error fetching user emails:`,
                userFetchError.response?.data || userFetchError.message,
              );
            }
          }

          let linkExpiryDate;
          const confirmationReq = config.confirmation_req;
          const maxExpiryHours = config.max_expiry_hours || 48;

          if (confirmationReq === "Y") {
            const expiryTime = new Date();
            const hoursToAdd = maxExpiryHours === 0 ? 48 : maxExpiryHours;
            expiryTime.setHours(expiryTime.getHours() + hoursToAdd);
            expiryTime.setMinutes(expiryTime.getMinutes());
            expiryTime.setSeconds(expiryTime.getSeconds());
            linkExpiryDate = expiryTime
              .toISOString()
              .slice(0, 19)
              .replace("T", " ");
            console.log(
              ` Confirmation required - Link expiry set to: ${linkExpiryDate} (${hoursToAdd} hours from now)`,
            );
          } else {
            linkExpiryDate = "9999-12-31";
            console.log(
              ` No confirmation required - Link expiry set to: ${linkExpiryDate}`,
            );
          }

          let dynamicData = null;
          if (EntityId && config.event_name) {
            let VL_entityId = EntityId;
            if (config.event_name === "d_fm_shipmentorder_cargodetails") {
              VL_entityId = ChildId;
            }
            dynamicData = await fetchUdfData({
              token,
              tableName: config.event_name,
              entityId: VL_entityId,
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
              //Write code for attachment
              if (config.event_name === "d_fm_shipmentorder_cargodetails") {
                VL_entityId = ChildId;
              }
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

          let attachments = [];

          if (
            config.event_name === "d_fm_shipmentorder_cargodetails" &&
            ChildId
          ) {
            console.log(
              `[CARGO ATTACHMENT] Event name matches: ${config.event_name}, using ChildId: ${ChildId}`,
            );

            try {
              const UDF_QUERY_URL =
                "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";

              const query = `select * FROM ${config.event_name} where id=${ChildId}`;
              console.log(`[CARGO ATTACHMENT] UDF Query: ${query}`);

              const response = await axios.post(
                UDF_QUERY_URL,
                { query: query },
                {
                  headers: {
                    ...buildApiHeaders({ bearerToken: token }),
                    "Content-Type": "application/json",
                  },
                },
              );

              console.log(
                `[CARGO ATTACHMENT] UDF Query response:`,
                JSON.stringify(response.data, null, 2),
              );

              console.log(
                `[CARGO ATTACHMENT] response.data type:`,
                typeof response.data,
              );

              let parsedData = response.data;
              if (typeof response.data === "string") {
                try {
                  parsedData = JSON.parse(response.data);
                  console.log(
                    `[CARGO ATTACHMENT] Successfully parsed string to JSON`,
                  );
                } catch (parseError) {
                  console.error(
                    `[CARGO ATTACHMENT] Failed to parse JSON string:`,
                    parseError.message,
                  );
                  parsedData = response.data;
                }
              }

              let tblData = [];
              if (parsedData?.tblData) {
                tblData = parsedData.tblData;
                console.log(
                  `[CARGO ATTACHMENT] Using tblData from parsedData.tblData`,
                );
              } else if (Array.isArray(parsedData)) {
                tblData = parsedData;
                console.log(
                  `[CARGO ATTACHMENT] Using parsedData directly as array`,
                );
              } else if (parsedData?.data && Array.isArray(parsedData.data)) {
                tblData = parsedData.data;
                console.log(`[CARGO ATTACHMENT] Using parsedData.data`);
              }

              console.log(
                `[CARGO ATTACHMENT] Final tblData length:`,
                tblData.length,
              );

              if (!Array.isArray(tblData) || tblData.length === 0) {
                console.log(`[CARGO ATTACHMENT] No data found in UDF query`);
              } else {
                console.log(
                  `[CARGO ATTACHMENT] Found ${tblData.length} record(s) in UDF query`,
                );
                const record = tblData[0];
                let cdn_url = record?.cdn_url;

                if (!cdn_url) {
                  console.log(`[CARGO ATTACHMENT] No cdn_url found in record`);
                } else {
                  console.log(`[CARGO ATTACHMENT] Raw cdn_url: "${cdn_url}"`);
                  cdn_url = cdn_url.trim();
                  cdn_url = cdn_url.replace(/^[\s`"']+/, "");
                  cdn_url = cdn_url.replace(/[\s`"']+$/, "");
                  console.log(
                    `[CARGO ATTACHMENT] Cleaned cdn_url: "${cdn_url}"`,
                  );

                  try {
                    console.log(
                      `[CARGO ATTACHMENT] Downloading file from: ${cdn_url}`,
                    );
                    const fileResponse = await axios.get(cdn_url, {
                      responseType: "arraybuffer",
                    });

                    const base64Content = fileResponse.data.toString("base64");
                    const mimeType =
                      fileResponse.headers["content-type"] || "application/pdf";

                    console.log(
                      `[CARGO ATTACHMENT] File downloaded successfully, size: ${base64Content.length} chars`,
                    );

                    attachments = [
                      {
                        filename: `Cargo_Details_${ChildId}.pdf`,
                        content: base64Content,
                        encoding: "base64",
                        contentType: mimeType,
                      },
                    ];
                    console.log(
                      `[CARGO ATTACHMENT] Added attachment from: ${cdn_url}`,
                    );
                  } catch (downloadError) {
                    console.error(
                      `[CARGO ATTACHMENT] Failed to download file:`,
                      downloadError.message,
                    );
                  }
                }
              }
            } catch (error) {
              console.error(
                `[CARGO ATTACHMENT] Error fetching cargo details:`,
                error.response?.data || error.message,
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

          let domainUrlData = null;
          try {
            const domainUrlApi = `https://logsuitedomainverify.dcctz.com/api/get_domain_url?DBName=${dbName}`;
            console.log(`Fetching domain URL from: ${domainUrlApi}`);

            const domainResponse = await fetch(domainUrlApi, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            });

            if (domainResponse.ok) {
              domainUrlData = await domainResponse.json();
              console.log(
                `Domain URL API response:`,
                JSON.stringify(domainUrlData, null, 2),
              );
            } else {
              console.warn(
                `Domain URL API failed with status: ${domainResponse.status}`,
              );
            }
          } catch (domainError) {
            console.warn(`Error fetching domain URL: ${domainError.message}`);
          }

          if (domainUrlData && config.msg_body) {
            const originalBody = config.msg_body;

            if (domainUrlData.url) {
              config.msg_body = config.msg_body.replace(
                /{{confirm_link}}/g,
                domainUrlData.url,
              );
              console.log(
                ` Replaced {{confirm_link}} with: ${domainUrlData.url}`,
              );
            }

            if (domainUrlData.url) {
              config.msg_body = config.msg_body.replace(
                /{{not_confirm_link}}/g,
                domainUrlData.url,
              );
              console.log(
                ` Replaced {{not_confirm_link}} with: ${domainUrlData.url}`,
              );
            }

            if (originalBody !== config.msg_body) {
              console.log(` Email body updated with confirmation links`);
            }
          }

          const emailPayload = buildEmailPayloadFromConfig(
            config,
            smtp,
            attachments,
          );
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
            if (
              emailPayload.attachments &&
              emailPayload.attachments.length > 0
            ) {
              console.log(`Attachments:`);
              emailPayload.attachments.forEach((att, idx) => {
                console.log(`  ${idx + 1}. ${att.filename}`);
              });
            }
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
            link_expiry:
              typeof linkExpiryDate !== "undefined"
                ? linkExpiryDate
                : "9999-12-31",
            response: "Email sent successfully",
            retry_count: job.attemptsMade,
          });
        } else if (job.name === "check-email-queue-status") {
          console.log(`Processing check-email-queue-status job ${job.id}`);
          // await processEmailQueueStatus();
          console.log(`check-email-queue-status job ${job.id} completed`);
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
              link_expiry:
                typeof linkExpiryDate !== "undefined"
                  ? linkExpiryDate
                  : "9999-12-31",
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
