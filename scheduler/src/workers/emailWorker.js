// const { Worker } = require("bullmq");
// const { connection, emailQueueName } = require("../bullmq");
// const { sendEmail } = require("../services/emailSenderService");
// const { getAuthToken, buildApiHeaders } = require("../services/apiAuthService");
// const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
// const { updateEmailQueueStatus } = require("../services/ackService");
// const {
//   fetchUdfData,
//   replacePlaceholders,
//   executeMultipleQueries,
//   replaceQueryPlaceholders,
// } = require("../services/udfService");
// const {
//   generateExcelBuffer,
//   generatePdfBuffer,
// } = require("../services/attachmentService");
// const {
//   processEmailQueueStatus,
// } = require("../services/emailQueueCronService");
// const axios = require("axios");
// const logger = require("../utils/logger");

// const dayjs = require("dayjs");
// const utc = require("dayjs/plugin/utc");

// const timezone = require("dayjs/plugin/timezone");

// dayjs.extend(utc);
// dayjs.extend(timezone);

// const normalizeRecipients = (value) => {
//   if (!value) return [];
//   if (Array.isArray(value))
//     return value.map((v) => String(v).trim()).filter(Boolean);
//   if (typeof value === "string")
//     return value
//       .split(/[;,]/)
//       .map((v) => v.trim())
//       .filter(Boolean);
//   return [];
// };

// const buildEmailPayloadFromConfig = (config, smtp, attachments = []) => {
//   if (!smtp) throw new Error("Missing SMTP");

//   const payload = {
//     smtp: {
//       server: smtp.server || smtp.server_name,
//       email: smtp.email || smtp.user_name,
//       password: smtp.password,
//       port: smtp.port || smtp.port_number,
//     },
//     from: smtp.email_address || smtp.user_name,
//     to: normalizeRecipients(config.recipients),
//     cc: normalizeRecipients(config.cc),
//     bcc: normalizeRecipients(config.bcc),
//     subject: config.title || "No Subject",
//     text: config.msg_body || "No body",
//     html: config.msg_body ? `<div>${config.msg_body}</div>` : "No content",
//   };

//   if (attachments && attachments.length > 0) {
//     payload.attachments = attachments;
//   }

//   return payload;
// };

// const startEmailWorker = () => {
//   logger.info("Email Worker started");

//   const concurrency = Number(process.env.EMAIL_WORKER_CONCURRENCY) || 20;
//   const lockDuration = Number(process.env.EMAIL_WORKER_LOCK_DURATION) || 30000;

//   logger.info(`Email Worker started with concurrency: ${concurrency}`);

//   const worker = new Worker(
//     emailQueueName,
//     async (job) => {
//       try {
//         if (job.name === "send-email") {
//           const { action, smtp, db, advanced } = job.data.payload || job.data;

//           let currentAction = action;
//           try {
//             const token = await getAuthToken(connection, db);
//             if (token) {
//               const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
//               const headers = buildApiHeaders({ bearerToken: token });
//               const response = await axios.get(url, { headers });

//               if (
//                 response.data?.data &&
//                 Array.isArray(response.data.data) &&
//                 response.data.data.length > 0
//               ) {
//                 currentAction = response.data.data[0];
//               } else if (
//                 response.data?.tblData &&
//                 Array.isArray(response.data.tblData) &&
//                 response.data.tblData.length > 0
//               ) {
//                 currentAction = response.data.tblData[0];
//               }

//               logger.info(`Fetched latest action details`, {
//                 actionId: action.id,
//                 database: db,
//                 is_active: currentAction.is_active,
//               });
//             }
//           } catch (err) {
//             logger.warn(`Failed to fetch latest action details`, {
//               actionId: action.id,
//               database: db,
//               error: err.message,
//             });
//           }

//           // Skip if action is not active
//           if (currentAction && currentAction.is_active !== "Y") {
//             logger.info(`Skipping inactive action`, {
//               actionId: action.id,
//               database: db,
//             });
//             return;
//           }

//           const tz = advanced?.tz || currentAction?.timezone || "UTC";
//           const now = dayjs().tz(tz);

//           if (advanced) {
//             const startDate = dayjs(advanced.startDate).tz(tz);
//             const endDate = advanced.endDate
//               ? dayjs(advanced.endDate).tz(tz)
//               : null;

//             logger.info("Advanced schedule check", {
//               actionId: currentAction.id,
//               timezone: tz,
//               now: now.format(),
//               startDate: startDate.format(),
//               endDate: endDate ? endDate.format() : null,
//             });

//             if (now.isBefore(startDate, "day")) {
//               logger.info("Skipping advanced email: before start date", {
//                 actionId: currentAction.id,
//               });
//               return;
//             }

//             if (endDate && now.isAfter(endDate, "day")) {
//               logger.info("Skipping advanced email: after end date", {
//                 actionId: currentAction.id,
//               });
//               return;
//             }

//             const nowDateOnly = now.startOf("day");
//             const startDateOnly = startDate.startOf("day");
//             const daysSinceStart = nowDateOnly.diff(startDateOnly, "day");
//             logger.info("Advanced schedule days check", {
//               actionId: currentAction.id,
//               daysSinceStart,
//               everyDays: advanced.everyDays,
//               modulo: daysSinceStart % advanced.everyDays,
//             });

//             if (
//               advanced.everyDays > 1 &&
//               daysSinceStart % advanced.everyDays !== 0
//             ) {
//               logger.info("Skipping advanced email: not on interval day", {
//                 actionId: currentAction.id,
//               });
//               return;
//             }

//             const currentH = now.hour();
//             const currentM = now.minute();
//             const currentTimeInMins = currentH * 60 + currentM;
//             const startH = advanced.startH ?? 0;
//             const startM = advanced.startM ?? 0;
//             const endH = advanced.endH ?? 23;
//             const endM = advanced.endM ?? 59;
//             const startTotalMins = startH * 60 + startM;
//             const endTotalMins = endH * 60 + endM;
//             logger.info("Advanced schedule time window check", {
//               actionId: currentAction.id,
//               timeInMins: currentTimeInMins,
//               windowStart: startTotalMins,
//               windowEnd: endTotalMins,
//             });

//             let shouldSkip = false;
//             if (startTotalMins <= endTotalMins) {
//               shouldSkip =
//                 currentTimeInMins < startTotalMins ||
//                 currentTimeInMins > endTotalMins;
//             } else {
//               shouldSkip =
//                 currentTimeInMins > endTotalMins &&
//                 currentTimeInMins < startTotalMins;
//             }

//             if (shouldSkip) {
//               logger.info("Skipping advanced email: outside time window", {
//                 actionId: currentAction.id,
//               });
//               return;
//             }
//             logger.info("Advanced email checks passed, proceeding", {
//               actionId: currentAction.id,
//             });
//           }

//           let queryData = {};
//           let token = null;

//           const hasQueries =
//             (currentAction.query && currentAction.query.trim()) ||
//             (currentAction.query_1 && currentAction.query_1.trim()) ||
//             (currentAction.query_2 && currentAction.query_2.trim()) ||
//             (currentAction.query_3 && currentAction.query_3.trim()) ||
//             (currentAction.query_4 && currentAction.query_4.trim());

//           if (hasQueries) {
//             try {
//               token = await getAuthToken(connection, db);

//               queryData = await executeMultipleQueries({
//                 token,
//                 action: currentAction,
//               });
//             } catch (err) {
//               logger.error(`Failed to execute queries for action`, {
//                 actionId: currentAction.id,
//                 error: err.message,
//               });
//             }
//           }

//           // Prepare subject and body with placeholders replaced
//           let subject =
//             currentAction.subject ||
//             currentAction.display_name ||
//             currentAction.title ||
//             "Scheduled Email";
//           let textBody =
//             currentAction.body ||
//             currentAction.msg_body ||
//             currentAction.display_name ||
//             "No content";
//           let htmlBody = currentAction.body
//             ? `<div>${currentAction.body}</div>`
//             : currentAction.msg_body
//               ? `<div>${currentAction.msg_body}</div>`
//               : currentAction.display_name
//                 ? `<div>${currentAction.display_name}</div>`
//                 : "No content";

//           if (Object.keys(queryData).length > 0) {
//             subject = replaceQueryPlaceholders(subject, queryData);
//             textBody = replaceQueryPlaceholders(textBody, queryData);
//             htmlBody = replaceQueryPlaceholders(htmlBody, queryData);
//           }

//           const emailPayload = {
//             smtp: {
//               server: smtp.server || smtp.server_name,
//               email: smtp.email || smtp.user_name,
//               password: smtp.password,
//               port: smtp.port || smtp.port_number,
//               secure: smtp.secure || smtp.is_ssl === "Y",
//             },
//             from: smtp.email_address || smtp.user_name,
//             to: normalizeRecipients(currentAction.to),
//             cc: normalizeRecipients(currentAction.cc),
//             bcc: normalizeRecipients(currentAction.bcc),
//             subject,
//             text: textBody,
//             html: htmlBody,
//           };

//           const attachments = [];
//           const rawResults = queryData._rawResults || {};

//           const hasQueryData = Object.values(rawResults).some(
//             (data) => data && Array.isArray(data) && data.length > 0,
//           );

//           if (hasQueryData) {
//             const baseFilename =
//               currentAction.report_filename ||
//               currentAction.display_name ||
//               "report";
//             const worksheetType = currentAction.worksheet_type || "S";

//             if (currentAction.is_excel === "Y") {
//               try {
//                 const excel = await generateExcelBuffer(
//                   rawResults,
//                   baseFilename,
//                   worksheetType,
//                 );
//                 attachments.push({
//                   filename: excel.filename,
//                   content: excel.buffer.toString("base64"),
//                   encoding: "base64",
//                   contentType: excel.mimetype,
//                 });
//               } catch (err) {
//                 logger.error("Failed to generate Excel attachment", {
//                   actionId: currentAction.id,
//                   error: err.message,
//                 });
//               }
//             }

//             if (currentAction.is_pdf === "Y") {
//               try {
//                 const firstQueryKey = Object.keys(rawResults).find(
//                   (k) => rawResults[k] && Array.isArray(rawResults[k]),
//                 );
//                 const firstQueryData = firstQueryKey
//                   ? rawResults[firstQueryKey]
//                   : null;

//                 if (firstQueryData && firstQueryData.length > 0) {
//                   const pdf = await generatePdfBuffer(
//                     firstQueryData,
//                     baseFilename,
//                   );
//                   attachments.push({
//                     filename: pdf.filename,
//                     content: pdf.buffer.toString("base64"),
//                     encoding: "base64",
//                     contentType: pdf.mimetype,
//                   });
//                 }
//               } catch (err) {
//                 logger.error("Failed to generate PDF attachment", {
//                   actionId: currentAction.id,
//                   error: err.message,
//                 });
//               }
//             }
//           }

//           if (attachments.length > 0) {
//             emailPayload.attachments = attachments;
//           }

//           if (!emailPayload.to.length) {
//             logger.warn(`No recipients for action, skipping`, {
//               actionId: currentAction.id,
//               database: db,
//             });
//             return;
//           }

//           await sendEmail(emailPayload);
//           logger.info(`Email sent successfully`, {
//             actionId: currentAction.id,
//             database: db,
//           });
//           return;
//         }

//         if (job.name === "process-email-trigger") {
//           const {
//             Email_Event_Config_Id,
//             ID,
//             dbName,
//             EntityId,
//             ChildId,
//             CombinedIds,
//             retry_count = 0,
//           } = job.data;

//           let token;
//           try {
//             token = await getAuthToken(connection, dbName);
//             if (!token) {
//               throw new Error(`Authentication failed for database: ${dbName}`);
//             }
//             console.log(
//               `Email worker authentication successful for database: ${dbName}`,
//             );
//           } catch (authError) {
//             console.error(
//               ` Email worker authentication failed for database: ${dbName}`,
//               authError.message,
//             );
//             throw new Error(
//               `Cannot process email - authentication failed: ${authError.message}`,
//             );
//           }

//           const configUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/${Email_Event_Config_Id}`;

//           console.log(`Fetching config from: ${configUrl}`);
//           console.log(`Using token: ${token}`);

//           let configResponse;
//           let configData;

//           const fetchConfig = async (authToken) => {
//             let response;
//             try {
//               response = await fetch(configUrl, {
//                 method: "GET",
//                 headers: {
//                   Authorization: authToken,
//                   "Content-Type": "application/json",
//                 },
//               });
//             } catch (error) {
//               console.log(`Auth attempt failed: ${error.message}`);
//               return null;
//             }

//             if (!response || !response.ok) {
//               const cleanToken = authToken.replace(/^Bearer\s+/i, "");
//               const bearerToken = authToken.startsWith("Bearer ")
//                 ? authToken
//                 : `Bearer ${authToken}`;

//               const altToken = authToken.startsWith("Bearer ")
//                 ? cleanToken
//                 : bearerToken;

//               console.log(`Trying with alternative token format: ${altToken}`);
//               response = await fetch(configUrl, {
//                 method: "GET",
//                 headers: {
//                   Authorization: altToken,
//                   "Content-Type": "application/json",
//                 },
//               });
//             }
//             return response;
//           };

//           configResponse = await fetchConfig(token);

//           if (configResponse && configResponse.ok) {
//             configData = await configResponse.json();

//             if (
//               configData.status === 401 ||
//               (configData.message &&
//                 configData.message.toLowerCase().includes("unauthorized"))
//             ) {
//               console.log(
//                 "Detected unauthorized message in 200 response. Refreshing token...",
//               );
//               token = await getAuthToken(connection, dbName, true);
//               configResponse = await fetchConfig(token);
//               if (configResponse && configResponse.ok) {
//                 configData = await configResponse.json();
//               }
//             }
//           }

//           console.log(`Config API response status: ${configResponse?.status}`);

//           if (!configResponse || !configResponse.ok) {
//             const errorText = configResponse
//               ? await configResponse.text()
//               : "No response";
//             console.error(`Config API error response: ${errorText}`);
//             throw new Error(
//               `Failed to fetch event configuration: ${configResponse?.status} - ${errorText}`,
//             );
//           }

//           console.log(
//             `Config API response data:`,
//             JSON.stringify(configData, null, 2),
//           );

//           if (
//             !configData.data ||
//             !configData.data.length ||
//             configData.status === 401
//           ) {
//             throw new Error(
//               `No configuration found or unauthorized for evnt_id: ${Email_Event_Config_Id}. Message: ${configData.message}`,
//             );
//           }

//           const config = configData.data[0];

//           console.log(
//             `[USER EMAIL FETCH] Checking config: email_group=${config.email_group}, m_email_event_configurations_user=${config.m_email_event_configurations_user?.length || 0}`,
//           );

//           if (
//             config.email_group === "0" &&
//             config.m_email_event_configurations_user &&
//             config.m_email_event_configurations_user.length > 0
//           ) {
//             console.log(
//               `[USER EMAIL FETCH] email_group is 0, fetching user emails`,
//             );

//             try {
//               const userIds = config.m_email_event_configurations_user
//                 .filter((u) => u.email === "Y")
//                 .map((u) => u.user_id)
//                 .filter((id) => id);

//               console.log(`[USER EMAIL FETCH] User IDs with email=Y:`, userIds);

//               if (userIds.length > 0) {
//                 const UDF_QUERY_URL = process.env.UDF_QUERY_URL;
//                 const query = `select * from m_user_master where id in (${userIds.join(",")})`;
//                 console.log(`[USER EMAIL FETCH] UDF Query: ${query}`);

//                 const userResponse = await axios.post(
//                   UDF_QUERY_URL,
//                   { query: query },
//                   {
//                     headers: {
//                       ...buildApiHeaders({ bearerToken: token }),
//                       "Content-Type": "application/json",
//                     },
//                   },
//                 );

//                 console.log(
//                   `[USER EMAIL FETCH] User UDF Query response:`,
//                   JSON.stringify(userResponse.data, null, 2),
//                 );

//                 let userData = userResponse.data;
//                 if (typeof userData === "string") {
//                   try {
//                     userData = JSON.parse(userData);
//                   } catch (e) {
//                     console.warn(
//                       "[USER EMAIL FETCH] User UDF response is string but not valid JSON",
//                     );
//                   }
//                 }

//                 const users =
//                   userData?.tblData || userData?.data || userData?.result || [];

//                 if (Array.isArray(users) && users.length > 0) {
//                   const userEmails = users
//                     .map((u) => u.email || u.email_address || u.user_email)
//                     .filter((email) => email)
//                     .join(",");

//                   console.log(
//                     `[USER EMAIL FETCH] Found user emails: ${userEmails}`,
//                   );

//                   config.recipients = userEmails;
//                   console.log(
//                     `[USER EMAIL FETCH] Updated config.recipients to: ${config.recipients}`,
//                   );
//                 } else {
//                   console.log(
//                     `[USER EMAIL FETCH] No users found in UDF response`,
//                   );
//                 }
//               } else {
//                 console.log(
//                   `[USER EMAIL FETCH] No user IDs with email=Y found`,
//                 );
//               }
//             } catch (userFetchError) {
//               console.error(
//                 `[USER EMAIL FETCH] Error fetching user emails:`,
//                 userFetchError.response?.data || userFetchError.message,
//               );
//             }
//           }

//           if (config.include_layout_pdf === "Y") {
//             console.log(
//               `[EMAIL QUEUE FETCH] include_layout_pdf is Y, fetching email_queue record with ID: ${ID}`,
//             );

//             try {
//               const UDF_QUERY_URL = process.env.UDF_QUERY_URL;
//               const query = `select * from d_email_queue where id=${ID}`;
//               console.log(`[EMAIL QUEUE FETCH] UDF Query: ${query}`);

//               const emailQueueResponse = await axios.post(
//                 UDF_QUERY_URL,
//                 { query: query },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );

//               console.log(
//                 `[EMAIL QUEUE FETCH] Email Queue UDF Query response:`,
//                 JSON.stringify(emailQueueResponse.data, null, 2),
//               );

//               let emailQueueData = emailQueueResponse.data;
//               if (typeof emailQueueData === "string") {
//                 try {
//                   emailQueueData = JSON.parse(emailQueueData);
//                 } catch (e) {
//                   console.warn(
//                     "[EMAIL QUEUE FETCH] Email Queue UDF response is string but not valid JSON",
//                   );
//                 }
//               }

//               const emailQueueRecords =
//                 emailQueueData?.tblData ||
//                 emailQueueData?.data ||
//                 emailQueueData?.result ||
//                 [];

//               if (
//                 Array.isArray(emailQueueRecords) &&
//                 emailQueueRecords.length > 0
//               ) {
//                 const emailQueueRecord = emailQueueRecords[0];
//                 const toEmail = emailQueueRecord.to_email;

//                 if (toEmail) {
//                   console.log(`[EMAIL QUEUE FETCH] Found to_email: ${toEmail}`);
//                   config.recipients = toEmail;
//                   console.log(
//                     `[EMAIL QUEUE FETCH] Updated config.recipients to: ${config.recipients}`,
//                   );
//                 } else {
//                   console.warn(
//                     `[EMAIL QUEUE FETCH] No to_email found in email_queue record`,
//                   );
//                 }
//               } else {
//                 console.warn(
//                   `[EMAIL QUEUE FETCH] No email_queue records found for ID: ${ID}`,
//                 );
//               }
//             } catch (emailQueueFetchError) {
//               console.error(
//                 `[EMAIL QUEUE FETCH] Error fetching email_queue record:`,
//                 emailQueueFetchError.response?.data ||
//                   emailQueueFetchError.message,
//               );
//             }
//           }

//           let linkExpiryDate;
//           const confirmationReq = config.confirmation_req;
//           const maxExpiryHours = config.max_expiry_hours || 48;

//           if (confirmationReq === "Y") {
//             const expiryTime = new Date();
//             const hoursToAdd = maxExpiryHours === 0 ? 48 : maxExpiryHours;
//             expiryTime.setHours(expiryTime.getHours() + hoursToAdd);
//             expiryTime.setMinutes(expiryTime.getMinutes());
//             expiryTime.setSeconds(expiryTime.getSeconds());
//             linkExpiryDate = expiryTime
//               .toISOString()
//               .slice(0, 19)
//               .replace("T", " ");
//             console.log(
//               ` Confirmation required - Link expiry set to: ${linkExpiryDate} (${hoursToAdd} hours from now)`,
//             );
//           } else {
//             linkExpiryDate = "9999-12-31";
//             console.log(
//               ` No confirmation required - Link expiry set to: ${linkExpiryDate}`,
//             );
//           }

//           let dynamicData = null;
//           if (EntityId && config.event_name) {
//             let VL_entityId = EntityId;
//             let tableNameForPlaceholders = config.event_name;

//             if (config.event_name === "d_fm_shipmentorder_cargodetails") {
//               VL_entityId = ChildId;
//             } else if (config.event_name === "d_cf_filemaster_attachment") {
//               tableNameForPlaceholders = "d_cf_filemaster";
//             } else if (config.event_name === "d_fm_shipmentorder_attachment") {
//               tableNameForPlaceholders = "d_fm_shipmentorder";
//             }

//             dynamicData = await fetchUdfData({
//               token,
//               tableName: tableNameForPlaceholders,
//               entityId: VL_entityId,
//             });

//             if (dynamicData) {
//               console.log(
//                 ` Dynamic data fetched for placeholders:`,
//                 JSON.stringify(dynamicData, null, 2),
//               );
//               const originalSubject = config.event_name;
//               const originalTitle = config.title;
//               const originalBody = config.msg_body;

//               config.event_name = replacePlaceholders(
//                 config.event_name,
//                 dynamicData,
//               );
//               config.title = replacePlaceholders(config.title, dynamicData);
//               config.msg_body = replacePlaceholders(
//                 config.msg_body,
//                 dynamicData,
//               );
//               console.log(` Placeholder Replacement Summary:`);
//               if (originalSubject !== config.event_name)
//                 console.log(`   - Subject updated`);
//               if (originalTitle !== config.title)
//                 console.log(`   - Title updated`);
//               if (originalBody !== config.msg_body)
//                 console.log(`   - Body updated`);
//             } else {
//               console.warn(
//                 ` No dynamic data found for placeholders using EntityId: ${EntityId} from table: ${tableNameForPlaceholders}`,
//               );
//             }
//           }

//           let attachments = [];

//           if (
//             config.event_name === "d_fm_shipmentorder_cargodetails" &&
//             ChildId
//           ) {
//             console.log(
//               `[CARGO ATTACHMENT] Event name matches: ${config.event_name}, using ChildId: ${ChildId}`,
//             );

//             try {
//               const UDF_QUERY_URL =
//                 "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";

//               const query = `select * FROM ${config.event_name} where id=${ChildId}`;
//               console.log(`[CARGO ATTACHMENT] UDF Query: ${query}`);

//               const response = await axios.post(
//                 UDF_QUERY_URL,
//                 { query: query },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );

//               console.log(
//                 `[CARGO ATTACHMENT] UDF Query response:`,
//                 JSON.stringify(response.data, null, 2),
//               );

//               console.log(
//                 `[CARGO ATTACHMENT] response.data type:`,
//                 typeof response.data,
//               );

//               let parsedData = response.data;
//               if (typeof response.data === "string") {
//                 try {
//                   parsedData = JSON.parse(response.data);
//                   console.log(
//                     `[CARGO ATTACHMENT] Successfully parsed string to JSON`,
//                   );
//                 } catch (parseError) {
//                   console.error(
//                     `[CARGO ATTACHMENT] Failed to parse JSON string:`,
//                     parseError.message,
//                   );
//                   parsedData = response.data;
//                 }
//               }

//               let tblData = [];
//               if (parsedData?.tblData) {
//                 tblData = parsedData.tblData;
//                 console.log(
//                   `[CARGO ATTACHMENT] Using tblData from parsedData.tblData`,
//                 );
//               } else if (Array.isArray(parsedData)) {
//                 tblData = parsedData;
//                 console.log(
//                   `[CARGO ATTACHMENT] Using parsedData directly as array`,
//                 );
//               } else if (parsedData?.data && Array.isArray(parsedData.data)) {
//                 tblData = parsedData.data;
//                 console.log(`[CARGO ATTACHMENT] Using parsedData.data`);
//               }

//               console.log(
//                 `[CARGO ATTACHMENT] Final tblData length:`,
//                 tblData.length,
//               );

//               if (!Array.isArray(tblData) || tblData.length === 0) {
//                 console.log(`[CARGO ATTACHMENT] No data found in UDF query`);
//               } else {
//                 console.log(
//                   `[CARGO ATTACHMENT] Found ${tblData.length} record(s) in UDF query`,
//                 );
//                 const record = tblData[0];
//                 let cdn_url = record?.cdn_url;

//                 if (!cdn_url) {
//                   console.log(`[CARGO ATTACHMENT] No cdn_url found in record`);
//                 } else {
//                   console.log(`[CARGO ATTACHMENT] Raw cdn_url: "${cdn_url}"`);
//                   cdn_url = cdn_url.trim();
//                   cdn_url = cdn_url.replace(/^[\s`"']+/, "");
//                   cdn_url = cdn_url.replace(/[\s`"']+$/, "");
//                   console.log(
//                     `[CARGO ATTACHMENT] Cleaned cdn_url: "${cdn_url}"`,
//                   );

//                   try {
//                     console.log(
//                       `[CARGO ATTACHMENT] Downloading file from: ${cdn_url}`,
//                     );
//                     const fileResponse = await axios.get(cdn_url, {
//                       responseType: "arraybuffer",
//                     });

//                     const base64Content = fileResponse.data.toString("base64");
//                     const mimeType =
//                       fileResponse.headers["content-type"] || "application/pdf";

//                     console.log(
//                       `[CARGO ATTACHMENT] File downloaded successfully, size: ${base64Content.length} chars`,
//                     );

//                     attachments = [
//                       {
//                         filename: `Cargo_Details_${ChildId}.pdf`,
//                         content: base64Content,
//                         encoding: "base64",
//                         contentType: mimeType,
//                       },
//                     ];
//                     console.log(
//                       `[CARGO ATTACHMENT] Added attachment from: ${cdn_url}`,
//                     );
//                   } catch (downloadError) {
//                     console.error(
//                       `[CARGO ATTACHMENT] Failed to download file:`,
//                       downloadError.message,
//                     );
//                   }
//                 }
//               }
//             } catch (error) {
//               console.error(
//                 `[CARGO ATTACHMENT] Error fetching cargo details:`,
//                 error.response?.data || error.message,
//               );
//             }
//           }

//           if (
//             (config.event_name === "d_cf_filemaster_attachment" ||
//               config.event_name === "d_fm_shipmentorder_attachment") &&
//             CombinedIds
//           ) {
//             console.log(
//               `[MULTIPLE ATTACHMENTS] Event name matches: ${config.event_name}, using CombinedIds: ${CombinedIds}`,
//             );

//             try {
//               const UDF_QUERY_URL =
//                 "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";

//               const query = `select * from ${config.event_name} where id in (${CombinedIds})`;
//               console.log(`[MULTIPLE ATTACHMENTS] UDF Query: ${query}`);

//               const response = await axios.post(
//                 UDF_QUERY_URL,
//                 { query: query },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );

//               console.log(
//                 `[MULTIPLE ATTACHMENTS] UDF Query response:`,
//                 JSON.stringify(response.data, null, 2),
//               );

//               let parsedData = response.data;
//               if (typeof response.data === "string") {
//                 try {
//                   parsedData = JSON.parse(response.data);
//                   console.log(
//                     `[MULTIPLE ATTACHMENTS] Successfully parsed string to JSON`,
//                   );
//                 } catch (parseError) {
//                   console.error(
//                     `[MULTIPLE ATTACHMENTS] Failed to parse JSON string:`,
//                     parseError.message,
//                   );
//                   parsedData = response.data;
//                 }
//               }

//               let tblData = [];
//               if (parsedData?.tblData) {
//                 tblData = parsedData.tblData;
//                 console.log(
//                   `[MULTIPLE ATTACHMENTS] Using tblData from parsedData.tblData`,
//                 );
//               } else if (Array.isArray(parsedData)) {
//                 tblData = parsedData;
//                 console.log(
//                   `[MULTIPLE ATTACHMENTS] Using parsedData directly as array`,
//                 );
//               } else if (parsedData?.data && Array.isArray(parsedData.data)) {
//                 tblData = parsedData.data;
//                 console.log(`[MULTIPLE ATTACHMENTS] Using parsedData.data`);
//               }

//               console.log(
//                 `[MULTIPLE ATTACHMENTS] Final tblData length:`,
//                 tblData.length,
//               );

//               if (!Array.isArray(tblData) || tblData.length === 0) {
//                 console.log(
//                   `[MULTIPLE ATTACHMENTS] No data found in UDF query`,
//                 );
//               } else {
//                 console.log(
//                   `[MULTIPLE ATTACHMENTS] Found ${tblData.length} record(s) in UDF query`,
//                 );

//                 for (const record of tblData) {
//                   let cdn_url = record?.cdn_url;
//                   const fileName =
//                     record?.file_name || `attachment_${record.id}`;
//                   const fileExtension = record?.file_extension || "";

//                   if (!cdn_url) {
//                     console.log(
//                       `[MULTIPLE ATTACHMENTS] No cdn_url found for record id: ${record.id}`,
//                     );
//                     continue;
//                   }

//                   console.log(
//                     `[MULTIPLE ATTACHMENTS] Raw cdn_url for record ${record.id}: "${cdn_url}"`,
//                   );
//                   cdn_url = cdn_url.trim();
//                   cdn_url = cdn_url.replace(/^[\s`"']+/, "");
//                   cdn_url = cdn_url.replace(/[\s`"']+$/, "");
//                   console.log(
//                     `[MULTIPLE ATTACHMENTS] Cleaned cdn_url for record ${record.id}: "${cdn_url}"`,
//                   );

//                   try {
//                     console.log(
//                       `[MULTIPLE ATTACHMENTS] Downloading file from: ${cdn_url}`,
//                     );
//                     const fileResponse = await axios.get(cdn_url, {
//                       responseType: "arraybuffer",
//                     });

//                     const base64Content = fileResponse.data.toString("base64");
//                     const mimeType =
//                       fileResponse.headers["content-type"] ||
//                       "application/octet-stream";

//                     console.log(
//                       `[MULTIPLE ATTACHMENTS] File downloaded successfully for record ${record.id}, size: ${base64Content.length} chars`,
//                     );

//                     const cleanExtension = fileExtension.startsWith(".")
//                       ? fileExtension
//                       : fileExtension
//                         ? `.${fileExtension}`
//                         : "";

//                     const finalFileName = fileName.endsWith(cleanExtension)
//                       ? fileName
//                       : `${fileName}${cleanExtension}`;

//                     attachments.push({
//                       filename: finalFileName,
//                       content: base64Content,
//                       encoding: "base64",
//                       contentType: mimeType,
//                     });
//                     console.log(
//                       `[MULTIPLE ATTACHMENTS] Added attachment: ${finalFileName}`,
//                     );
//                   } catch (downloadError) {
//                     console.error(
//                       `[MULTIPLE ATTACHMENTS] Failed to download file for record ${record.id}:`,
//                       downloadError.message,
//                     );
//                   }
//                 }
//               }
//             } catch (error) {
//               console.error(
//                 `[MULTIPLE ATTACHMENTS] Error fetching multiple attachments:`,
//                 error.response?.data || error.message,
//               );
//             }
//           }

//           console.log(`\n=== EMAIL EVENT CONFIGURATION DETAILS ===`);
//           console.log(`Event ID: ${Email_Event_Config_Id}`);
//           console.log(`Event Name: ${config.event_name}`);
//           console.log(`Event Title: ${config.title}`);
//           console.log(`Event Active: ${config.is_active}`);
//           console.log(`Email Account: ${config.email_account}`);
//           console.log(`Email Group: ${config.email_group}`);
//           console.log(`Recipients: ${config.recipients}`);
//           console.log(`CC: ${config.cc}`);
//           console.log(`BCC: ${config.bcc}`);
//           console.log(`Message Body: ${config.msg_body}`);
//           console.log(`Action Add: ${config.action_add}`);
//           console.log(`Action Update: ${config.action_update}`);
//           console.log(`Action Delete: ${config.action_delete}`);
//           console.log(`Action Cancel: ${config.action_cancel}`);
//           console.log(
//             `Confirmation Required: ${config.confirmation_req || "N/null"}`,
//           );
//           console.log(
//             `Max Expiry Hours: ${config.max_expiry_hours || "Not specified"}`,
//           );

//           const smtp = await fetchSmtpConfig({ token, connection, dbName });
//           if (!smtp) {
//             throw new Error("SMTP configuration unavailable");
//           }

//           console.log(`\n=== SMTP CONFIGURATION DETAILS ===`);
//           console.log(`SMTP Host: ${smtp.host}`);
//           console.log(`SMTP Port: ${smtp.port}`);
//           console.log(`SMTP Secure: ${smtp.secure}`);
//           console.log(`SMTP User: ${smtp.auth?.user || "N/A"}`);
//           console.log(
//             `SMTP Email: ${smtp.email_address || smtp.user_name || "N/A"}`,
//           );

//           let domainUrlData = null;
//           try {
//             const domainUrlApi = `https://logsuitedomainverify.dcctz.com/api/get_domain_url?DBName=${dbName}`;
//             console.log(`Fetching domain URL from: ${domainUrlApi}`);

//             const domainResponse = await fetch(domainUrlApi, {
//               method: "GET",
//               headers: {
//                 "Content-Type": "application/json",
//               },
//             });

//             if (domainResponse.ok) {
//               domainUrlData = await domainResponse.json();
//               console.log(
//                 `Domain URL API response:`,
//                 JSON.stringify(domainUrlData, null, 2),
//               );
//             } else {
//               console.warn(
//                 `Domain URL API failed with status: ${domainResponse.status}`,
//               );
//             }
//           } catch (domainError) {
//             console.warn(`Error fetching domain URL: ${domainError.message}`);
//           }

//           if (domainUrlData && config.msg_body) {
//             const originalBody = config.msg_body;

//             if (domainUrlData.url) {
//               config.msg_body = config.msg_body.replace(
//                 /{{confirm_link}}/g,
//                 domainUrlData.url,
//               );
//               console.log(
//                 ` Replaced {{confirm_link}} with: ${domainUrlData.url}`,
//               );
//             }

//             if (domainUrlData.url) {
//               config.msg_body = config.msg_body.replace(
//                 /{{not_confirm_link}}/g,
//                 domainUrlData.url,
//               );
//               console.log(
//                 ` Replaced {{not_confirm_link}} with: ${domainUrlData.url}`,
//               );
//             }

//             if (originalBody !== config.msg_body) {
//               console.log(` Email body updated with confirmation links`);
//             }
//           }

//           const emailPayload = buildEmailPayloadFromConfig(
//             config,
//             smtp,
//             attachments,
//           );
//           if (!emailPayload.to.length) {
//             console.warn(
//               ` No recipients for event ${Email_Event_Config_Id}, skipping email`,
//             );
//           } else {
//             console.log(`\n=== EMAIL SENDING DETAILS ===`);
//             console.log(`From: ${emailPayload.from}`);
//             console.log(`To: ${emailPayload.to.join(", ")}`);
//             if (emailPayload.cc?.length)
//               console.log(`CC: ${emailPayload.cc.join(", ")}`);
//             if (emailPayload.bcc?.length)
//               console.log(`BCC: ${emailPayload.bcc.join(", ")}`);
//             console.log(`Subject: ${emailPayload.subject}`);
//             console.log(`Body (Text): ${emailPayload.text}`);
//             console.log(`Body (HTML): ${emailPayload.html}`);
//             if (
//               emailPayload.attachments &&
//               emailPayload.attachments.length > 0
//             ) {
//               console.log(`Attachments:`);
//               emailPayload.attachments.forEach((att, idx) => {
//                 console.log(`  ${idx + 1}. ${att.filename}`);
//               });
//             }
//             console.log(
//               `SMTP Server: ${emailPayload.smtp.server}:${emailPayload.smtp.port}`,
//             );

//             await sendEmail(emailPayload);
//             console.log(
//               ` Email sent successfully for event ${Email_Event_Config_Id}`,
//             );
//           }

//           await updateEmailQueueStatus({
//             token,
//             id: ID,
//             email_queue_id: Email_Event_Config_Id,
//             ack_status: "Y",
//             tgr_status: "Y",
//             status: "SENT",
//             dbName: dbName,
//             EntityId: EntityId,
//             ChildId: ChildId,
//             CombinedIds: CombinedIds,
//             link_expiry:
//               typeof linkExpiryDate !== "undefined"
//                 ? linkExpiryDate
//                 : "9999-12-31",
//             response: "Email sent successfully",
//             retry_count: job.attemptsMade,
//           });
//         } else if (job.name === "check-email-queue-status") {
//           console.log(`Processing check-email-queue-status job ${job.id}`);
//           await processEmailQueueStatus();
//           console.log(`check-email-queue-status job ${job.id} completed`);
//         } else {
//           console.log(` Unhandled job type: ${job.name}`);
//         }
//       } catch (err) {
//         console.error(` Job ${job.id} failed:`, err.message);

//         const {
//           Email_Event_Config_Id,
//           ID,
//           dbName,
//           EntityId,
//           ChildId,
//           CombinedIds,
//         } = job.data;
//         if (Email_Event_Config_Id) {
//           try {
//             const token = await getAuthToken(connection, dbName);
//             const isLastAttempt = job.attemptsMade >= 2;

//             await updateEmailQueueStatus({
//               token,
//               id: ID,
//               email_queue_id: Email_Event_Config_Id,
//               ack_status: "Y",
//               status: isLastAttempt ? "FAILED" : "PENDING",
//               dbName: dbName,
//               EntityId: EntityId,
//               ChildId: ChildId,
//               CombinedIds: CombinedIds,
//               link_expiry:
//                 typeof linkExpiryDate !== "undefined"
//                   ? linkExpiryDate
//                   : "9999-12-31",
//               response: err.message,
//               retry_count: job.attemptsMade,
//             });
//           } catch (ackErr) {
//             console.error(" Failed to update failure status:", ackErr.message);
//           }
//         }

//         throw err;
//       }
//     },
//     {
//       connection,
//       concurrency,
//       lockDuration,
//     },
//   );

//   worker.on("completed", (job) => {
//     logger.info(`Job completed successfully`, {
//       jobId: job.id,
//       jobName: job.name,
//     });
//   });

//   worker.on("failed", (job, err) => {
//     logger.error(`Job failed`, {
//       jobId: job?.id,
//       jobName: job?.name,
//       error: err.message,
//       stack: err.stack,
//     });
//   });

//   worker.on("error", (err) => {
//     logger.error(`Worker error`, { error: err.message, stack: err.stack });
//   });

//   worker.on("stalled", (jobId) => {
//     logger.warn(`Job stalled`, { jobId });
//   });
// };

// module.exports = { startEmailWorker };

const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { connection } = require("../bullmq");
const { sendEmail } = require("../services/emailSenderService");
const { getAuthToken, buildApiHeaders } = require("../services/apiAuthService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
const { updateEmailQueueStatus } = require("../services/ackService");
const {
  fetchUdfData,
  replacePlaceholders,
  executeMultipleQueries,
  replaceQueryPlaceholders,
} = require("../services/udfService");
const {
  generateExcelBuffer,
  generatePdfBuffer,
} = require("../services/attachmentService");
const {
  processEmailQueueStatus,
} = require("../services/emailQueueCronService");
const axios = require("axios");
const logger = require("../utils/logger");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const emailQueueName = process.env.EMAIL_QUEUE_NAME || "email-scheduler";

//    of the shared connection doesn't kill the worker ──────────
const createWorkerRedis = () =>
  new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 100, 5000),
    enableReadyCheck: true,
    connectTimeout: 10000,
  });

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

const parseScheduleDetails = (details, tz = "UTC") => {
  logger.debug("Parsing schedule details", { details, timezone: tz });
  if (!details || typeof details !== "string") return null;

  const one = details.match(
    /(?:occurs\s*)?on (\d{2})\/(\d{2})\/(\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)/i,
  );

  if (one) {
    let [_, d, m, y, h, min, p] = one;
    h = +h;
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;

    return {
      type: "ONE",
      date: dayjs.tz(`${y}-${m}-${d} ${h}:${min}`, tz).utc(),
    };
  }

  const daily = details.match(
    /(?:occurs\s*)?every day at (\d{1,2}):(\d{2}) (AM|PM)/i,
  );

  if (daily) {
    let h = +daily[1];
    let min = +daily[2];
    const p = daily[3];
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;

    return {
      type: "DAILY",
      cron: `${min} ${h} * * *`,
    };
  }

  const weekly = details.match(
    /(?:occurs\s*)?every week on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at (\d{1,2}):(\d{2}) (AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
  );

  if (weekly) {
    logger.info("=== PARSE SCHEDULE DETAILS DEBUG (WEEKLY) ===", {
      details,
      weeklyGroups: weekly.slice(0),
    });

    const dayMap = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    let h = Number(weekly[2]);
    let min = Number(weekly[3]);
    const p = weekly[4];

    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;

    const startDate = dayjs.tz(
      `${weekly[7]}-${weekly[6]}-${weekly[5]} 00:00`,
      tz,
    );

    let endDate = null;
    if (weekly[8] && weekly[9] && weekly[10]) {
      endDate = dayjs.tz(`${weekly[10]}-${weekly[9]}-${weekly[8]} 23:59`, tz);
    }

    return {
      type: "WEEKLY",
      dayOfWeek: dayMap[weekly[1]],
      hour: h,
      minute: min,
      startDate: startDate.toISOString(),
      endDate: endDate ? endDate.toISOString() : null,
      tz,
    };
  }

  const advanced = details.match(
    /(?:occurs\s*)?every\s*(?:(\d+)\s*day\(s\)|day)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
  );

  if (advanced) {
    logger.info("=== PARSE SCHEDULE DETAILS DEBUG ===", {
      details,
      advancedGroups: advanced.slice(0),
    });

    let everyDays = advanced[1] ? Number(advanced[1]) : 1;
    let everyIntervalAmount = Number(advanced[2]);
    let everyIntervalType = advanced[3].toLowerCase();

    let startH = Number(advanced[4]);
    let startM = Number(advanced[5]);
    let startP = advanced[6];
    let endH = Number(advanced[7]);
    let endM = Number(advanced[8]);
    let endP = advanced[9];

    if (startP === "PM" && startH !== 12) startH += 12;
    if (startP === "AM" && startH === 12) startH = 0;
    if (endP === "PM" && endH !== 12) endH += 12;
    if (endP === "AM" && endH === 12) endH = 0;

    const startDate = dayjs.tz(
      `${advanced[12]}-${advanced[11]}-${advanced[10]} 00:00`,
      tz,
    );

    let endDate = null;
    if (advanced[13] && advanced[14] && advanced[15]) {
      endDate = dayjs.tz(
        `${advanced[15]}-${advanced[14]}-${advanced[13]} 23:59`,
        tz,
      );
    }

    return {
      type: "ADVANCED",
      everyDays,
      everyMinutes:
        everyIntervalType === "hour"
          ? everyIntervalAmount * 60
          : everyIntervalAmount,
      startH,
      startM,
      endH,
      endM,
      startDate: startDate.toISOString(),
      endDate: endDate ? endDate.toISOString() : null,
      tz,
    };
  }

  return null;
};

const parseScheduleFromObject = (scheduleObj, tz = "UTC") => {
  logger.info("=== PARSE SCHEDULE FROM OBJECT DEBUG ===", {
    scheduleObj,
    timezone: tz,
  });
  if (!scheduleObj) return null;

  if (
    scheduleObj.schedule_type === "R" &&
    scheduleObj.occurs === "D" &&
    scheduleObj.daily_freq === "O" &&
    scheduleObj.occurs_once
  ) {
    const occursOnce = dayjs.tz(scheduleObj.occurs_once, tz);
    const minute = occursOnce.minute();
    const hour = occursOnce.hour();

    return {
      type: "DAILY",
      cron: `${minute} ${hour} * * *`,
    };
  }

  if (
    scheduleObj.schedule_type === "R" &&
    scheduleObj.occurs === "D" &&
    scheduleObj.daily_freq === "E"
  ) {
    let everyMinutes = Number(scheduleObj.occurs_every);
    if (scheduleObj.occurs_every_hour === "H") {
      everyMinutes *= 60;
    }

    let startH = 0,
      startM = 0,
      endH = 23,
      endM = 59;
    if (scheduleObj.starting_at) {
      const startTime = dayjs.tz(scheduleObj.starting_at, tz);
      startH = startTime.hour();
      startM = startTime.minute();
    }
    if (scheduleObj.ending_at) {
      const endTime = dayjs.tz(scheduleObj.ending_at, tz);
      endH = endTime.hour();
      endM = endTime.minute();
    }

    const parsedAdvanced = {
      type: "ADVANCED",
      everyMinutes,
      startDate: scheduleObj.start_date
        ? dayjs.tz(scheduleObj.start_date, tz).toISOString()
        : dayjs.tz(dayjs(), tz).toISOString(),
      everyDays: Number(scheduleObj.recurs_every || 1),
      startH,
      startM,
      endH,
      endM,
      tz,
    };

    logger.info("=== parseScheduleFromObject final ADVANCED ===", {
      parsedAdvanced,
    });

    return parsedAdvanced;
  }

  if (scheduleObj.schedule_type === "O" && scheduleObj.one_time) {
    const oneTimeDate = dayjs.tz(scheduleObj.one_time, tz).utc();

    return {
      type: "ONE",
      date: oneTimeDate,
    };
  }

  return null;
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
  if (attachments?.length > 0) payload.attachments = attachments;
  return payload;
};

const startEmailWorker = () => {
  logger.info("Starting Email Worker...");

  const concurrency = Number(process.env.EMAIL_WORKER_CONCURRENCY) || 20;
  const lockDuration = Number(process.env.EMAIL_WORKER_LOCK_DURATION) || 30000;

  const workerConnection = createWorkerRedis();

  workerConnection.on("error", (err) =>
    logger.error("EmailWorker Redis error", { error: err.message }),
  );
  workerConnection.on("connect", () =>
    logger.info("EmailWorker Redis connected"),
  );
  workerConnection.on("ready", () => logger.info("EmailWorker Redis ready"));

  const worker = new Worker(
    emailQueueName,
    async (job) => {
      // ── declare linkExpiryDate here so it's always in scope ──
      let linkExpiryDate = "9999-12-31";

      try {
        if (job.name === "send-email") {
          logger.info("=== send-email job picked up ===", {
            jobId: job.id,
            jobData: job.data,
          });
          const { action, smtp, db, advanced } = job.data.payload || job.data;

          let currentAction = action;
          try {
            const token = await getAuthToken(connection, db);
            if (token) {
              const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
              const headers = buildApiHeaders({ bearerToken: token });
              const response = await axios.get(url, { headers });

              if (response.data?.data?.length > 0) {
                currentAction = response.data.data[0];
              } else if (response.data?.tblData?.length > 0) {
                currentAction = response.data.tblData[0];
              }

              logger.info("Fetched latest action details", {
                actionId: action.id,
                database: db,
                is_active: currentAction.is_active,
              });
            }
          } catch (err) {
            logger.warn("Failed to fetch latest action details", {
              actionId: action.id,
              database: db,
              error: err.message,
            });
          }

          if (currentAction?.is_active !== "Y") {
            logger.info("Skipping inactive action", {
              actionId: action.id,
              database: db,
            });
            return;
          }

          // Re-parse schedule details from currentAction to get fresh schedule object
          let currentSchedule = advanced;
          const tz = currentAction?.timezone || "UTC";
          let parsed = null;

          // Try schedule_details first
          if (currentAction.schedule_details) {
            parsed = parseScheduleDetails(currentAction.schedule_details, tz);
            logger.info("=== Tried parsing schedule details ===", {
              actionId: currentAction.id,
              hasScheduleDetails: true,
              parsed,
            });
          }

          // If that didn't work, try m_emailer_action_schedule
          if (
            (!parsed ||
              (parsed.type !== "ADVANCED" && parsed.type !== "WEEKLY")) &&
            currentAction.m_emailer_action_schedule &&
            currentAction.m_emailer_action_schedule.length > 0
          ) {
            logger.info("=== Trying parseScheduleFromObject ===", {
              actionId: currentAction.id,
            });
            for (const scheduleObj of currentAction.m_emailer_action_schedule) {
              parsed = parseScheduleFromObject(scheduleObj, tz);
              if (parsed) break;
            }
          }

          if (
            parsed &&
            (parsed.type === "ADVANCED" || parsed.type === "WEEKLY")
          ) {
            currentSchedule = parsed;
            logger.info("Re-parsed schedule details from current action", {
              actionId: currentAction.id,
              parsed,
            });
          }

          const now = dayjs().tz(tz);

          if (currentSchedule) {
            if (currentSchedule.type === "ADVANCED") {
              const startDate = dayjs(currentSchedule.startDate).tz(tz);
              const endDate = currentSchedule.endDate
                ? dayjs(currentSchedule.endDate).tz(tz)
                : null;

              const daysSinceStart = now
                .startOf("day")
                .diff(startDate.startOf("day"), "day");
              const modulo = daysSinceStart % currentSchedule.everyDays;
              logger.info("=== ADVANCED EMAIL DEBUG ===", {
                actionId: currentAction.id,
                timezone: tz,
                nowInTz: now.format(),
                startDate: startDate.format(),
                endDate: endDate ? endDate.format() : null,
                schedule: currentSchedule,
                startH: currentSchedule.startH,
                startM: currentSchedule.startM,
                endH: currentSchedule.endH,
                endM: currentSchedule.endM,
                daysSinceStart,
                everyDays: currentSchedule.everyDays,
                modulo: modulo,
              });

              if (now.isBefore(startDate, "day")) {
                logger.info("Skipping advanced email: before start date", {
                  actionId: currentAction.id,
                });
                return;
              }
              if (endDate && now.isAfter(endDate, "day")) {
                logger.info("Skipping advanced email: after end date", {
                  actionId: currentAction.id,
                });
                return;
              }

              logger.info("Days since start", {
                actionId: currentAction.id,
                daysSinceStart,
                everyDays: currentSchedule.everyDays,
                modulo,
              });
              if (
                currentSchedule.everyDays > 1 &&
                daysSinceStart % currentSchedule.everyDays !== 0
              ) {
                logger.info("Skipping advanced email: not on interval day", {
                  actionId: currentAction.id,
                });
                return;
              }

              const currentTimeInMins = now.hour() * 60 + now.minute();
              const startTotalMins =
                (currentSchedule.startH ?? 0) * 60 +
                (currentSchedule.startM ?? 0);
              const endTotalMins =
                (currentSchedule.endH ?? 23) * 60 +
                (currentSchedule.endM ?? 59);

              logger.info("Time window check", {
                actionId: currentAction.id,
                currentTimeInMins,
                startTotalMins,
                endTotalMins,
              });

              let shouldSkip;
              if (startTotalMins <= endTotalMins) {
                shouldSkip =
                  currentTimeInMins < startTotalMins ||
                  currentTimeInMins > endTotalMins;
              } else {
                shouldSkip =
                  currentTimeInMins > endTotalMins &&
                  currentTimeInMins < startTotalMins;
              }

              logger.info("Should skip?", {
                actionId: currentAction.id,
                shouldSkip,
              });

              if (shouldSkip) {
                logger.info("Skipping advanced email: outside time window", {
                  actionId: currentAction.id,
                });
                return;
              }
            } else if (currentSchedule.type === "WEEKLY") {
              const startDate = dayjs(currentSchedule.startDate).tz(tz);
              const endDate = currentSchedule.endDate
                ? dayjs(currentSchedule.endDate).tz(tz)
                : null;

              logger.info("=== WEEKLY EMAIL DEBUG ===", {
                actionId: currentAction.id,
                timezone: tz,
                nowInTz: now.format(),
                startDate: startDate.format(),
                endDate: endDate ? endDate.format() : null,
                schedule: currentSchedule,
                dayOfWeek: currentSchedule.dayOfWeek,
                hour: currentSchedule.hour,
                minute: currentSchedule.minute,
              });

              if (now.isBefore(startDate, "day")) {
                logger.info("Skipping weekly email: before start date", {
                  actionId: currentAction.id,
                });
                return;
              }
              if (endDate && now.isAfter(endDate, "day")) {
                logger.info("Skipping weekly email: after end date", {
                  actionId: currentAction.id,
                });
                return;
              }

              // Check if today is the correct day of week
              if (now.day() !== currentSchedule.dayOfWeek) {
                logger.info("Skipping weekly email: not the correct day", {
                  actionId: currentAction.id,
                  todayDay: now.day(),
                  expectedDay: currentSchedule.dayOfWeek,
                });
                return;
              }

              // Check if current time matches the scheduled hour and minute
              if (
                now.hour() !== currentSchedule.hour ||
                now.minute() !== currentSchedule.minute
              ) {
                logger.info("Skipping weekly email: not the correct time", {
                  actionId: currentAction.id,
                  currentHour: now.hour(),
                  currentMinute: now.minute(),
                  expectedHour: currentSchedule.hour,
                  expectedMinute: currentSchedule.minute,
                });
                return;
              }

              logger.info("Weekly email checks passed, proceeding", {
                actionId: currentAction.id,
              });
            }
          }

          let queryData = {};
          const hasQueries =
            currentAction.query?.trim() ||
            currentAction.query_1?.trim() ||
            currentAction.query_2?.trim() ||
            currentAction.query_3?.trim() ||
            currentAction.query_4?.trim();

          if (hasQueries) {
            try {
              const token = await getAuthToken(connection, db);
              queryData = await executeMultipleQueries({
                token,
                action: currentAction,
              });
            } catch (err) {
              logger.error("Failed to execute queries for action", {
                actionId: currentAction.id,
                error: err.message,
              });
            }
          }

          // Handle email_service_type = 'E' - do this BEFORE replaceQueryPlaceholders
          let toEmails = normalizeRecipients(currentAction.to);
          let ccEmails = normalizeRecipients(currentAction.cc);
          let bccEmails = normalizeRecipients(currentAction.bcc);
          let groupedQueryData = null;

          if (
            currentAction.email_service_type === "E" ||
            currentAction.emailer_type === "E"
          ) {
            logger.info("Handling emailer_type/email_service_type 'E'", {
              actionId: currentAction.id,
              emailer_type: currentAction.emailer_type,
              email_service_type: currentAction.email_service_type,
            });

            // Get the raw query results
            const rawResults = queryData._rawResults || {};
            logger.info("Query data _rawResults keys", {
              actionId: currentAction.id,
              keys: Object.keys(rawResults),
            });

            const firstQueryKey = Object.keys(rawResults).find((k) =>
              Array.isArray(rawResults[k]),
            );
            const tblData = firstQueryKey ? rawResults[firstQueryKey] : [];

            logger.info("UDF tblData for emailer_type 'E'", {
              actionId: currentAction.id,
              firstQueryKey,
              tblDataLength: tblData.length,
              tblDataSample: tblData.slice(0, 3),
            });

            // Helper function to remove sensitive fields (to_email, cc_email, bcc_email) from a row
            const cleanRow = (row) => {
              const cleaned = { ...row };
              const originalKeys = Object.keys(row);
              delete cleaned.to_email;
              delete cleaned.cc_email;
              delete cleaned.bcc_email;
              const newKeys = Object.keys(cleaned);
              // Only log for the first row to avoid spam
              if (row === tblData[0]) {
                logger.info(
                  "cleanRow function execution details (first row only):",
                  {
                    originalKeys,
                    newKeys,
                    had_to_email: "to_email" in row,
                    had_cc_email: "cc_email" in row,
                    had_bcc_email: "bcc_email" in row,
                  },
                );
              }
              return cleaned;
            };

            // FIRST: Clean _rawResults and queryData to remove sensitive fields!
            logger.info("=== Step 1: Cleaning sensitive fields from data ===", {
              actionId: currentAction.id,
            });
            // Override ALL _rawResults keys to use cleaned data
            Object.keys(rawResults).forEach((key) => {
              if (Array.isArray(rawResults[key])) {
                rawResults[key] = rawResults[key].map(cleanRow);
                // Also override the same key in queryData (like query_result_0)
                if (queryData[key]) {
                  queryData[key] = rawResults[key];
                }
              }
            });
            // Also override any query_result_* keys not in _rawResults
            Object.keys(queryData).forEach((key) => {
              if (
                key.startsWith("query_result_") &&
                Array.isArray(queryData[key])
              ) {
                queryData[key] = queryData[key].map(cleanRow);
              }
            });
            logger.info("=== Step 1 complete: Sensitive fields removed ===");

            // THEN: Group by customer_code and calculate totals!
            logger.info("=== Step 2: Grouping by customer_code ===", {
              actionId: currentAction.id,
            });
            const groupedData = tblData.reduce((acc, row) => {
              const customerCode = row.customer_code || "";
              if (!acc[customerCode]) {
                acc[customerCode] = {
                  customer_code: customerCode,
                  customer_name: row.customer_name || "",
                  rows: [],
                  to_email: row.to_email || "",
                  cc_email: row.cc_email || "",
                  bcc_email: row.bcc_email || "",
                  // Initialize total fields
                  total_bill_amount: 0,
                  total_paid_amount: 0,
                  total_balance_amount: 0,
                  total_bill_amount_sy: 0,
                  total_paid_amount_sy: 0,
                  total_balance_amount_sy: 0,
                };
              }
              // Clean the row and add to rows
              const cleanedRow = cleanRow(row);
              acc[customerCode].rows.push(cleanedRow);
              // Update emails if not already set
              if (!acc[customerCode].to_email && row.to_email) {
                acc[customerCode].to_email = row.to_email;
              }
              if (!acc[customerCode].cc_email && row.cc_email) {
                acc[customerCode].cc_email = row.cc_email;
              }
              if (!acc[customerCode].bcc_email && row.bcc_email) {
                acc[customerCode].bcc_email = row.bcc_email;
              }
              // Sum the numeric fields
              acc[customerCode].total_bill_amount += row.bill_amount || 0;
              acc[customerCode].total_paid_amount += row.paid_amount || 0;
              acc[customerCode].total_balance_amount += row.balance_amount || 0;
              acc[customerCode].total_bill_amount_sy += row.bill_amount_sy || 0;
              acc[customerCode].total_paid_amount_sy += row.paid_amount_sy || 0;
              acc[customerCode].total_balance_amount_sy +=
                row.balance_amount_sy || 0;
              return acc;
            }, {});
            logger.info("Grouped data by customer_code", {
              actionId: currentAction.id,
              groupCount: Object.keys(groupedData).length,
              groups: Object.keys(groupedData),
            });
            logger.info("=== Step 2 complete: Grouping done ===");

            // Collect all unique emails
            const allToEmails = new Set();
            const allCcEmails = new Set();
            const allBccEmails = new Set();
            Object.values(groupedData).forEach((group) => {
              normalizeRecipients(group.to_email).forEach((email) =>
                allToEmails.add(email),
              );
              normalizeRecipients(group.cc_email).forEach((email) =>
                allCcEmails.add(email),
              );
              normalizeRecipients(group.bcc_email).forEach((email) =>
                allBccEmails.add(email),
              );
            });
            toEmails = Array.from(allToEmails);
            ccEmails = Array.from(allCcEmails);
            bccEmails = Array.from(allBccEmails);
            logger.info(
              "Collected emails for emailer_type/email_service_type 'E'",
              {
                actionId: currentAction.id,
                toEmails: toEmails,
                ccEmails: ccEmails,
                bccEmails: bccEmails,
              },
            );

            // Prepare grouped data for email body and attachments
            const groupedArray = Object.values(groupedData);
            // Create a customer summary array (one entry per customer with totals)
            const customerSummary = groupedArray.map((group) => ({
              customer_code: group.customer_code,
              customer_name: group.customer_name,
              total_bill_amount: group.total_bill_amount,
              total_paid_amount: group.total_paid_amount,
              total_balance_amount: group.total_balance_amount,
              total_bill_amount_sy: group.total_bill_amount_sy,
              total_paid_amount_sy: group.total_paid_amount_sy,
              total_balance_amount_sy: group.total_balance_amount_sy,
            }));
            // Prepare flattened clean data for attachments (all rows with sensitive fields removed)
            const flattenedCleanData = tblData.map(cleanRow);
            // Also prepare grouped data with all rows flattened (grouped per customer but combined)
            const groupedForAttachments = groupedArray.map((group) => ({
              ...group,
              rows: group.rows, // already cleaned
            }));

            // Store in queryData so it's available for placeholder replacement
            queryData.grouped_data = groupedArray;
            queryData.clean_data = flattenedCleanData;
            queryData.customer_summary = customerSummary; // NEW: summary per customer with totals!
            // FINALLY: Automatically replace ALL query_result_* keys AND rawResults keys with customer_summary!
            const queryResultKeys = Object.keys(queryData).filter((k) =>
              k.startsWith("query_result_"),
            );
            if (queryResultKeys.length > 0) {
              queryResultKeys.forEach((key) => {
                queryData[key] = customerSummary;
              });
              // Also override rawResults keys for attachments!
              Object.keys(rawResults).forEach((key) => {
                if (Array.isArray(rawResults[key])) {
                  rawResults[key] = customerSummary;
                }
              });
              logger.info(
                "Automatically replaced all query_result keys and rawResults with customer_summary",
                {
                  actionId: currentAction.id,
                  replacedQueryKeys: queryResultKeys,
                  rawResultsKeys: Object.keys(rawResults),
                },
              );
            }

            // Log detailed data state after E-mode logic
            logger.info(
              "=== Final Detailed Data State After E-Mode Logic ===",
              {
                actionId: currentAction.id,
                queryDataKeys: Object.keys(queryData),
                // Show first few query_result entries with keys
                queryResultData: (() => {
                  const keys = Object.keys(queryData).filter((k) =>
                    k.startsWith("query_result_"),
                  );
                  return keys.map((k) => ({
                    key: k,
                    isArray: Array.isArray(queryData[k]),
                    firstItem: Array.isArray(queryData[k])
                      ? queryData[k][0]
                      : queryData[k],
                    itemCount: Array.isArray(queryData[k])
                      ? queryData[k].length
                      : "not array",
                    firstItemKeys:
                      Array.isArray(queryData[k]) && queryData[k][0]
                        ? Object.keys(queryData[k][0])
                        : [],
                  }));
                })(),
                rawResultsKeys: Object.keys(rawResults),
              },
            );

            groupedQueryData = {
              groupedArray,
              flattenedCleanData,
              groupedForAttachments,
            };
          }

          let subject =
            currentAction.subject ||
            currentAction.display_name ||
            currentAction.title ||
            "Scheduled Email";
          let textBody =
            currentAction.body ||
            currentAction.msg_body ||
            currentAction.display_name ||
            "No content";
          let htmlBody = currentAction.body
            ? `<div>${currentAction.body}</div>`
            : currentAction.msg_body
              ? `<div>${currentAction.msg_body}</div>`
              : currentAction.display_name
                ? `<div>${currentAction.display_name}</div>`
                : "No content";

          // Log what queryData looks like right before calling replaceQueryPlaceholders
          logger.info("queryData right before replaceQueryPlaceholders call:", {
            actionId: currentAction.id,
            queryDataKeys: Object.keys(queryData),
            firstQuerySample: (() => {
              const firstKey = Object.keys(queryData).find((k) =>
                k.startsWith("query_result_"),
              );
              if (!firstKey || !Array.isArray(queryData[firstKey])) return null;
              return {
                key: firstKey,
                sampleFirstRow: queryData[firstKey][0],
                sampleFirstRowKeys: Object.keys(queryData[firstKey][0] || {}),
              };
            })(),
          });
          if (Object.keys(queryData).length > 0) {
            subject = replaceQueryPlaceholders(subject, queryData);
            textBody = replaceQueryPlaceholders(textBody, queryData);
            htmlBody = replaceQueryPlaceholders(htmlBody, queryData);
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
            to: toEmails,
            cc: ccEmails,
            bcc: bccEmails,
            subject,
            text: textBody,
            html: htmlBody,
          };

          const attachments = [];
          const rawResults = queryData._rawResults || {};
          const hasQueryData = Object.values(rawResults).some(
            (d) => d && Array.isArray(d) && d.length > 0,
          );

          logger.info("=== Attachment generation debug ===", {
            actionId: currentAction.id,
            hasQueryData,
            is_excel: currentAction.is_excel,
            is_pdf: currentAction.is_pdf,
            rawResultsKeys: Object.keys(rawResults),
            rawResultsValues: Object.values(rawResults).map((v) => ({
              isArray: Array.isArray(v),
              length: Array.isArray(v) ? v.length : "N/A",
              sample: Array.isArray(v) && v.length > 0 ? v[0] : null,
            })),
          });

          if (hasQueryData) {
            const baseFilename =
              currentAction.report_filename ||
              currentAction.display_name ||
              "report";
            const worksheetType = currentAction.worksheet_type || "S";

            if (currentAction.is_excel === "Y") {
              logger.info("=== Generating Excel attachment ===", {
                actionId: currentAction.id,
              });
              try {
                const excel = await generateExcelBuffer(
                  rawResults,
                  baseFilename,
                  worksheetType,
                );
                attachments.push({
                  filename: excel.filename,
                  content: excel.buffer.toString("base64"),
                  encoding: "base64",
                  contentType: excel.mimetype,
                });
                logger.info("=== Excel attachment generated ===", {
                  actionId: currentAction.id,
                  filename: excel.filename,
                  bufferLength: excel.buffer.length,
                });
              } catch (err) {
                logger.error("Failed to generate Excel attachment", {
                  actionId: currentAction.id,
                  error: err.message,
                  stack: err.stack,
                });
              }
            }

            if (currentAction.is_pdf === "Y") {
              logger.info("=== Generating PDF attachment ===", {
                actionId: currentAction.id,
              });
              try {
                const firstKey = Object.keys(rawResults).find((k) =>
                  Array.isArray(rawResults[k]),
                );
                const firstData = firstKey ? rawResults[firstKey] : null;
                if (firstData?.length > 0) {
                  const pdf = await generatePdfBuffer(firstData, baseFilename);
                  attachments.push({
                    filename: pdf.filename,
                    content: pdf.buffer.toString("base64"),
                    encoding: "base64",
                    contentType: pdf.mimetype,
                  });
                  logger.info("=== PDF attachment generated ===", {
                    actionId: currentAction.id,
                    filename: pdf.filename,
                    bufferLength: pdf.buffer.length,
                  });
                } else {
                  logger.warn("=== No firstData to generate PDF ===", {
                    actionId: currentAction.id,
                    firstKey,
                    firstDataLength: firstData?.length,
                  });
                }
              } catch (err) {
                logger.error("Failed to generate PDF attachment", {
                  actionId: currentAction.id,
                  error: err.message,
                  stack: err.stack,
                });
              }
            }
          }

          logger.info("=== Attachments array ===", {
            actionId: currentAction.id,
            attachmentsCount: attachments.length,
            attachments: attachments.map((a) => ({
              filename: a.filename,
              contentType: a.contentType,
            })),
          });

          if (attachments.length > 0) emailPayload.attachments = attachments;

          logger.info("=== Final email payload ===", {
            actionId: currentAction.id,
            hasAttachments: !!emailPayload.attachments,
            attachmentsCount: emailPayload.attachments?.length || 0,
            payloadKeys: Object.keys(emailPayload),
            // Don't log full attachments content (it's huge), just filenames
            attachmentFilenames: emailPayload.attachments?.map(
              (a) => a.filename,
            ),
          });

          if (!emailPayload.to.length) {
            logger.warn("No recipients for action, skipping", {
              actionId: currentAction.id,
              database: db,
            });
            return;
          }

          await sendEmail(emailPayload);
          logger.info("Email sent successfully", {
            actionId: currentAction.id,
            database: db,
          });
          return;
        }

        // ── process-email-trigger ─────────────────────────────────────────────
        if (job.name === "process-email-trigger") {
          console.log("=== PROCESS-EMAIL-TRIGGER JOB STARTED ===");
          console.log("Job data:", job.data);

          const {
            Email_Event_Config_Id,
            ID,
            dbName,
            EntityId,
            ChildId,
            CombinedIds,
          } = job.data;

          // ── set linkExpiryDate BEFORE any awaits so catch always has it ──
          // (will be overwritten below after config is fetched)

          let token;
          try {
            console.log("Fetching auth token for database:", dbName);
            token = await getAuthToken(connection, dbName);
            if (!token)
              throw new Error(`Authentication failed for database: ${dbName}`);
            console.log(`Auth successful for database: ${dbName}`);
          } catch (authError) {
            console.error("Auth error:", authError.message);
            throw new Error(
              `Cannot process email - authentication failed: ${authError.message}`,
            );
          }

          const configUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/${Email_Event_Config_Id}`;
          console.log("Fetching event config from:", configUrl);

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
              console.warn(`Auth attempt failed: ${error.message}`);
              return null;
            }

            if (!response?.ok) {
              const altToken = authToken.startsWith("Bearer ")
                ? authToken.replace(/^Bearer\s+/i, "")
                : `Bearer ${authToken}`;
              console.log("Trying alternative token format for config fetch");
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

          let configResponse = await fetchConfig(token);
          console.log("Config response status:", configResponse?.status);
          let configData;

          if (configResponse?.ok) {
            configData = await configResponse.json();
            console.log(
              "Config data received:",
              JSON.stringify(configData, null, 2),
            );
            if (
              configData.status === 401 ||
              configData.message?.toLowerCase().includes("unauthorized")
            ) {
              console.log("Detected 401 in 200 response, refreshing token...");
              token = await getAuthToken(connection, dbName, true);
              configResponse = await fetchConfig(token);
              if (configResponse?.ok) configData = await configResponse.json();
            }
          }

          if (!configResponse?.ok) {
            const errorText = configResponse
              ? await configResponse.text()
              : "No response";
            console.error(
              "Failed to fetch config:",
              configResponse?.status,
              errorText,
            );
            throw new Error(
              `Failed to fetch event configuration: ${configResponse?.status} - ${errorText}`,
            );
          }

          if (!configData?.data?.length || configData.status === 401) {
            throw new Error(
              `No configuration found or unauthorized for evnt_id: ${Email_Event_Config_Id}. Message: ${configData?.message}`,
            );
          }

          const config = configData.data[0];
          console.log("Using config:", JSON.stringify(config, null, 2));

          // ── Now we have config, set linkExpiryDate properly ──
          const confirmationReq = config.confirmation_req;
          const maxExpiryHours = config.max_expiry_hours || 48;

          if (confirmationReq === "Y") {
            const expiryTime = new Date();
            const hoursToAdd = maxExpiryHours === 0 ? 48 : maxExpiryHours;
            expiryTime.setHours(expiryTime.getHours() + hoursToAdd);
            linkExpiryDate = expiryTime
              .toISOString()
              .slice(0, 19)
              .replace("T", " ");
            console.log(`Confirmation required - expiry: ${linkExpiryDate}`);
          }
          // else linkExpiryDate stays "9999-12-31" (set above)

          // ── User email fetch ──────────────────────────────────────────────
          if (
            config.email_group === "0" &&
            config.m_email_event_configurations_user?.length > 0
          ) {
            try {
              const userIds = config.m_email_event_configurations_user
                .filter((u) => u.email === "Y")
                .map((u) => u.user_id)
                .filter(Boolean);
              console.log("Fetching user emails for IDs:", userIds);

              if (userIds.length > 0) {
                const UDF_QUERY_URL = process.env.UDF_QUERY_URL;
                const userResponse = await axios.post(
                  UDF_QUERY_URL,
                  {
                    query: `select * from m_user_master where id in (${userIds.join(",")})`,
                  },
                  {
                    headers: {
                      ...buildApiHeaders({ bearerToken: token }),
                      "Content-Type": "application/json",
                    },
                  },
                );

                let userData = userResponse.data;
                if (typeof userData === "string") {
                  try {
                    userData = JSON.parse(userData);
                  } catch {}
                }

                const users =
                  userData?.tblData || userData?.data || userData?.result || [];
                console.log("Fetched users:", users);
                if (Array.isArray(users) && users.length > 0) {
                  config.recipients = users
                    .map((u) => u.email || u.email_address || u.user_email)
                    .filter(Boolean)
                    .join(",");
                  console.log("Set recipients from users:", config.recipients);
                }
              }
            } catch (userFetchError) {
              console.error(
                "Error fetching user emails:",
                userFetchError.message,
              );
            }
          }

          // ── Attachments (declare first) ───────────────────────────────────
          let attachments = [];
          const UDF_QUERY_URL =
            "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";

          const parseTblData = (raw) => {
            let parsed = raw;
            if (typeof raw === "string") {
              try {
                parsed = JSON.parse(raw);
              } catch {}
            }
            return (
              parsed?.tblData ||
              (Array.isArray(parsed) ? parsed : parsed?.data || [])
            );
          };

          // ── Email queue fetch + Layout PDF attachment ─────────────────────
          if (config.include_layout_pdf === "Y") {
            try {
              // First, keep the original email queue fetch for recipients
              const emailQueueResponse = await axios.post(
                UDF_QUERY_URL,
                { query: `select * from d_email_queue where id=${ID}` },
                {
                  headers: {
                    ...buildApiHeaders({ bearerToken: token }),
                    "Content-Type": "application/json",
                  },
                },
              );

              let emailQueueData = emailQueueResponse.data;
              if (typeof emailQueueData === "string") {
                try {
                  emailQueueData = JSON.parse(emailQueueData);
                } catch {}
              }

              const records =
                emailQueueData?.tblData ||
                emailQueueData?.data ||
                emailQueueData?.result ||
                [];
              if (
                Array.isArray(records) &&
                records.length > 0 &&
                records[0].to_email
              ) {
                config.recipients = records[0].to_email;
              }
            } catch (err) {
              console.error("Error fetching email_queue record:", err.message);
            }

            // Now, fetch the layout PDF from the new API
            try {
              // Get object_type from config if available, otherwise use event_name as fallback
              const object_type = config.object_type || config.event_name;
              const layoutPdfUrl =
                "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/ReportViewer/Home/GetLayoutInPDF";

              // Build URL with query parameters
              const url = new URL(layoutPdfUrl);
              url.searchParams.append("object_type", object_type);
              url.searchParams.append("database", dbName);
              url.searchParams.append("token", token);
              url.searchParams.append("id", EntityId.toString());

              console.log(`Fetching layout PDF from: ${url.toString()}`);

              // Call API to get PDF as array buffer
              const pdfResponse = await axios.get(url.toString(), {
                responseType: "arraybuffer",
              });

              console.log("Layout PDF response status:", pdfResponse.status);

              // Add PDF to attachments array
              attachments.push({
                filename: `Layout_${EntityId}.pdf`,
                content: pdfResponse.data.toString("base64"),
                encoding: "base64",
                contentType:
                  pdfResponse.headers["content-type"] || "application/pdf",
              });

              console.log(
                `Successfully fetched and added layout PDF for EntityId: ${EntityId}`,
              );
            } catch (pdfErr) {
              console.error(
                "Error fetching layout PDF:",
                pdfErr.message,
                "Status:",
                pdfErr.response?.status,
              );
            }
          }

          // ── Dynamic placeholder data ──────────────────────────────────────
          if (EntityId && config.event_name) {
            let VL_entityId = EntityId;
            let tableNameForPlaceholders = config.event_name;

            if (config.event_name === "d_fm_shipmentorder_cargodetails") {
              VL_entityId = ChildId;
            } else if (config.event_name === "d_cf_filemaster_attachment") {
              tableNameForPlaceholders = "d_cf_filemaster";
            } else if (config.event_name === "d_fm_shipmentorder_attachment") {
              tableNameForPlaceholders = "d_fm_shipmentorder";
            }

            const dynamicData = await fetchUdfData({
              token,
              tableName: tableNameForPlaceholders,
              entityId: VL_entityId,
            });
            if (dynamicData) {
              config.event_name = replacePlaceholders(
                config.event_name,
                dynamicData,
              );
              config.title = replacePlaceholders(config.title, dynamicData);
              config.msg_body = replacePlaceholders(
                config.msg_body,
                dynamicData,
              );
            }
          }

          if (
            config.event_name === "d_fm_shipmentorder_cargodetails" &&
            ChildId
          ) {
            try {
              const resp = await axios.post(
                UDF_QUERY_URL,
                {
                  query: `select * FROM ${config.event_name} where id=${ChildId}`,
                },
                {
                  headers: {
                    ...buildApiHeaders({ bearerToken: token }),
                    "Content-Type": "application/json",
                  },
                },
              );
              const tblData = parseTblData(resp.data);
              if (tblData.length > 0) {
                let cdn_url = tblData[0]?.cdn_url
                  ?.trim()
                  .replace(/^[\s`"']+/, "")
                  .replace(/[\s`"']+$/, "");
                if (cdn_url) {
                  const fileResp = await axios.get(cdn_url, {
                    responseType: "arraybuffer",
                  });
                  attachments.push({
                    filename: `Cargo_Details_${ChildId}.pdf`,
                    content: fileResp.data.toString("base64"),
                    encoding: "base64",
                    contentType:
                      fileResp.headers["content-type"] || "application/pdf",
                  });
                }
              }
            } catch (err) {
              console.error("Error fetching cargo attachment:", err.message);
            }
          }

          if (
            (config.event_name === "d_cf_filemaster_attachment" ||
              config.event_name === "d_fm_shipmentorder_attachment") &&
            CombinedIds
          ) {
            try {
              console.log(
                "Fetching multiple attachments for combined IDs:",
                CombinedIds,
              );
              const resp = await axios.post(
                UDF_QUERY_URL,
                {
                  query: `select * from ${config.event_name} where id in (${CombinedIds})`,
                },
                {
                  headers: {
                    ...buildApiHeaders({ bearerToken: token }),
                    "Content-Type": "application/json",
                  },
                },
              );
              const tblData = parseTblData(resp.data);
              console.log("Fetched attachment records:", tblData.length);

              for (const record of tblData) {
                let cdn_url = record?.cdn_url
                  ?.trim()
                  .replace(/^[\s`"']+/, "")
                  .replace(/[\s`"']+$/, "");
                if (!cdn_url) continue;
                try {
                  console.log("Downloading attachment from:", cdn_url);
                  const fileResp = await axios.get(cdn_url, {
                    responseType: "arraybuffer",
                  });
                  const ext = (record.file_extension || "").replace(
                    /^(?!\.)/,
                    ".",
                  );
                  const baseName =
                    record.file_name || `attachment_${record.id}`;
                  const finalName = baseName.endsWith(ext)
                    ? baseName
                    : `${baseName}${ext}`;
                  attachments.push({
                    filename: finalName,
                    content: fileResp.data.toString("base64"),
                    encoding: "base64",
                    contentType:
                      fileResp.headers["content-type"] ||
                      "application/octet-stream",
                  });
                  console.log("Added attachment:", finalName);
                } catch (dlErr) {
                  console.error(
                    `Failed to download attachment for record ${record.id}:`,
                    dlErr.message,
                  );
                }
              }
            } catch (err) {
              console.error(
                "Error fetching multiple attachments:",
                err.message,
              );
            }
          }

          console.log(
            "Current attachments array:",
            attachments.length,
            "attachments",
          );

          // ── SMTP ──────────────────────────────────────────────────────────
          console.log("Fetching SMTP config");
          const smtp = await fetchSmtpConfig({ token, connection, dbName });
          if (!smtp) throw new Error("SMTP configuration unavailable");
          console.log("SMTP config received");

          // ── Domain URL / confirmation links ───────────────────────────────
          try {
            const domainResponse = await fetch(
              `https://logsuitedomainverify.dcctz.com/api/get_domain_url?DBName=${dbName}`,
            );
            if (domainResponse.ok) {
              const domainUrlData = await domainResponse.json();
              console.log("Domain URL data:", domainUrlData);
              if (domainUrlData?.url && config.msg_body) {
                config.msg_body = config.msg_body
                  .replace(/{{confirm_link}}/g, domainUrlData.url)
                  .replace(/{{not_confirm_link}}/g, domainUrlData.url);
              }
            }
          } catch (err) {
            console.warn("Error fetching domain URL:", err.message);
          }

          // ── Send ──────────────────────────────────────────────────────────
          const emailPayload = buildEmailPayloadFromConfig(
            config,
            smtp,
            attachments,
          );
          console.log(
            "Built email payload:",
            JSON.stringify(emailPayload, null, 2),
          );

          if (!emailPayload.to.length) {
            console.warn(
              `No recipients for event ${Email_Event_Config_Id}, skipping`,
            );
          } else {
            console.log("Sending email...");
            await sendEmail(emailPayload);
            console.log(
              `Email sent successfully for event ${Email_Event_Config_Id}`,
            );
          }

          console.log("Calling updateEmailQueueStatus with status SENT...");
          await updateEmailQueueStatus({
            token,
            id: ID,
            email_queue_id: Email_Event_Config_Id,
            ack_status: "Y",
            tgr_status: "Y",
            status: "SENT",
            dbName,
            EntityId,
            ChildId,
            CombinedIds,
            link_expiry: linkExpiryDate,
            response: "Email sent successfully",
            retry_count: job.attemptsMade,
          });

          return;
        }

        if (job.name === "check-email-queue-status") {
          logger.info(`Processing check-email-queue-status job ${job.id}`);
          await processEmailQueueStatus();
          logger.info(`check-email-queue-status job ${job.id} completed`);
          return;
        }

        logger.warn(`Unhandled job type: ${job.name}`);
      } catch (err) {
        console.error(`Job ${job.id} failed:`, err.message);
        console.error("Stack trace:", err.stack);

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
            console.log("Updating failure status in updateEmailQueueStatus...");
            const token = await getAuthToken(connection, dbName);
            const isLastAttempt = job.attemptsMade >= 2;
            await updateEmailQueueStatus({
              token,
              id: ID,
              email_queue_id: Email_Event_Config_Id,
              ack_status: "Y",
              status: isLastAttempt ? "FAILED" : "PENDING",
              dbName,
              EntityId,
              ChildId,
              CombinedIds,
              link_expiry: linkExpiryDate, // ← now always defined
              response: err.message,
              retry_count: job.attemptsMade,
            });
          } catch (ackErr) {
            console.error("Failed to update failure status:", ackErr.message);
          }
        }

        throw err;
      }
    },
    {
      connection: workerConnection, // ← dedicated connection
      concurrency,
      lockDuration,
    },
  );

  worker.on("completed", (job) =>
    logger.info("Job completed", { jobId: job.id, jobName: job.name }),
  );
  worker.on("failed", (job, err) =>
    logger.error("Job failed", {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
    }),
  );
  worker.on("error", (err) =>
    logger.error("Worker error", { error: err.message }),
  );
  worker.on("stalled", (jobId) => logger.warn("Job stalled", { jobId }));

  logger.info(`Email Worker started with concurrency: ${concurrency}`);
  return worker; // ← CRITICAL: was missing before
};

module.exports = { startEmailWorker };
