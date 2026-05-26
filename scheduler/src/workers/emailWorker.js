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
const { connection } = require("../bullmq"); // kept only for getAuthToken/fetchSmtpConfig that need it
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

// ── Each worker gets its own Redis connection so IIS recycling
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

  // ── Dedicated connection for this worker ──
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

          const tz = advanced?.tz || currentAction?.timezone || "UTC";
          const now = dayjs().tz(tz);

          if (advanced) {
            const startDate = dayjs(advanced.startDate).tz(tz);
            const endDate = advanced.endDate
              ? dayjs(advanced.endDate).tz(tz)
              : null;

            logger.info("=== ADVANCED EMAIL DEBUG ===", {
              actionId: currentAction.id,
              timezone: tz,
              nowInTz: now.format(),
              startDate: startDate.format(),
              endDate: endDate ? endDate.format() : null,
              advanced: advanced, // Log complete advanced object!
              startH: advanced.startH,
              startM: advanced.startM,
              endH: advanced.endH,
              endM: advanced.endM,
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

            const daysSinceStart = now
              .startOf("day")
              .diff(startDate.startOf("day"), "day");
            logger.info("Days since start", {
              actionId: currentAction.id,
              daysSinceStart,
              everyDays: advanced.everyDays,
            });
            if (
              advanced.everyDays > 1 &&
              daysSinceStart % advanced.everyDays !== 0
            ) {
              logger.info("Skipping advanced email: not on interval day", {
                actionId: currentAction.id,
              });
              return;
            }

            const currentTimeInMins = now.hour() * 60 + now.minute();
            const startTotalMins =
              (advanced.startH ?? 0) * 60 + (advanced.startM ?? 0);
            const endTotalMins =
              (advanced.endH ?? 23) * 60 + (advanced.endM ?? 59);

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
            to: normalizeRecipients(currentAction.to),
            cc: normalizeRecipients(currentAction.cc),
            bcc: normalizeRecipients(currentAction.bcc),
            subject,
            text: textBody,
            html: htmlBody,
          };

          const attachments = [];
          const rawResults = queryData._rawResults || {};
          const hasQueryData = Object.values(rawResults).some(
            (d) => d && Array.isArray(d) && d.length > 0,
          );

          if (hasQueryData) {
            const baseFilename =
              currentAction.report_filename ||
              currentAction.display_name ||
              "report";
            const worksheetType = currentAction.worksheet_type || "S";

            if (currentAction.is_excel === "Y") {
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
              } catch (err) {
                logger.error("Failed to generate Excel attachment", {
                  actionId: currentAction.id,
                  error: err.message,
                });
              }
            }

            if (currentAction.is_pdf === "Y") {
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
                }
              } catch (err) {
                logger.error("Failed to generate PDF attachment", {
                  actionId: currentAction.id,
                  error: err.message,
                });
              }
            }
          }

          if (attachments.length > 0) emailPayload.attachments = attachments;

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
            token = await getAuthToken(connection, dbName);
            if (!token)
              throw new Error(`Authentication failed for database: ${dbName}`);
            logger.info(`Auth successful for database: ${dbName}`);
          } catch (authError) {
            throw new Error(
              `Cannot process email - authentication failed: ${authError.message}`,
            );
          }

          const configUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/${Email_Event_Config_Id}`;

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
              logger.warn(`Auth attempt failed: ${error.message}`);
              return null;
            }

            if (!response?.ok) {
              const altToken = authToken.startsWith("Bearer ")
                ? authToken.replace(/^Bearer\s+/i, "")
                : `Bearer ${authToken}`;
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
          let configData;

          if (configResponse?.ok) {
            configData = await configResponse.json();
            if (
              configData.status === 401 ||
              configData.message?.toLowerCase().includes("unauthorized")
            ) {
              logger.info("Detected 401 in 200 response, refreshing token...");
              token = await getAuthToken(connection, dbName, true);
              configResponse = await fetchConfig(token);
              if (configResponse?.ok) configData = await configResponse.json();
            }
          }

          if (!configResponse?.ok) {
            const errorText = configResponse
              ? await configResponse.text()
              : "No response";
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
            logger.info(`Confirmation required - expiry: ${linkExpiryDate}`);
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
                if (Array.isArray(users) && users.length > 0) {
                  config.recipients = users
                    .map((u) => u.email || u.email_address || u.user_email)
                    .filter(Boolean)
                    .join(",");
                }
              }
            } catch (userFetchError) {
              logger.error("Error fetching user emails", {
                error: userFetchError.message,
              });
            }
          }

          // ── Email queue fetch ─────────────────────────────────────────────
          if (config.include_layout_pdf === "Y") {
            try {
              const UDF_QUERY_URL = process.env.UDF_QUERY_URL;
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
              logger.error("Error fetching email_queue record", {
                error: err.message,
              });
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

          // ── Attachments ───────────────────────────────────────────────────
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
                  attachments = [
                    {
                      filename: `Cargo_Details_${ChildId}.pdf`,
                      content: fileResp.data.toString("base64"),
                      encoding: "base64",
                      contentType:
                        fileResp.headers["content-type"] || "application/pdf",
                    },
                  ];
                }
              }
            } catch (err) {
              logger.error("Error fetching cargo attachment", {
                error: err.message,
              });
            }
          }

          if (
            (config.event_name === "d_cf_filemaster_attachment" ||
              config.event_name === "d_fm_shipmentorder_attachment") &&
            CombinedIds
          ) {
            try {
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

              for (const record of tblData) {
                let cdn_url = record?.cdn_url
                  ?.trim()
                  .replace(/^[\s`"']+/, "")
                  .replace(/[\s`"']+$/, "");
                if (!cdn_url) continue;
                try {
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
                } catch (dlErr) {
                  logger.error(
                    `Failed to download attachment for record ${record.id}`,
                    { error: dlErr.message },
                  );
                }
              }
            } catch (err) {
              logger.error("Error fetching multiple attachments", {
                error: err.message,
              });
            }
          }

          // ── SMTP ──────────────────────────────────────────────────────────
          const smtp = await fetchSmtpConfig({ token, connection, dbName });
          if (!smtp) throw new Error("SMTP configuration unavailable");

          // ── Domain URL / confirmation links ───────────────────────────────
          try {
            const domainResponse = await fetch(
              `https://logsuitedomainverify.dcctz.com/api/get_domain_url?DBName=${dbName}`,
            );
            if (domainResponse.ok) {
              const domainUrlData = await domainResponse.json();
              if (domainUrlData?.url && config.msg_body) {
                config.msg_body = config.msg_body
                  .replace(/{{confirm_link}}/g, domainUrlData.url)
                  .replace(/{{not_confirm_link}}/g, domainUrlData.url);
              }
            }
          } catch (err) {
            logger.warn("Error fetching domain URL", { error: err.message });
          }

          // ── Send ──────────────────────────────────────────────────────────
          const emailPayload = buildEmailPayloadFromConfig(
            config,
            smtp,
            attachments,
          );

          if (!emailPayload.to.length) {
            logger.warn(
              `No recipients for event ${Email_Event_Config_Id}, skipping`,
            );
          } else {
            await sendEmail(emailPayload);
            logger.info(
              `Email sent successfully for event ${Email_Event_Config_Id}`,
            );
          }

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
        logger.error(`Job ${job.id} failed`, {
          error: err.message,
          stack: err.stack,
        });

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
              dbName,
              EntityId,
              ChildId,
              CombinedIds,
              link_expiry: linkExpiryDate, // ← now always defined
              response: err.message,
              retry_count: job.attemptsMade,
            });
          } catch (ackErr) {
            logger.error("Failed to update failure status", {
              error: ackErr.message,
            });
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
