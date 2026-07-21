// const { Worker, Queue } = require("bullmq");
// const IORedis = require("ioredis");
// const { connection } = require("../bullmq");
// const emailQueueName = process.env.EMAIL_QUEUE_NAME || "email-scheduler";

// const emailQueue = new Queue(emailQueueName, { connection });
// const {
//   sendEmail,
//   getSendEmailUrl,
// } = require("../services/emailSenderService");
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
// const {
//   fetchDomainData,
//   replaceApiUrlPrefix,
// } = require("../services/urlService");
// const axios = require("axios");
// const logger = require("../utils/logger");

// const dayjs = require("dayjs");
// const utc = require("dayjs/plugin/utc");
// const timezone = require("dayjs/plugin/timezone");
// const { query } = require("winston");
// dayjs.extend(utc);
// dayjs.extend(timezone);

// //    of the shared connection doesn't kill the worker ──────────
// const createWorkerRedis = () =>
//   new IORedis({
//     host: process.env.REDIS_HOST || "127.0.0.1",
//     port: Number(process.env.REDIS_PORT) || 6379,
//     maxRetriesPerRequest: null,
//     retryStrategy: (times) => Math.min(times * 100, 5000),
//     enableReadyCheck: true,
//     connectTimeout: 10000,
//   });

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

// const parseScheduleDetails = (details, tz = "UTC") => {
//   logger.debug("Parsing schedule details", { details, timezone: tz });
//   if (!details || typeof details !== "string") return null;

//   const one = details.match(
//     /(?:occurs\s*)?on (\d{2})\/(\d{2})\/(\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)/i,
//   );

//   if (one) {
//     let [_, d, m, y, h, min, p] = one;
//     h = +h;
//     if (p === "PM" && h !== 12) h += 12;
//     if (p === "AM" && h === 12) h = 0;

//     return {
//       type: "ONE",
//       date: dayjs.tz(`${y}-${m}-${d} ${h}:${min}`, tz).utc(),
//     };
//   }

//   const daily = details.match(
//     /(?:occurs\s*)?every day at (\d{1,2}):(\d{2}) (AM|PM)/i,
//   );

//   if (daily) {
//     let h = +daily[1];
//     let min = +daily[2];
//     const p = daily[3];
//     if (p === "PM" && h !== 12) h += 12;
//     if (p === "AM" && h === 12) h = 0;

//     return {
//       type: "DAILY",
//       cron: `${min} ${h} * * *`,
//     };
//   }

//   const weekly = details.match(
//     /(?:occurs\s*)?every week on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at (\d{1,2}):(\d{2}) (AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
//   );

//   if (weekly) {
//     logger.info("=== PARSE SCHEDULE DETAILS DEBUG (WEEKLY) ===", {
//       details,
//       weeklyGroups: weekly.slice(0),
//     });

//     const dayMap = {
//       Sunday: 0,
//       Monday: 1,
//       Tuesday: 2,
//       Wednesday: 3,
//       Thursday: 4,
//       Friday: 5,
//       Saturday: 6,
//     };

//     let h = Number(weekly[2]);
//     let min = Number(weekly[3]);
//     const p = weekly[4];

//     if (p === "PM" && h !== 12) h += 12;
//     if (p === "AM" && h === 12) h = 0;

//     const startDate = dayjs.tz(
//       `${weekly[7]}-${weekly[6]}-${weekly[5]} 00:00`,
//       tz,
//     );

//     let endDate = null;
//     if (weekly[8] && weekly[9] && weekly[10]) {
//       endDate = dayjs.tz(`${weekly[10]}-${weekly[9]}-${weekly[8]} 23:59`, tz);
//     }

//     return {
//       type: "WEEKLY",
//       dayOfWeek: dayMap[weekly[1]],
//       hour: h,
//       minute: min,
//       startDate: startDate.toISOString(),
//       endDate: endDate ? endDate.toISOString() : null,
//       tz,
//     };
//   }

//   const advanced =
//     details.match(
//       /(?:occurs\s*)?every\s*(?:(\d+)\s*day\(s\)|day)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
//     ) ||
//     details.match(
//       /(?:occurs\s*)?every\s*(?:(\d+)\s*day\(s\)|day)every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
//     );

//   if (advanced) {
//     logger.info("=== PARSE SCHEDULE DETAILS DEBUG ===", {
//       details,
//       advancedGroups: advanced.slice(0),
//     });

//     let everyDays = advanced[1] ? Number(advanced[1]) : 1;
//     let everyIntervalAmount = Number(advanced[2]);
//     let everyIntervalType = advanced[3].toLowerCase();

//     let startH = Number(advanced[4]);
//     let startM = Number(advanced[5]);
//     let startP = advanced[6];
//     let endH = Number(advanced[7]);
//     let endM = Number(advanced[8]);
//     let endP = advanced[9];

//     if (startP === "PM" && startH !== 12) startH += 12;
//     if (startP === "AM" && startH === 12) startH = 0;
//     if (endP === "PM" && endH !== 12) endH += 12;
//     if (endP === "AM" && endH === 12) endH = 0;

//     const startDate = dayjs.tz(
//       `${advanced[12]}-${advanced[11]}-${advanced[10]} 00:00`,
//       tz,
//     );

//     let endDate = null;
//     if (advanced[13] && advanced[14] && advanced[15]) {
//       endDate = dayjs.tz(
//         `${advanced[15]}-${advanced[14]}-${advanced[13]} 23:59`,
//         tz,
//       );
//     }

//     return {
//       type: "ADVANCED",
//       everyDays,
//       everyMinutes:
//         everyIntervalType === "hour"
//           ? everyIntervalAmount * 60
//           : everyIntervalAmount,
//       startH,
//       startM,
//       endH,
//       endM,
//       startDate: startDate.toISOString(),
//       endDate: endDate ? endDate.toISOString() : null,
//       tz,
//     };
//   }

//   return null;
// };

// const parseScheduleFromObject = (scheduleObj, tz = "UTC") => {
//   logger.info("=== PARSE SCHEDULE FROM OBJECT DEBUG ===", {
//     scheduleObj,
//     timezone: tz,
//   });
//   if (!scheduleObj) return null;

//   if (
//     scheduleObj.schedule_type === "R" &&
//     scheduleObj.occurs === "D" &&
//     scheduleObj.daily_freq === "O" &&
//     scheduleObj.occurs_once
//   ) {
//     const occursOnce = dayjs.tz(scheduleObj.occurs_once, tz);
//     const minute = occursOnce.minute();
//     const hour = occursOnce.hour();

//     return {
//       type: "DAILY",
//       cron: `${minute} ${hour} * * *`,
//     };
//   }

//   if (
//     scheduleObj.schedule_type === "R" &&
//     scheduleObj.occurs === "D" &&
//     scheduleObj.daily_freq === "E"
//   ) {
//     let everyMinutes = Number(scheduleObj.occurs_every);
//     if (scheduleObj.occurs_every_hour === "H") {
//       everyMinutes *= 60;
//     }

//     let startH = 0,
//       startM = 0,
//       endH = 23,
//       endM = 59;
//     if (scheduleObj.starting_at) {
//       const startTime = dayjs.tz(scheduleObj.starting_at, tz);
//       startH = startTime.hour();
//       startM = startTime.minute();
//     }
//     if (scheduleObj.ending_at) {
//       const endTime = dayjs.tz(scheduleObj.ending_at, tz);
//       endH = endTime.hour();
//       endM = endTime.minute();
//     }

//     const parsedAdvanced = {
//       type: "ADVANCED",
//       everyMinutes,
//       startDate: scheduleObj.start_date
//         ? dayjs.tz(scheduleObj.start_date, tz).toISOString()
//         : dayjs.tz(dayjs(), tz).toISOString(),
//       everyDays: Number(scheduleObj.recurs_every || 1),
//       startH,
//       startM,
//       endH,
//       endM,
//       tz,
//     };

//     logger.info("=== parseScheduleFromObject final ADVANCED ===", {
//       parsedAdvanced,
//     });

//     return parsedAdvanced;
//   }

//   if (scheduleObj.schedule_type === "O" && scheduleObj.one_time) {
//     const oneTimeDate = dayjs.tz(scheduleObj.one_time, tz).utc();

//     return {
//       type: "ONE",
//       date: oneTimeDate,
//     };
//   }

//   return null;
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
//   if (attachments?.length > 0) payload.attachments = attachments;
//   return payload;
// };

// const startEmailWorker = () => {
//   logger.info("Starting Email Worker...");

//   const concurrency = Number(process.env.EMAIL_WORKER_CONCURRENCY) || 20;
//   const lockDuration = Number(process.env.EMAIL_WORKER_LOCK_DURATION) || 30000;

//   const workerConnection = createWorkerRedis();

//   workerConnection.on("error", (err) =>
//     logger.error("EmailWorker Redis error", { error: err.message }),
//   );
//   workerConnection.on("connect", () =>
//     logger.info("EmailWorker Redis connected"),
//   );
//   workerConnection.on("ready", () => logger.info("EmailWorker Redis ready"));

//   const worker = new Worker(
//     emailQueueName,
//     async (job) => {
//       // ── declare linkExpiryDate here so it's always in scope ──
//       let linkExpiryDate = "9999-12-31";

//       try {
//         if (job.name === "send-email") {
//           logger.info("=== send-email job picked up ===", {
//             jobId: job.id,
//             jobData: job.data,
//           });
//           const { action, smtp, db, advanced } = job.data.payload || job.data;

//           // ── new logic ──
//           // const dedupKey = `email:dedup:job:${job.id}`;
//           // const alreadySent = await workerConnection.get(dedupKey);
//           // if (alreadySent) {
//           //   logger.warn("Duplicate email job detected, skipping", {
//           //     jobId: job.id,
//           //     actionId: action.id,
//           //     database: db,
//           //   });
//           //   return;
//           // }
//           // await workerConnection.set(dedupKey, "1", "EX", 300);

//           const dedupKey = `email:action:${action.id}:${dayjs.utc().format("YYYY-MM-DD-HH-mm")}`;
//           const alreadySent = await workerConnection.get(dedupKey);

//           if (alreadySent) {
//             logger.warn("Duplicate email prevented", {
//               actionId: action.id,
//               dedupKey,
//             });
//             return;
//           }

//           await workerConnection.set(dedupKey, "1", "EX", 120);

//           // ── new logic ─────────────────────────────────────────────────

//           let currentAction = action;
//           try {
//             const token = await getAuthToken(connection, db);
//             if (token) {
//               const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
//               const headers = buildApiHeaders({ bearerToken: token });
//               const response = await axios.get(url, { headers });

//               // if (response.data?.data?.length > 0) {
//               //   const freshActionData = response.data.data[0];
//               //   currentAction = {
//               //     ...action,
//               //     ...freshActionData,
//               //     // Keep schedule_details from original payload (job data)
//               //     schedule_details:
//               //       action.schedule_details || freshActionData.schedule_details,
//               //     m_emailer_action_schedule:
//               //       freshActionData.m_emailer_action_schedule,
//               //     // Make sure is_active is definitely from fresh data
//               //     is_active: freshActionData.is_active,
//               //   };
//               // }

//               if (response.data?.data?.length > 0) {
//                 const freshActionData = response.data.data[0];
//                 logger.info("FRESH_API_RESPONSE", {
//                   actionId: freshActionData.id,
//                   schedule_details: freshActionData.schedule_details,
//                   schedule: freshActionData.m_emailer_action_schedule,
//                 });
//                 currentAction = {
//                   ...action,
//                   ...freshActionData,

//                   // Use latest value from API first
//                   schedule_details:
//                     freshActionData.schedule_details || action.schedule_details,

//                   m_emailer_action_schedule:
//                     freshActionData.m_emailer_action_schedule,

//                   is_active: freshActionData.is_active,
//                 };
//               }
//               //  else if (response.data?.tblData?.length > 0) {
//               //   const freshActionData = response.data.tblData[0];
//               //   currentAction = {
//               //     ...action,
//               //     ...freshActionData,
//               //     // Keep schedule_details from original payload (job data)
//               //     schedule_details:
//               //       action.schedule_details || freshActionData.schedule_details,
//               //     m_emailer_action_schedule:
//               //       freshActionData.m_emailer_action_schedule,
//               //     // Make sure is_active is definitely from fresh data
//               //     is_active: freshActionData.is_active,
//               //   };
//               // }
//               else if (response.data?.tblData?.length > 0) {
//                 const freshActionData = response.data.tblData[0];
//                 currentAction = {
//                   ...action,
//                   ...freshActionData,

//                   schedule_details:
//                     freshActionData.schedule_details || action.schedule_details,

//                   m_emailer_action_schedule:
//                     freshActionData.m_emailer_action_schedule,

//                   is_active: freshActionData.is_active,
//                 };
//               }

//               logger.info("Fetched latest action details", {
//                 actionId: action.id,
//                 database: db,
//                 is_active: currentAction.is_active,
//               });
//             }
//           } catch (err) {
//             logger.warn("Failed to fetch latest action details", {
//               actionId: action.id,
//               database: db,
//               error: err.message,
//             });
//           }

//           if (currentAction?.is_active !== "Y") {
//             logger.info(
//               "Skipping inactive action, removing repeatable job if exists",
//               {
//                 actionId: action.id,
//                 database: db,
//               },
//             );
//             // Remove any repeatable jobs for this action
//             const existingJobs = await emailQueue.getRepeatableJobs();
//             for (const job of existingJobs) {
//               if (
//                 job.key.includes(`${db}-adv-${action.id}`) ||
//                 job.key.includes(`${db}-daily-${action.id}`) ||
//                 job.key.includes(`${db}-weekly-${action.id}`) ||
//                 job.key.includes(`${db}-fallback-${action.id}`)
//               ) {
//                 logger.info(
//                   `Removing repeatable job for inactive action ${action.id}`,
//                   { jobKey: job.key },
//                 );
//                 await emailQueue.removeRepeatableByKey(job.key);
//               }
//             }
//             return;
//           }

//           // Re-parse schedule details from currentAction to get fresh schedule object
//           let currentSchedule = advanced;
//           const tz = currentAction?.timezone || "UTC";
//           let parsed = null;

//           // Try schedule_details first
//           // if (currentAction.schedule_details) {
//           //   parsed = parseScheduleDetails(currentAction.schedule_details, tz);
//           //   logger.info("=== Tried parsing schedule details ===", {
//           //     actionId: currentAction.id,
//           //     hasScheduleDetails: true,
//           //     parsed,
//           //   });
//           // }
//           if (
//             currentAction.m_emailer_action_schedule &&
//             currentAction.m_emailer_action_schedule.length > 0
//           ) {
//             for (const scheduleObj of currentAction.m_emailer_action_schedule) {
//               parsed = parseScheduleFromObject(scheduleObj, tz);
//               if (parsed) break;
//             }
//           }
//           //  else if (currentAction.schedule_details) {
//           //   parsed = parseScheduleDetails(currentAction.schedule_details, tz);
//           // }

//           // // If that didn't work, try m_emailer_action_schedule
//           // if (
//           //   (!parsed ||
//           //     (parsed.type !== "ADVANCED" && parsed.type !== "WEEKLY")) &&
//           //   currentAction.m_emailer_action_schedule &&
//           //   currentAction.m_emailer_action_schedule.length > 0
//           // ) {
//           //   logger.info("=== Trying parseScheduleFromObject ===", {
//           //     actionId: currentAction.id,
//           //   });
//           //   for (const scheduleObj of currentAction.m_emailer_action_schedule) {
//           //     parsed = parseScheduleFromObject(scheduleObj, tz);
//           //     if (parsed) break;
//           //   }
//           // }

//           // First use latest schedule object from API
//           if (
//             currentAction.m_emailer_action_schedule &&
//             currentAction.m_emailer_action_schedule.length > 0
//           ) {
//             logger.info("=== Trying parseScheduleFromObject FIRST ===", {
//               actionId: currentAction.id,
//             });

//             for (const scheduleObj of currentAction.m_emailer_action_schedule) {
//               parsed = parseScheduleFromObject(scheduleObj, tz);
//               if (parsed) break;
//             }
//           }

//           // Fallback to schedule_details only if schedule object parsing failed
//           if (!parsed && currentAction.schedule_details) {
//             logger.info("=== Falling back to parseScheduleDetails ===", {
//               actionId: currentAction.id,
//             });

//             parsed = parseScheduleDetails(currentAction.schedule_details, tz);
//           }

//           if (
//             parsed &&
//             (parsed.type === "ADVANCED" || parsed.type === "WEEKLY")
//           ) {
//             currentSchedule = parsed;
//             logger.info("Re-parsed schedule details from current action", {
//               actionId: currentAction.id,
//               parsed,
//             });
//           }

//           const now = dayjs().tz(tz);
//           logger.info("CURRENT SCHEDULE IN WORKER", {
//             actionId: currentAction.id,
//             currentSchedule,
//           });
//           if (currentSchedule) {
//             if (currentSchedule.type === "ADVANCED") {
//               const startDate = dayjs(currentSchedule.startDate).tz(tz);
//               const endDate = currentSchedule.endDate
//                 ? dayjs(currentSchedule.endDate).tz(tz)
//                 : null;

//               const daysSinceStart = now
//                 .startOf("day")
//                 .diff(startDate.startOf("day"), "day");
//               const modulo = daysSinceStart % currentSchedule.everyDays;
//               logger.info("=== ADVANCED EMAIL DEBUG ===", {
//                 actionId: currentAction.id,
//                 timezone: tz,
//                 nowInTz: now.format(),
//                 startDate: startDate.format(),
//                 endDate: endDate ? endDate.format() : null,
//                 schedule: currentSchedule,
//                 startH: currentSchedule.startH,
//                 startM: currentSchedule.startM,
//                 endH: currentSchedule.endH,
//                 endM: currentSchedule.endM,
//                 daysSinceStart,
//                 everyDays: currentSchedule.everyDays,
//                 modulo: modulo,
//               });

//               if (now.isBefore(startDate, "day")) {
//                 logger.info("Skipping advanced email: before start date", {
//                   actionId: currentAction.id,
//                 });
//                 return;
//               }
//               if (endDate && now.isAfter(endDate, "day")) {
//                 logger.info("Skipping advanced email: after end date", {
//                   actionId: currentAction.id,
//                 });
//                 return;
//               }

//               logger.info("Days since start", {
//                 actionId: currentAction.id,
//                 daysSinceStart,
//                 everyDays: currentSchedule.everyDays,
//                 modulo,
//               });
//               if (
//                 currentSchedule.everyDays > 1 &&
//                 daysSinceStart % currentSchedule.everyDays !== 0
//               ) {
//                 logger.info("Skipping advanced email: not on interval day", {
//                   actionId: currentAction.id,
//                 });
//                 return;
//               }

//               const currentTimeInMins = now.hour() * 60 + now.minute();
//               const startTotalMins =
//                 (currentSchedule.startH ?? 0) * 60 +
//                 (currentSchedule.startM ?? 0);
//               const endTotalMins =
//                 (currentSchedule.endH ?? 23) * 60 +
//                 (currentSchedule.endM ?? 59);

//               logger.info("Time window check", {
//                 actionId: currentAction.id,
//                 currentTimeInMins,
//                 startTotalMins,
//                 endTotalMins,
//               });

//               let shouldSkip;
//               if (startTotalMins <= endTotalMins) {
//                 shouldSkip =
//                   currentTimeInMins < startTotalMins ||
//                   currentTimeInMins > endTotalMins;
//               } else {
//                 shouldSkip =
//                   currentTimeInMins > endTotalMins &&
//                   currentTimeInMins < startTotalMins;
//               }

//               // Check if current time is at the correct interval
//               if (!shouldSkip) {
//                 let timeSinceStart;
//                 if (startTotalMins <= endTotalMins) {
//                   timeSinceStart = currentTimeInMins - startTotalMins;
//                 } else {
//                   // Overnight window
//                   if (currentTimeInMins >= startTotalMins) {
//                     timeSinceStart = currentTimeInMins - startTotalMins;
//                   } else {
//                     timeSinceStart = currentTimeInMins + 1440 - startTotalMins;
//                   }
//                 }
//                 logger.info("INTERVAL CHECK", {
//                   actionId: currentAction.id,
//                   currentTimeInMins,
//                   startTotalMins,
//                   timeSinceStart,
//                   everyMinutes: currentSchedule.everyMinutes,
//                   modulo: timeSinceStart % currentSchedule.everyMinutes,
//                 });

//                 // Check if timeSinceStart is a multiple of everyMinutes
//                 if (timeSinceStart % currentSchedule.everyMinutes !== 0) {
//                   logger.info("Skipping advanced email: not at interval time", {
//                     actionId: currentAction.id,
//                     timeSinceStart,
//                     everyMinutes: currentSchedule.everyMinutes,
//                     modulo: timeSinceStart % currentSchedule.everyMinutes,
//                   });
//                   shouldSkip = true;
//                 }
//               }

//               logger.info("Should skip?", {
//                 actionId: currentAction.id,
//                 shouldSkip,
//               });

//               if (shouldSkip) {
//                 logger.info("Skipping advanced email: outside time window", {
//                   actionId: currentAction.id,
//                 });
//                 return;
//               }
//             } else if (currentSchedule.type === "WEEKLY") {
//               const startDate = dayjs(currentSchedule.startDate).tz(tz);
//               const endDate = currentSchedule.endDate
//                 ? dayjs(currentSchedule.endDate).tz(tz)
//                 : null;

//               logger.info("=== WEEKLY EMAIL DEBUG ===", {
//                 actionId: currentAction.id,
//                 timezone: tz,
//                 nowInTz: now.format(),
//                 startDate: startDate.format(),
//                 endDate: endDate ? endDate.format() : null,
//                 schedule: currentSchedule,
//                 dayOfWeek: currentSchedule.dayOfWeek,
//                 hour: currentSchedule.hour,
//                 minute: currentSchedule.minute,
//               });

//               if (now.isBefore(startDate, "day")) {
//                 logger.info("Skipping weekly email: before start date", {
//                   actionId: currentAction.id,
//                 });
//                 return;
//               }
//               if (endDate && now.isAfter(endDate, "day")) {
//                 logger.info("Skipping weekly email: after end date", {
//                   actionId: currentAction.id,
//                 });
//                 return;
//               }

//               if (now.day() !== currentSchedule.dayOfWeek) {
//                 logger.info("Skipping weekly email: not the correct day", {
//                   actionId: currentAction.id,
//                   todayDay: now.day(),
//                   expectedDay: currentSchedule.dayOfWeek,
//                 });
//                 return;
//               }

//               if (
//                 now.hour() !== currentSchedule.hour ||
//                 now.minute() !== currentSchedule.minute
//               ) {
//                 logger.info("Skipping weekly email: not the correct time", {
//                   actionId: currentAction.id,
//                   currentHour: now.hour(),
//                   currentMinute: now.minute(),
//                   expectedHour: currentSchedule.hour,
//                   expectedMinute: currentSchedule.minute,
//                 });
//                 return;
//               }

//               logger.info("Weekly email checks passed, proceeding", {
//                 actionId: currentAction.id,
//               });
//             }
//           }

//           let queryData = {};
//           const hasQueries =
//             currentAction.query?.trim() ||
//             currentAction.query_1?.trim() ||
//             currentAction.query_2?.trim() ||
//             currentAction.query_3?.trim() ||
//             currentAction.query_4?.trim();

//           if (hasQueries) {
//             try {
//               const token = await getAuthToken(connection, db);
//               queryData = await executeMultipleQueries({
//                 token,
//                 action: currentAction,
//               });
//             } catch (err) {
//               logger.error("Failed to execute queries for action", {
//                 actionId: currentAction.id,
//                 error: err.message,
//               });
//             }
//           }

//           // Handle email_service_type = 'E' - do this BEFORE replaceQueryPlaceholders
//           let toEmails = normalizeRecipients(currentAction.to);
//           let ccEmails = normalizeRecipients(currentAction.cc);
//           let bccEmails = normalizeRecipients(currentAction.bcc);
//           let groupedQueryData = null;

//           let sendPerCustomerEmails = false;
//           let sendAllDataEmailToCcBcc = false;

//           if (
//             currentAction.email_service_type === "E" ||
//             currentAction.emailer_type === "E"
//           ) {
//             logger.info("Handling emailer_type/email_service_type 'E'", {
//               actionId: currentAction.id,
//               emailer_type: currentAction.emailer_type,
//               email_service_type: currentAction.email_service_type,
//             });

//             const rawResults = queryData._rawResults || {};
//             logger.info("Query data _rawResults keys", {
//               actionId: currentAction.id,
//               keys: Object.keys(rawResults),
//             });

//             const firstQueryKey = Object.keys(rawResults).find((k) =>
//               Array.isArray(rawResults[k]),
//             );
//             const tblData = firstQueryKey ? rawResults[firstQueryKey] : [];

//             logger.info("UDF tblData for emailer_type 'E'", {
//               actionId: currentAction.id,
//               firstQueryKey,
//               tblDataLength: tblData.length,
//               tblDataSample: tblData.slice(0, 3),
//             });

//             const cleanRow = (row) => {
//               const cleaned = { ...row };
//               delete cleaned.to_email;
//               delete cleaned.cc_email;
//               delete cleaned.bcc_email;
//               return cleaned;
//             };

//             logger.info("=== Step 1: Cleaning sensitive fields from data ===", {
//               actionId: currentAction.id,
//             });
//             Object.keys(rawResults).forEach((key) => {
//               if (Array.isArray(rawResults[key])) {
//                 rawResults[key] = rawResults[key].map(cleanRow);
//                 if (queryData[key]) {
//                   queryData[key] = rawResults[key];
//                 }
//               }
//             });
//             Object.keys(queryData).forEach((key) => {
//               if (
//                 key.startsWith("query_result_") &&
//                 Array.isArray(queryData[key])
//               ) {
//                 queryData[key] = queryData[key].map(cleanRow);
//               }
//             });
//             logger.info("=== Step 1 complete: Sensitive fields removed ===");

//             logger.info("=== Step 2: Grouping by customer_code ===", {
//               actionId: currentAction.id,
//             });
//             const groupedData = tblData.reduce((acc, row) => {
//               const customerCode = row.customer_code || "";
//               if (!acc[customerCode]) {
//                 acc[customerCode] = {
//                   customer_code: customerCode,
//                   customer_name: row.customer_name || "",
//                   rows: [],
//                   to_email: row.to_email || "",
//                   cc_email: row.cc_email || "",
//                   bcc_email: row.bcc_email || "",
//                   total_bill_amount: 0,
//                   total_paid_amount: 0,
//                   total_balance_amount: 0,
//                   total_bill_amount_sy: 0,
//                   total_paid_amount_sy: 0,
//                   total_balance_amount_sy: 0,
//                 };
//               }
//               const cleanedRow = cleanRow(row);
//               acc[customerCode].rows.push(cleanedRow);
//               if (!acc[customerCode].to_email && row.to_email) {
//                 acc[customerCode].to_email = row.to_email;
//               }
//               if (!acc[customerCode].cc_email && row.cc_email) {
//                 acc[customerCode].cc_email = row.cc_email;
//               }
//               if (!acc[customerCode].bcc_email && row.bcc_email) {
//                 acc[customerCode].bcc_email = row.bcc_email;
//               }
//               acc[customerCode].total_bill_amount += row.bill_amount || 0;
//               acc[customerCode].total_paid_amount += row.paid_amount || 0;
//               acc[customerCode].total_balance_amount += row.balance_amount || 0;
//               acc[customerCode].total_bill_amount_sy += row.bill_amount_sy || 0;
//               acc[customerCode].total_paid_amount_sy += row.paid_amount_sy || 0;
//               acc[customerCode].total_balance_amount_sy +=
//                 row.balance_amount_sy || 0;
//               return acc;
//             }, {});
//             logger.info("Grouped data by customer_code", {
//               actionId: currentAction.id,
//               groupCount: Object.keys(groupedData).length,
//               groups: Object.keys(groupedData),
//             });
//             logger.info("=== Step 2 complete: Grouping done ===");

//             const groupedArray = Object.values(groupedData);
//             const customerSummary = groupedArray.map((group) => ({
//               customer_code: group.customer_code,
//               customer_name: group.customer_name,
//               total_bill_amount: group.total_bill_amount,
//               total_paid_amount: group.total_paid_amount,
//               total_balance_amount: group.total_balance_amount,
//               total_bill_amount_sy: group.total_bill_amount_sy,
//               total_paid_amount_sy: group.total_paid_amount_sy,
//               total_balance_amount_sy: group.total_balance_amount_sy,
//             }));
//             const flattenedCleanData = tblData.map(cleanRow);
//             const groupedForAttachments = groupedArray.map((group) => ({
//               ...group,
//               rows: group.rows,
//             }));

//             queryData.grouped_data = groupedArray;
//             queryData.clean_data = flattenedCleanData;
//             queryData.customer_summary = customerSummary;

//             groupedQueryData = {
//               groupedArray,
//               flattenedCleanData,
//               groupedForAttachments,
//             };

//             sendPerCustomerEmails = true;
//             sendAllDataEmailToCcBcc =
//               toEmails.length > 0 ||
//               ccEmails.length > 0 ||
//               bccEmails.length > 0;
//           }

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

//           const generateAttachments = async (results) => {
//             const attachments = [];
//             const hasQueryData = Object.values(results).some(
//               (d) => d && Array.isArray(d) && d.length > 0,
//             );

//             if (hasQueryData) {
//               const baseFilename =
//                 currentAction.report_filename ||
//                 currentAction.display_name ||
//                 "report";
//               const worksheetType = currentAction.worksheet_type || "S";

//               if (currentAction.is_excel === "Y") {
//                 try {
//                   const excel = await generateExcelBuffer(
//                     results,
//                     baseFilename,
//                     worksheetType,
//                   );
//                   attachments.push({
//                     filename: excel.filename,
//                     content: excel.buffer.toString("base64"),
//                     encoding: "base64",
//                     contentType: excel.mimetype,
//                   });
//                 } catch (err) {
//                   logger.error("Failed to generate Excel attachment", {
//                     actionId: currentAction.id,
//                     error: err.message,
//                   });
//                 }
//               }

//               if (currentAction.is_pdf === "Y") {
//                 try {
//                   const firstKey = Object.keys(results).find((k) =>
//                     Array.isArray(results[k]),
//                   );
//                   const firstData = firstKey ? results[firstKey] : null;
//                   if (firstData?.length > 0) {
//                     const pdf = await generatePdfBuffer(
//                       firstData,
//                       baseFilename,
//                     );
//                     attachments.push({
//                       filename: pdf.filename,
//                       content: pdf.buffer.toString("base64"),
//                       encoding: "base64",
//                       contentType: pdf.mimetype,
//                     });
//                   }
//                 } catch (err) {
//                   logger.error("Failed to generate PDF attachment", {
//                     actionId: currentAction.id,
//                     error: err.message,
//                   });
//                 }
//               }
//             }
//             return attachments;
//           };

//           if (sendPerCustomerEmails && groupedQueryData) {
//             const { groupedArray, flattenedCleanData } = groupedQueryData;
//             const allDataResults = { ...queryData._rawResults };

//             for (const group of groupedArray) {
//               const customerToEmails = normalizeRecipients(group.to_email);
//               if (!customerToEmails.length) {
//                 logger.warn("No to_email for customer, skipping", {
//                   actionId: currentAction.id,
//                   customer_code: group.customer_code,
//                 });
//                 continue;
//               }

//               const customerQueryData = { ...queryData };
//               const customerResults = { ...allDataResults };

//               const customerSummary = [
//                 {
//                   customer_code: group.customer_code,
//                   customer_name: group.customer_name,
//                   total_bill_amount: group.total_bill_amount,
//                   total_paid_amount: group.total_paid_amount,
//                   total_balance_amount: group.total_balance_amount,
//                   total_bill_amount_sy: group.total_bill_amount_sy,
//                   total_paid_amount_sy: group.total_paid_amount_sy,
//                   total_balance_amount_sy: group.total_balance_amount_sy,
//                 },
//               ];

//               const queryResultKeys = Object.keys(customerQueryData).filter(
//                 (k) => k.startsWith("query_result_"),
//               );
//               if (queryResultKeys.length > 0) {
//                 queryResultKeys.forEach((key) => {
//                   customerQueryData[key] = group.rows;
//                 });
//               }
//               Object.keys(customerResults).forEach((key) => {
//                 if (Array.isArray(customerResults[key])) {
//                   customerResults[key] = group.rows;
//                 }
//               });
//               customerQueryData.customer_summary = customerSummary;

//               let customerSubject = subject;
//               let customerTextBody = textBody;
//               let customerHtmlBody = htmlBody;

//               if (Object.keys(customerQueryData).length > 0) {
//                 customerSubject = replaceQueryPlaceholders(
//                   customerSubject,
//                   customerQueryData,
//                 );
//                 customerTextBody = replaceQueryPlaceholders(
//                   customerTextBody,
//                   customerQueryData,
//                 );
//                 customerHtmlBody = replaceQueryPlaceholders(
//                   customerHtmlBody,
//                   customerQueryData,
//                 );
//               }

//               const customerAttachments =
//                 await generateAttachments(customerResults);

//               const customerEmailPayload = {
//                 smtp: {
//                   server: smtp.server || smtp.server_name,
//                   email: smtp.email || smtp.user_name,
//                   password: smtp.password,
//                   port: smtp.port || smtp.port_number,
//                   secure: smtp.secure || smtp.is_ssl === "Y",
//                 },
//                 from: smtp.email_address || smtp.user_name,
//                 to: customerToEmails,
//                 cc: [],
//                 bcc: [],
//                 subject: customerSubject,
//                 text: customerTextBody,
//                 html: customerHtmlBody,
//               };

//               if (customerAttachments.length > 0) {
//                 customerEmailPayload.attachments = customerAttachments;
//               }

//               logger.info("=== Customer-specific email payload ===", {
//                 actionId: currentAction.id,
//                 customer_code: group.customer_code,
//                 from: customerEmailPayload.from,
//                 to: customerEmailPayload.to,
//                 cc: customerEmailPayload.cc,
//                 bcc: customerEmailPayload.bcc,
//                 subject: customerEmailPayload.subject,
//                 hasAttachments: !!customerEmailPayload.attachments,
//                 attachmentsCount: customerEmailPayload.attachments?.length || 0,
//                 attachmentFilenames: customerEmailPayload.attachments?.map(
//                   (a) => a.filename,
//                 ),
//               });

//               logger.info("=== Sending customer-specific email ===", {
//                 actionId: currentAction.id,
//                 customer_code: group.customer_code,
//                 sendEmailUrl: getSendEmailUrl(),
//               });

//               const customerEmailResponse =
//                 await sendEmail(customerEmailPayload);

//               logger.info("=== Customer-specific email response ===", {
//                 actionId: currentAction.id,
//                 customer_code: group.customer_code,
//                 response: customerEmailResponse,
//               });

//               logger.info("Customer-specific email sent successfully", {
//                 actionId: currentAction.id,
//                 customer_code: group.customer_code,
//               });
//             }

//             logger.info("=== Preparing all-data email ===", {
//               actionId: currentAction.id,
//               to: toEmails,
//               cc: ccEmails,
//               bcc: bccEmails,
//             });
//             if (
//               toEmails.length > 0 ||
//               ccEmails.length > 0 ||
//               bccEmails.length > 0
//             ) {
//               logger.info("Sending all-data email to configured To/CC/BCC", {
//                 actionId: currentAction.id,
//                 to: toEmails,
//                 cc: ccEmails,
//                 bcc: bccEmails,
//               });

//               let allDataSubject = subject;
//               let allDataTextBody = textBody;
//               let allDataHtmlBody = htmlBody;

//               if (Object.keys(queryData).length > 0) {
//                 allDataSubject = replaceQueryPlaceholders(
//                   allDataSubject,
//                   queryData,
//                 );
//                 allDataTextBody = replaceQueryPlaceholders(
//                   allDataTextBody,
//                   queryData,
//                 );
//                 allDataHtmlBody = replaceQueryPlaceholders(
//                   allDataHtmlBody,
//                   queryData,
//                 );
//               }

//               const allDataAttachments =
//                 await generateAttachments(allDataResults);

//               const allDataEmailPayload = {
//                 smtp: {
//                   server: smtp.server || smtp.server_name,
//                   email: smtp.email || smtp.user_name,
//                   password: smtp.password,
//                   port: smtp.port || smtp.port_number,
//                   secure: smtp.secure || smtp.is_ssl === "Y",
//                 },
//                 from: smtp.email_address || smtp.user_name,
//                 to: toEmails,
//                 cc: ccEmails,
//                 bcc: bccEmails,
//                 subject: allDataSubject,
//                 text: allDataTextBody,
//                 html: allDataHtmlBody,
//               };

//               if (allDataAttachments.length > 0) {
//                 allDataEmailPayload.attachments = allDataAttachments;
//               }

//               if (
//                 toEmails.length > 0 ||
//                 ccEmails.length > 0 ||
//                 bccEmails.length > 0
//               ) {
//                 try {
//                   logger.info("=== All-data email payload ===", {
//                     actionId: currentAction.id,
//                     from: allDataEmailPayload.from,
//                     to: allDataEmailPayload.to,
//                     cc: allDataEmailPayload.cc,
//                     bcc: allDataEmailPayload.bcc,
//                     subject: allDataEmailPayload.subject,
//                     hasAttachments: !!allDataEmailPayload.attachments,
//                     attachmentsCount:
//                       allDataEmailPayload.attachments?.length || 0,
//                     attachmentFilenames: allDataEmailPayload.attachments?.map(
//                       (a) => a.filename,
//                     ),
//                   });

//                   logger.info("=== Sending all-data email ===", {
//                     actionId: currentAction.id,
//                     sendEmailUrl: getSendEmailUrl(),
//                   });

//                   const allDataEmailResponse =
//                     await sendEmail(allDataEmailPayload);

//                   logger.info("=== All-data email response ===", {
//                     actionId: currentAction.id,
//                     response: allDataEmailResponse,
//                   });

//                   logger.info(
//                     "All-data email sent successfully to configured To/CC/BCC",
//                     {
//                       actionId: currentAction.id,
//                       to: toEmails,
//                       cc: ccEmails,
//                       bcc: bccEmails,
//                     },
//                   );
//                 } catch (emailError) {
//                   logger.error("Error sending all-data email", {
//                     actionId: currentAction.id,
//                     error: emailError.message,
//                     stack: emailError.stack,
//                   });
//                 }
//               }
//             }

//             logger.info("Emailer_type 'E' processing complete", {
//               actionId: currentAction.id,
//               customerCount: groupedArray.length,
//             });
//             return;
//           }

//           // Original behavior for non-E type emails
//           // Log what queryData looks like right before calling replaceQueryPlaceholders
//           logger.info("queryData right before replaceQueryPlaceholders call:", {
//             actionId: currentAction.id,
//             queryDataKeys: Object.keys(queryData),
//             firstQuerySample: (() => {
//               const firstKey = Object.keys(queryData).find((k) =>
//                 k.startsWith("query_result_"),
//               );
//               if (!firstKey || !Array.isArray(queryData[firstKey])) return null;
//               return {
//                 key: firstKey,
//                 sampleFirstRow: queryData[firstKey][0],
//                 sampleFirstRowKeys: Object.keys(queryData[firstKey][0] || {}),
//               };
//             })(),
//           });
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
//             to: toEmails,
//             cc: ccEmails,
//             bcc: bccEmails,
//             subject,
//             text: textBody,
//             html: htmlBody,
//           };

//           const attachments = [];
//           const rawResults = queryData._rawResults || {};
//           const hasQueryData = Object.values(rawResults).some(
//             (d) => d && Array.isArray(d) && d.length > 0,
//           );

//           logger.info("=== Attachment generation debug ===", {
//             actionId: currentAction.id,
//             hasQueryData,
//             is_excel: currentAction.is_excel,
//             is_pdf: currentAction.is_pdf,
//             rawResultsKeys: Object.keys(rawResults),
//             rawResultsValues: Object.values(rawResults).map((v) => ({
//               isArray: Array.isArray(v),
//               length: Array.isArray(v) ? v.length : "N/A",
//               sample: Array.isArray(v) && v.length > 0 ? v[0] : null,
//             })),
//           });

//           if (hasQueryData) {
//             const baseFilename =
//               currentAction.report_filename ||
//               currentAction.display_name ||
//               "report";
//             const worksheetType = currentAction.worksheet_type || "S";

//             if (currentAction.is_excel === "Y") {
//               logger.info("=== Generating Excel attachment ===", {
//                 actionId: currentAction.id,
//               });
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
//                 logger.info("=== Excel attachment generated ===", {
//                   actionId: currentAction.id,
//                   filename: excel.filename,
//                   bufferLength: excel.buffer.length,
//                 });
//               } catch (err) {
//                 logger.error("Failed to generate Excel attachment", {
//                   actionId: currentAction.id,
//                   error: err.message,
//                   stack: err.stack,
//                 });
//               }
//             }

//             if (currentAction.is_pdf === "Y") {
//               logger.info("=== Generating PDF attachment ===", {
//                 actionId: currentAction.id,
//               });
//               try {
//                 const firstKey = Object.keys(rawResults).find((k) =>
//                   Array.isArray(rawResults[k]),
//                 );
//                 const firstData = firstKey ? rawResults[firstKey] : null;
//                 if (firstData?.length > 0) {
//                   const pdf = await generatePdfBuffer(firstData, baseFilename);
//                   attachments.push({
//                     filename: pdf.filename,
//                     content: pdf.buffer.toString("base64"),
//                     encoding: "base64",
//                     contentType: pdf.mimetype,
//                   });
//                   logger.info("=== PDF attachment generated ===", {
//                     actionId: currentAction.id,
//                     filename: pdf.filename,
//                     bufferLength: pdf.buffer.length,
//                   });
//                 } else {
//                   logger.warn("=== No firstData to generate PDF ===", {
//                     actionId: currentAction.id,
//                     firstKey,
//                     firstDataLength: firstData?.length,
//                   });
//                 }
//               } catch (err) {
//                 logger.error("Failed to generate PDF attachment", {
//                   actionId: currentAction.id,
//                   error: err.message,
//                   stack: err.stack,
//                 });
//               }
//             }
//           }

//           logger.info("=== Attachments array ===", {
//             actionId: currentAction.id,
//             attachmentsCount: attachments.length,
//             attachments: attachments.map((a) => ({
//               filename: a.filename,
//               contentType: a.contentType,
//             })),
//           });

//           if (attachments.length > 0) emailPayload.attachments = attachments;

//           logger.info("=== Final email payload ===", {
//             actionId: currentAction.id,
//             hasAttachments: !!emailPayload.attachments,
//             attachmentsCount: emailPayload.attachments?.length || 0,
//             payloadKeys: Object.keys(emailPayload),
//             // Don't log full attachments content (it's huge), just filenames
//             attachmentFilenames: emailPayload.attachments?.map(
//               (a) => a.filename,
//             ),
//             // Log critical details for debugging deliverability
//             from: emailPayload.from,
//             to: emailPayload.to,
//             cc: emailPayload.cc,
//             bcc: emailPayload.bcc,
//             subject: emailPayload.subject,
//           });

//           if (!emailPayload.to.length) {
//             logger.warn("No recipients for action, skipping", {
//               actionId: currentAction.id,
//               database: db,
//             });
//             return;
//           }

//           logger.info("=== Sending email ===", {
//             actionId: currentAction.id,
//             sendEmailUrl: getSendEmailUrl(),
//           });

//           const sendEmailResponse = await sendEmail(emailPayload);

//           logger.info("=== Send email response ===", {
//             actionId: currentAction.id,
//             response: sendEmailResponse,
//           });

//           logger.info("Email sent successfully", {
//             actionId: currentAction.id,
//             database: db,
//           });
//           return;
//         }

//         // ── process-email-trigger ─────────────────────────────────────────────
//         if (job.name === "process-email-trigger") {
//           console.log("=== PROCESS-EMAIL-TRIGGER JOB STARTED ===");
//           console.log("Job data:", job.data);

//           const {
//             Email_Event_Config_Id,
//             ID,
//             dbName,
//             EntityId,
//             ChildId,
//             CombinedIds,
//             domainData: jobDomainData,
//           } = job.data;

//           // ── set linkExpiryDate BEFORE any awaits so catch always has it ──
//           // (will be overwritten below after config is fetched)

//           let token;
//           let domainData = null;
//           try {
//             // Use domainData from job if available, otherwise fetch it
//             if (jobDomainData) {
//               console.log("Using domainData from job:", jobDomainData);
//               domainData = jobDomainData;
//             } else {
//               console.log("Fetching domain data for database:", dbName);
//               domainData = await fetchDomainData(dbName);
//               console.log("Domain data fetched:", domainData);
//             }

//             console.log("Fetching auth token for database:", dbName);
//             token = await getAuthToken(
//               connection,
//               dbName,
//               false,
//               domainData?.BLApiUrl,
//             );
//             if (!token)
//               throw new Error(`Authentication failed for database: ${dbName}`);
//             console.log(`Auth successful for database: ${dbName}`);
//           } catch (authError) {
//             console.error("Auth error:", authError.message);
//             throw new Error(
//               `Cannot process email - authentication failed: ${authError.message}`,
//             );
//           }

//           const baseConfigUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/${Email_Event_Config_Id}`;
//           const configUrl = replaceApiUrlPrefix(
//             baseConfigUrl,
//             domainData?.BLApiUrl,
//           );
//           console.log("Fetching event config from:", configUrl);

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
//               console.warn(`Auth attempt failed: ${error.message}`);
//               return null;
//             }

//             if (!response?.ok) {
//               const altToken = authToken.startsWith("Bearer ")
//                 ? authToken.replace(/^Bearer\s+/i, "")
//                 : `Bearer ${authToken}`;
//               console.log("Trying alternative token format for config fetch");
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

//           let configResponse = await fetchConfig(token);
//           console.log("Config response status:", configResponse?.status);
//           let configData;

//           if (configResponse?.ok) {
//             configData = await configResponse.json();
//             console.log(
//               "Config data received:",
//               JSON.stringify(configData, null, 2),
//             );
//             if (
//               configData.status === 401 ||
//               configData.message?.toLowerCase().includes("unauthorized")
//             ) {
//               console.log("Detected 401 in 200 response, refreshing token...");
//               token = await getAuthToken(
//                 connection,
//                 dbName,
//                 true,
//                 domainData?.BLApiUrl,
//               );
//               configResponse = await fetchConfig(token);
//               if (configResponse?.ok) configData = await configResponse.json();
//             }
//           }

//           if (!configResponse?.ok) {
//             const errorText = configResponse
//               ? await configResponse.text()
//               : "No response";
//             console.error(
//               "Failed to fetch config:",
//               configResponse?.status,
//               errorText,
//             );
//             throw new Error(
//               `Failed to fetch event configuration: ${configResponse?.status} - ${errorText}`,
//             );
//           }

//           if (!configData?.data?.length || configData.status === 401) {
//             throw new Error(
//               `No configuration found or unauthorized for evnt_id: ${Email_Event_Config_Id}. Message: ${configData?.message}`,
//             );
//           }

//           const config = configData.data[0];
//           console.log("Using config:", JSON.stringify(config, null, 2));

//           // ── Now we have config, set linkExpiryDate properly ──
//           const confirmationReq = config.confirmation_req;
//           const maxExpiryHours = config.max_expiry_hours || 48;

//           if (confirmationReq === "Y") {
//             const expiryTime = new Date();
//             const hoursToAdd = maxExpiryHours === 0 ? 48 : maxExpiryHours;
//             expiryTime.setHours(expiryTime.getHours() + hoursToAdd);
//             linkExpiryDate = expiryTime
//               .toISOString()
//               .slice(0, 19)
//               .replace("T", " ");
//             console.log(`Confirmation required - expiry: ${linkExpiryDate}`);
//           }
//           // else linkExpiryDate stays "9999-12-31" (set above)

//           // ── User email fetch ──────────────────────────────────────────────
//           if (
//             config.email_group === "0" &&
//             config.m_email_event_configurations_user?.length > 0
//           ) {
//             try {
//               const userIds = config.m_email_event_configurations_user
//                 .filter((u) => u.email === "Y")
//                 .map((u) => u.user_id)
//                 .filter(Boolean);
//               console.log("Fetching user emails for IDs:", userIds);

//               if (userIds.length > 0) {
//                 const baseUdfQueryUrl = process.env.UDF_QUERY_URL;
//                 const UDF_QUERY_URL = replaceApiUrlPrefix(
//                   baseUdfQueryUrl,
//                   domainData?.BLApiUrl,
//                 );
//                 const userResponse = await axios.post(
//                   UDF_QUERY_URL,
//                   {
//                     query: `select * from m_user_master where id in (${userIds.join(",")})`,
//                   },
//                   {
//                     headers: {
//                       ...buildApiHeaders({ bearerToken: token }),
//                       "Content-Type": "application/json",
//                     },
//                   },
//                 );

//                 let userData = userResponse.data;
//                 if (typeof userData === "string") {
//                   try {
//                     userData = JSON.parse(userData);
//                   } catch { }
//                 }

//                 const users =
//                   userData?.tblData || userData?.data || userData?.result || [];
//                 console.log("Fetched users:", users);
//                 if (Array.isArray(users) && users.length > 0) {
//                   config.recipients = users
//                     .map((u) => u.email || u.email_address || u.user_email)
//                     .filter(Boolean)
//                     .join(",");
//                   console.log("Set recipients from users:", config.recipients);
//                 }
//               }
//             } catch (userFetchError) {
//               console.error(
//                 "Error fetching user emails:",
//                 userFetchError.message,
//               );
//             }
//           }

//           // if (config.emailer_type === "E") {
//           //   try {
//           //     // local UDF URL just for this block – avoids "before initialization" error
//           //     const emailQueueUrl =
//           //       process.env.UDF_QUERY_URL ||
//           //       "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";

//           //     const emailQueueResponse = await axios.post(
//           //       emailQueueUrl,
//           //       { query: `select * from d_email_queue where id=${ID}` },
//           //       {
//           //         headers: {
//           //           ...buildApiHeaders({ bearerToken: token }),
//           //           "Content-Type": "application/json",
//           //         },
//           //       },
//           //     );

//           //     let emailQueueData = emailQueueResponse.data;
//           //     if (typeof emailQueueData === "string") {
//           //       try {
//           //         emailQueueData = JSON.parse(emailQueueData);
//           //       } catch {}
//           //     }

//           //     const records =
//           //       emailQueueData?.tblData ||
//           //       emailQueueData?.data ||
//           //       emailQueueData?.result ||
//           //       [];

//           //     if (
//           //       Array.isArray(records) &&
//           //       records.length > 0 &&
//           //       records[0].to_email
//           //     ) {
//           //       config.recipients = records[0].to_email;
//           //     }
//           //   } catch (err) {
//           //     console.error(
//           //       "Error fetching email_queue record for emailer_type E:",
//           //       err.message,
//           //     );
//           //   }
//           // }

//           if (config.emailer_type === "E") {
//             try {
//               const baseEmailQueueUrl =
//                 process.env.UDF_QUERY_URL ||
//                 "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";
//               const emailQueueUrl = replaceApiUrlPrefix(
//                 baseEmailQueueUrl,
//                 domainData?.BLApiUrl,
//               );

//               const emailQueueResponse = await axios.post(
//                 emailQueueUrl,
//                 { query: `select * from d_email_queue where id=${ID}` },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );

//               let emailQueueData = emailQueueResponse.data;
//               if (typeof emailQueueData === "string") {
//                 try {
//                   emailQueueData = JSON.parse(emailQueueData);
//                 } catch { }
//               }

//               const records =
//                 emailQueueData?.tblData ||
//                 emailQueueData?.data ||
//                 emailQueueData?.result ||
//                 [];

//               if (Array.isArray(records) && records.length > 0) {
//                 const row = records[0];

//                 if (row.to_email) {
//                   config.recipients = row.to_email;
//                 }

//                 config.cc = "";
//                 config.bcc = "";
//               }
//             } catch (err) {
//               console.error(
//                 "Error fetching email_queue record for emailer_type E:",
//                 err.message,
//               );
//             }
//           }
//           // ── Attachments (declare first) ───────────────────────────────────
//           let attachments = [];
//           const baseUdfQueryUrl =
//             "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";
//           const UDF_QUERY_URL = replaceApiUrlPrefix(
//             baseUdfQueryUrl,
//             domainData?.BLApiUrl,
//           );

//           const parseTblData = (raw) => {
//             let parsed = raw;
//             if (typeof raw === "string") {
//               try {
//                 parsed = JSON.parse(raw);
//               } catch { }
//             }
//             return (
//               parsed?.tblData ||
//               (Array.isArray(parsed) ? parsed : parsed?.data || [])
//             );
//           };

//           if (config.include_layout_pdf === "Y") {
//             try {
//               const emailQueueResponse = await axios.post(
//                 UDF_QUERY_URL,
//                 { query: `select * from d_email_queue where id=${ID}` },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );

//               console.log(
//                 "Email Queue API response:",
//                 JSON.stringify(emailQueueResponse.data, null, 2),
//               );

//               let emailQueueData = emailQueueResponse.data;
//               if (typeof emailQueueData === "string") {
//                 try {
//                   emailQueueData = JSON.parse(emailQueueData);
//                 } catch { }
//               }

//               const records =
//                 emailQueueData?.tblData ||
//                 emailQueueData?.data ||
//                 emailQueueData?.result ||
//                 [];
//               console.log("Email Queue records:", records);
//               if (
//                 Array.isArray(records) &&
//                 records.length > 0 &&
//                 records[0].to_email
//               ) {
//                 console.log("Original config.recipients:", config.recipients);
//                 config.recipients = records[0].to_email;
//                 console.log("Updated config.recipients:", config.recipients);
//               }
//             } catch (err) {
//               console.error("Error fetching email_queue record:", err.message);
//             }

//             try {
//               const object_type = config.object_type || config.event_name;
//               const baseLayoutPdfUrl =
//                 "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/ReportViewer/Home/GetLayoutInPDF";
//               const layoutPdfUrl = replaceApiUrlPrefix(
//                 baseLayoutPdfUrl,
//                 domainData?.BLApiUrl,
//               );

//               const url = new URL(layoutPdfUrl);
//               url.searchParams.append("object_type", object_type);
//               url.searchParams.append("database", dbName);
//               url.searchParams.append("token", token);
//               url.searchParams.append("id", EntityId.toString());

//               console.log(`Fetching layout PDF from: ${url.toString()}`);

//               const pdfResponse = await axios.get(url.toString(), {
//                 responseType: "arraybuffer",
//               });

//               console.log("Layout PDF response status:", pdfResponse.status);

//               attachments.push({
//                 filename: `Layout_${EntityId}.pdf`,
//                 content: pdfResponse.data.toString("base64"),
//                 encoding: "base64",
//                 contentType:
//                   pdfResponse.headers["content-type"] || "application/pdf",
//               });

//               console.log(
//                 `Successfully fetched and added layout PDF for EntityId: ${EntityId}`,
//               );
//             } catch (pdfErr) {
//               console.error(
//                 "Error fetching layout PDF:",
//                 pdfErr.message,
//                 "Status:",
//                 pdfErr.response?.status,
//               );
//             }
//           }

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

//             if (
//               config.event_name === "d_cf_filemaster_attachment" &&
//               CombinedIds
//             ) {
//               try {
//                 const response = await axios.post(
//                   UDF_QUERY_URL,
//                   {
//                     query: `select top 1 * from d_cf_filemaster_attachment where id in (${CombinedIds}) order by id desc`,
//                   },
//                   {
//                     headers: {
//                       ...buildApiHeaders({ bearerToken: token }),
//                       "Content-Type": "application/json",
//                     },
//                   },
//                 );

//                 const tblData = parseTblData(response.data);

//                 if (tblData.length > 0) {
//                   const containerNo = tblData[0].container_no || "";

//                   console.log("Fetched container_no:", containerNo);

//                   config.title = (config.title || "").replace(
//                     /{{container_no}}/gi,
//                     containerNo,
//                   );

//                   config.msg_body = (config.msg_body || "").replace(
//                     /{{container_no}}/gi,
//                     containerNo,
//                   );
//                 }
//               } catch (err) {
//                 console.error("Error fetching container_no:", err.message);
//               }
//             }
//             const dynamicData = await fetchUdfData({
//               token,
//               tableName: tableNameForPlaceholders,
//               entityId: VL_entityId,
//               blApiUrl: domainData?.BLApiUrl,
//             });
//             if (dynamicData) {
//               config.event_name = replacePlaceholders(
//                 config.event_name,
//                 dynamicData,
//               );
//               config.title = replacePlaceholders(config.title, dynamicData);
//               config.msg_body = replacePlaceholders(
//                 config.msg_body,
//                 dynamicData,
//               );
//             }
//           }

//           if (
//             config.event_name === "d_fm_shipmentorder_cargodetails" &&
//             ChildId
//           ) {
//             try {
//               const resp = await axios.post(
//                 UDF_QUERY_URL,
//                 {
//                   query: `select * FROM ${config.event_name} where id=${ChildId}`,
//                 },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );
//               const tblData = parseTblData(resp.data);
//               if (tblData.length > 0) {
//                 let cdn_url = tblData[0]?.cdn_url
//                   ?.trim()
//                   .replace(/^[\s`"']+/, "")
//                   .replace(/[\s`"']+$/, "");
//                 if (cdn_url) {
//                   const fileResp = await axios.get(cdn_url, {
//                     responseType: "arraybuffer",
//                   });
//                   attachments.push({
//                     filename: `Cargo_Details_${ChildId}.pdf`,
//                     content: fileResp.data.toString("base64"),
//                     encoding: "base64",
//                     contentType:
//                       fileResp.headers["content-type"] || "application/pdf",
//                   });
//                 }
//               }
//             } catch (err) {
//               console.error("Error fetching cargo attachment:", err.message);
//             }
//           }

//           if (
//             (config.event_name === "d_cf_filemaster_attachment" ||
//               config.event_name === "d_fm_shipmentorder_attachment") &&
//             CombinedIds
//           ) {
//             try {
//               console.log(
//                 "Fetching multiple attachments for combined IDs:",
//                 CombinedIds,
//               );
//               const resp = await axios.post(
//                 UDF_QUERY_URL,
//                 {
//                   query: `select * from ${config.event_name} where id in (${CombinedIds})`,
//                 },
//                 {
//                   headers: {
//                     ...buildApiHeaders({ bearerToken: token }),
//                     "Content-Type": "application/json",
//                   },
//                 },
//               );
//               const tblData = parseTblData(resp.data);
//               console.log("Fetched attachment records:", tblData.length);

//               for (const record of tblData) {
//                 let cdn_url = record?.cdn_url
//                   ?.trim()
//                   .replace(/^[\s`"']+/, "")
//                   .replace(/[\s`"']+$/, "");
//                 if (!cdn_url) continue;
//                 try {
//                   console.log("Downloading attachment from:", cdn_url);
//                   const fileResp = await axios.get(cdn_url, {
//                     responseType: "arraybuffer",
//                   });
//                   const ext = (record.file_extension || "").replace(
//                     /^(?!\.)/,
//                     ".",
//                   );
//                   const baseName =
//                     record.file_name || `attachment_${record.id}`;
//                   const finalName = baseName.endsWith(ext)
//                     ? baseName
//                     : `${baseName}${ext}`;
//                   attachments.push({
//                     filename: finalName,
//                     content: fileResp.data.toString("base64"),
//                     encoding: "base64",
//                     contentType:
//                       fileResp.headers["content-type"] ||
//                       "application/octet-stream",
//                   });
//                   console.log("Added attachment:", finalName);
//                 } catch (dlErr) {
//                   console.error(
//                     `Failed to download attachment for record ${record.id}:`,
//                     dlErr.message,
//                   );
//                 }
//               }
//             } catch (err) {
//               console.error(
//                 "Error fetching multiple attachments:",
//                 err.message,
//               );
//             }
//           }

//           console.log(
//             "Current attachments array:",
//             attachments.length,
//             "attachments",
//           );

//           console.log("Fetching SMTP config");
//           const smtp = await fetchSmtpConfig({
//             token,
//             connection,
//             dbName,
//             blApiUrl: domainData?.BLApiUrl,
//           });
//           if (!smtp) throw new Error("SMTP configuration unavailable");
//           console.log("SMTP config received");

//           // Use existing domainData for replacing confirm_link placeholders
//           if (domainData?.url && config.msg_body) {
//             config.msg_body = config.msg_body
//               .replace(/{{confirm_link}}/g, domainData.url)
//               .replace(/{{not_confirm_link}}/g, domainData.url);
//           }

//           const emailPayload = buildEmailPayloadFromConfig(
//             config,
//             smtp,
//             attachments,
//           );
//           // console.log(
//           //   "Built email payload:",
//           //   JSON.stringify(emailPayload, null, 2),
//           // );
//           console.log("Built email payload:", {
//             ...emailPayload,
//             attachments: emailPayload.attachments?.map((a) => ({
//               filename: a.filename,
//               contentType: a.contentType,
//               encoding: a.encoding,
//               contentLength: a.content?.length || 0,
//             })),
//           });

//           if (!emailPayload.to.length) {
//             console.warn(
//               `No recipients for event ${Email_Event_Config_Id}, skipping`,
//             );
//           } else {
//             console.log("Sending email...");
//             await sendEmail(emailPayload);
//             console.log(
//               `Email sent successfully for event ${Email_Event_Config_Id}`,
//             );
//           }

//           console.log("Calling updateEmailQueueStatus with status SENT...");
//           await updateEmailQueueStatus({
//             token,
//             id: ID,
//             email_queue_id: Email_Event_Config_Id,
//             ack_status: "Y",
//             tgr_status: "Y",
//             status: "SENT",
//             dbName,
//             EntityId,
//             ChildId,
//             CombinedIds,
//             link_expiry: linkExpiryDate,
//             response: "Email sent successfully",
//             retry_count: job.attemptsMade,
//             blApiUrl: domainData?.BLApiUrl,
//           });

//           return;
//         }

//         if (job.name === "check-email-queue-status") {
//           logger.info(`Processing check-email-queue-status job ${job.id}`);
//           await processEmailQueueStatus();
//           logger.info(`check-email-queue-status job ${job.id} completed`);
//           return;
//         }

//         logger.warn(`Unhandled job type: ${job.name}`);
//       } catch (err) {
//         console.error(`Job ${job.id} failed:`, err.message);
//         console.error("Stack trace:", err.stack);

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
//             console.log("Updating failure status in updateEmailQueueStatus...");
//             const domainData = await fetchDomainData(dbName);
//             const token = await getAuthToken(
//               connection,
//               dbName,
//               false,
//               domainData?.BLApiUrl,
//             );
//             const isLastAttempt = job.attemptsMade >= 2;
//             await updateEmailQueueStatus({
//               token,
//               id: ID,
//               email_queue_id: Email_Event_Config_Id,
//               ack_status: "Y",
//               status: isLastAttempt ? "FAILED" : "PENDING",
//               dbName,
//               EntityId,
//               ChildId,
//               CombinedIds,
//               link_expiry: linkExpiryDate,
//               response: err.message,
//               retry_count: job.attemptsMade,
//               blApiUrl: domainData?.BLApiUrl,
//             });
//           } catch (ackErr) {
//             console.error("Failed to update failure status:", ackErr.message);
//           }
//         }

//         throw err;
//       }
//     },
//     {
//       connection: workerConnection,
//       concurrency,
//       lockDuration,
//     },
//   );

//   worker.on("completed", (job) =>
//     logger.info("Job completed", { jobId: job.id, jobName: job.name }),
//   );
//   worker.on("failed", (job, err) =>
//     logger.error("Job failed", {
//       jobId: job?.id,
//       jobName: job?.name,
//       error: err.message,
//     }),
//   );
//   worker.on("error", (err) =>
//     logger.error("Worker error", { error: err.message }),
//   );
//   worker.on("stalled", (jobId) => logger.warn("Job stalled", { jobId }));

//   logger.info(`Email Worker started with concurrency: ${concurrency}`);
//   return worker;
// };

// module.exports = { startEmailWorker };


const { Worker, Queue } = require("bullmq");
const IORedis = require("ioredis");
const { connection } = require("../bullmq");
const emailQueueName = process.env.EMAIL_QUEUE_NAME || "email-scheduler";

const emailQueue = new Queue(emailQueueName, { connection });
const {
  sendEmail,
  getSendEmailUrl,
} = require("../services/emailSenderService");
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
const {
  fetchDomainData,
  replaceApiUrlPrefix,
} = require("../services/urlService");
const axios = require("axios");
const logger = require("../utils/logger");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { query } = require("winston");
dayjs.extend(utc);
dayjs.extend(timezone);

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

  const advanced =
    details.match(
      /(?:occurs\s*)?every\s*(?:(\d+)\s*day\(s\)|day)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
    ) ||
    details.match(
      /(?:occurs\s*)?every\s*(?:(\d+)\s*day\(s\)|day)every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
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

          // ── new logic ──
          // const dedupKey = `email:dedup:job:${job.id}`;
          // const alreadySent = await workerConnection.get(dedupKey);
          // if (alreadySent) {
          //   logger.warn("Duplicate email job detected, skipping", {
          //     jobId: job.id,
          //     actionId: action.id,
          //     database: db,
          //   });
          //   return;
          // }
          // await workerConnection.set(dedupKey, "1", "EX", 300);

          const dedupKey = `email:action:${action.id}:${dayjs.utc().format("YYYY-MM-DD-HH-mm")}`;
          const alreadySent = await workerConnection.get(dedupKey);

          if (alreadySent) {
            logger.warn("Duplicate email prevented", {
              actionId: action.id,
              dedupKey,
            });
            return;
          }

          await workerConnection.set(dedupKey, "1", "EX", 120);

          // ── new logic ─────────────────────────────────────────────────

          let currentAction = action;
          try {
            const token = await getAuthToken(connection, db);
            if (token) {
              const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
              const headers = buildApiHeaders({ bearerToken: token });
              const response = await axios.get(url, { headers });

              // if (response.data?.data?.length > 0) {
              //   const freshActionData = response.data.data[0];
              //   currentAction = {
              //     ...action,
              //     ...freshActionData,
              //     // Keep schedule_details from original payload (job data)
              //     schedule_details:
              //       action.schedule_details || freshActionData.schedule_details,
              //     m_emailer_action_schedule:
              //       freshActionData.m_emailer_action_schedule,
              //     // Make sure is_active is definitely from fresh data
              //     is_active: freshActionData.is_active,
              //   };
              // }

              let freshActionData = null;
              if (Array.isArray(response.data) && response.data.length > 0) {
                freshActionData = response.data[0];
              } else if (response.data?.data?.length > 0) {
                freshActionData = response.data.data[0];
              } else if (response.data?.tblData?.length > 0) {
                freshActionData = response.data.tblData[0];
              } else if (response.data?.items?.length > 0) {
                freshActionData = response.data.items[0];
              } else if (response.data && typeof response.data === 'object' && response.data.id) {
                freshActionData = response.data;
              }

              if (freshActionData) {
                logger.info("FRESH_API_RESPONSE", {
                  actionId: freshActionData.id,
                  schedule_details: freshActionData.schedule_details,
                  schedule: freshActionData.m_emailer_action_schedule,
                });
                currentAction = {
                  ...action,
                  ...freshActionData,
                  schedule_details: freshActionData.schedule_details || action.schedule_details,
                  m_emailer_action_schedule: freshActionData.m_emailer_action_schedule,
                  is_active: freshActionData.is_active,
                };
              } else {
                logger.warn("Could not extract fresh action data from API response", { data: response.data });
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
            logger.info(
              "Skipping inactive action, removing repeatable job if exists",
              {
                actionId: action.id,
                database: db,
              },
            );
            // Remove any repeatable jobs for this action
            const existingJobs = await emailQueue.getRepeatableJobs();
            for (const job of existingJobs) {
              if (
                job.key.includes(`:${db}-adv-${action.id}:`) ||
                job.key.includes(`:${db}-daily-${action.id}:`) ||
                job.key.includes(`:${db}-weekly-${action.id}:`) ||
                job.key.includes(`:${db}-fallback-${action.id}:`)
              ) {
                logger.info(
                  `Removing repeatable job for inactive action ${action.id}`,
                  { jobKey: job.key },
                );
                await emailQueue.removeRepeatableByKey(job.key);
              }
            }
            return;
          }

          // Re-parse schedule details from currentAction to get fresh schedule object
          let currentSchedule = advanced;
          const tz = currentAction?.timezone || "UTC";
          let parsed = null;

          // Try schedule_details first
          // if (currentAction.schedule_details) {
          //   parsed = parseScheduleDetails(currentAction.schedule_details, tz);
          //   logger.info("=== Tried parsing schedule details ===", {
          //     actionId: currentAction.id,
          //     hasScheduleDetails: true,
          //     parsed,
          //   });
          // }
          if (
            currentAction.m_emailer_action_schedule &&
            currentAction.m_emailer_action_schedule.length > 0
          ) {
            for (const scheduleObj of currentAction.m_emailer_action_schedule) {
              parsed = parseScheduleFromObject(scheduleObj, tz);
              if (parsed) break;
            }
          }
          //  else if (currentAction.schedule_details) {
          //   parsed = parseScheduleDetails(currentAction.schedule_details, tz);
          // }

          // // If that didn't work, try m_emailer_action_schedule
          // if (
          //   (!parsed ||
          //     (parsed.type !== "ADVANCED" && parsed.type !== "WEEKLY")) &&
          //   currentAction.m_emailer_action_schedule &&
          //   currentAction.m_emailer_action_schedule.length > 0
          // ) {
          //   logger.info("=== Trying parseScheduleFromObject ===", {
          //     actionId: currentAction.id,
          //   });
          //   for (const scheduleObj of currentAction.m_emailer_action_schedule) {
          //     parsed = parseScheduleFromObject(scheduleObj, tz);
          //     if (parsed) break;
          //   }
          // }

          // First use latest schedule object from API
          if (
            currentAction.m_emailer_action_schedule &&
            currentAction.m_emailer_action_schedule.length > 0
          ) {
            logger.info("=== Trying parseScheduleFromObject FIRST ===", {
              actionId: currentAction.id,
            });

            for (const scheduleObj of currentAction.m_emailer_action_schedule) {
              parsed = parseScheduleFromObject(scheduleObj, tz);
              if (parsed) break;
            }
          }

          // Fallback to schedule_details only if schedule object parsing failed
          if (!parsed && currentAction.schedule_details) {
            logger.info("=== Falling back to parseScheduleDetails ===", {
              actionId: currentAction.id,
            });

            parsed = parseScheduleDetails(currentAction.schedule_details, tz);
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
          logger.info("CURRENT SCHEDULE IN WORKER", {
            actionId: currentAction.id,
            currentSchedule,
          });
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

              // Check if current time is at the correct interval
              if (!shouldSkip) {
                let timeSinceStart;
                if (startTotalMins <= endTotalMins) {
                  timeSinceStart = currentTimeInMins - startTotalMins;
                } else {
                  // Overnight window
                  if (currentTimeInMins >= startTotalMins) {
                    timeSinceStart = currentTimeInMins - startTotalMins;
                  } else {
                    timeSinceStart = currentTimeInMins + 1440 - startTotalMins;
                  }
                }
                logger.info("INTERVAL CHECK", {
                  actionId: currentAction.id,
                  currentTimeInMins,
                  startTotalMins,
                  timeSinceStart,
                  everyMinutes: currentSchedule.everyMinutes,
                  modulo: timeSinceStart % currentSchedule.everyMinutes,
                });

                // Check if timeSinceStart is a multiple of everyMinutes
                if (timeSinceStart % currentSchedule.everyMinutes !== 0) {
                  logger.info("Skipping advanced email: not at interval time", {
                    actionId: currentAction.id,
                    timeSinceStart,
                    everyMinutes: currentSchedule.everyMinutes,
                    modulo: timeSinceStart % currentSchedule.everyMinutes,
                  });
                  shouldSkip = true;
                }
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

              if (now.day() !== currentSchedule.dayOfWeek) {
                logger.info("Skipping weekly email: not the correct day", {
                  actionId: currentAction.id,
                  todayDay: now.day(),
                  expectedDay: currentSchedule.dayOfWeek,
                });
                return;
              }

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

          let sendPerCustomerEmails = false;
          let sendAllDataEmailToCcBcc = false;

          if (
            currentAction.email_service_type === "E" ||
            currentAction.emailer_type === "E"
          ) {
            logger.info("Handling emailer_type/email_service_type 'E'", {
              actionId: currentAction.id,
              emailer_type: currentAction.emailer_type,
              email_service_type: currentAction.email_service_type,
            });

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

            const cleanRow = (row) => {
              const cleaned = { ...row };
              delete cleaned.to_email;
              delete cleaned.cc_email;
              delete cleaned.bcc_email;
              return cleaned;
            };

            logger.info("=== Step 1: Cleaning sensitive fields from data ===", {
              actionId: currentAction.id,
            });
            Object.keys(rawResults).forEach((key) => {
              if (Array.isArray(rawResults[key])) {
                rawResults[key] = rawResults[key].map(cleanRow);
                if (queryData[key]) {
                  queryData[key] = rawResults[key];
                }
              }
            });
            Object.keys(queryData).forEach((key) => {
              if (
                key.startsWith("query_result_") &&
                Array.isArray(queryData[key])
              ) {
                queryData[key] = queryData[key].map(cleanRow);
              }
            });
            logger.info("=== Step 1 complete: Sensitive fields removed ===");

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
                  total_bill_amount: 0,
                  total_paid_amount: 0,
                  total_balance_amount: 0,
                  total_bill_amount_sy: 0,
                  total_paid_amount_sy: 0,
                  total_balance_amount_sy: 0,
                };
              }
              const cleanedRow = cleanRow(row);
              acc[customerCode].rows.push(cleanedRow);
              if (!acc[customerCode].to_email && row.to_email) {
                acc[customerCode].to_email = row.to_email;
              }
              if (!acc[customerCode].cc_email && row.cc_email) {
                acc[customerCode].cc_email = row.cc_email;
              }
              if (!acc[customerCode].bcc_email && row.bcc_email) {
                acc[customerCode].bcc_email = row.bcc_email;
              }
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

            const groupedArray = Object.values(groupedData);
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
            const flattenedCleanData = tblData.map(cleanRow);
            const groupedForAttachments = groupedArray.map((group) => ({
              ...group,
              rows: group.rows,
            }));

            queryData.grouped_data = groupedArray;
            queryData.clean_data = flattenedCleanData;
            queryData.customer_summary = customerSummary;

            groupedQueryData = {
              groupedArray,
              flattenedCleanData,
              groupedForAttachments,
            };

            sendPerCustomerEmails = true;
            sendAllDataEmailToCcBcc =
              toEmails.length > 0 ||
              ccEmails.length > 0 ||
              bccEmails.length > 0;
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

          const generateAttachments = async (results) => {
            const attachments = [];
            const hasQueryData = Object.values(results).some(
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
                    results,
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
                  const firstKey = Object.keys(results).find((k) =>
                    Array.isArray(results[k]),
                  );
                  const firstData = firstKey ? results[firstKey] : null;
                  if (firstData?.length > 0) {
                    const pdf = await generatePdfBuffer(
                      firstData,
                      baseFilename,
                    );
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
            return attachments;
          };

          if (sendPerCustomerEmails && groupedQueryData) {
            const { groupedArray, flattenedCleanData } = groupedQueryData;
            const allDataResults = { ...queryData._rawResults };

            for (const group of groupedArray) {
              const customerToEmails = normalizeRecipients(group.to_email);
              if (!customerToEmails.length) {
                logger.warn("No to_email for customer, skipping", {
                  actionId: currentAction.id,
                  customer_code: group.customer_code,
                });
                continue;
              }

              const customerQueryData = { ...queryData };
              const customerResults = { ...allDataResults };

              const customerSummary = [
                {
                  customer_code: group.customer_code,
                  customer_name: group.customer_name,
                  total_bill_amount: group.total_bill_amount,
                  total_paid_amount: group.total_paid_amount,
                  total_balance_amount: group.total_balance_amount,
                  total_bill_amount_sy: group.total_bill_amount_sy,
                  total_paid_amount_sy: group.total_paid_amount_sy,
                  total_balance_amount_sy: group.total_balance_amount_sy,
                },
              ];

              const queryResultKeys = Object.keys(customerQueryData).filter(
                (k) => k.startsWith("query_result_"),
              );
              if (queryResultKeys.length > 0) {
                queryResultKeys.forEach((key) => {
                  customerQueryData[key] = group.rows;
                });
              }
              Object.keys(customerResults).forEach((key) => {
                if (Array.isArray(customerResults[key])) {
                  customerResults[key] = group.rows;
                }
              });
              customerQueryData.customer_summary = customerSummary;

              let customerSubject = subject;
              let customerTextBody = textBody;
              let customerHtmlBody = htmlBody;

              if (Object.keys(customerQueryData).length > 0) {
                customerSubject = replaceQueryPlaceholders(
                  customerSubject,
                  customerQueryData,
                );
                customerTextBody = replaceQueryPlaceholders(
                  customerTextBody,
                  customerQueryData,
                );
                customerHtmlBody = replaceQueryPlaceholders(
                  customerHtmlBody,
                  customerQueryData,
                );
              }

              const customerAttachments =
                await generateAttachments(customerResults);

              const customerEmailPayload = {
                smtp: {
                  server: smtp.server || smtp.server_name,
                  email: smtp.email || smtp.user_name,
                  password: smtp.password,
                  port: smtp.port || smtp.port_number,
                  secure: smtp.secure || smtp.is_ssl === "Y",
                },
                from: smtp.email_address || smtp.user_name,
                to: customerToEmails,
                cc: [],
                bcc: [],
                subject: customerSubject,
                text: customerTextBody,
                html: customerHtmlBody,
              };

              if (customerAttachments.length > 0) {
                customerEmailPayload.attachments = customerAttachments;
              }

              logger.info("=== Customer-specific email payload ===", {
                actionId: currentAction.id,
                customer_code: group.customer_code,
                from: customerEmailPayload.from,
                to: customerEmailPayload.to,
                cc: customerEmailPayload.cc,
                bcc: customerEmailPayload.bcc,
                subject: customerEmailPayload.subject,
                hasAttachments: !!customerEmailPayload.attachments,
                attachmentsCount: customerEmailPayload.attachments?.length || 0,
                attachmentFilenames: customerEmailPayload.attachments?.map(
                  (a) => a.filename,
                ),
              });

              logger.info("=== Sending customer-specific email ===", {
                actionId: currentAction.id,
                customer_code: group.customer_code,
                sendEmailUrl: getSendEmailUrl(),
              });

              const customerEmailResponse =
                await sendEmail(customerEmailPayload);

              logger.info("=== Customer-specific email response ===", {
                actionId: currentAction.id,
                customer_code: group.customer_code,
                response: customerEmailResponse,
              });

              logger.info("Customer-specific email sent successfully", {
                actionId: currentAction.id,
                customer_code: group.customer_code,
              });
            }

            logger.info("=== Preparing all-data email ===", {
              actionId: currentAction.id,
              to: toEmails,
              cc: ccEmails,
              bcc: bccEmails,
            });
            if (
              toEmails.length > 0 ||
              ccEmails.length > 0 ||
              bccEmails.length > 0
            ) {
              logger.info("Sending all-data email to configured To/CC/BCC", {
                actionId: currentAction.id,
                to: toEmails,
                cc: ccEmails,
                bcc: bccEmails,
              });

              let allDataSubject = subject;
              let allDataTextBody = textBody;
              let allDataHtmlBody = htmlBody;

              if (Object.keys(queryData).length > 0) {
                allDataSubject = replaceQueryPlaceholders(
                  allDataSubject,
                  queryData,
                );
                allDataTextBody = replaceQueryPlaceholders(
                  allDataTextBody,
                  queryData,
                );
                allDataHtmlBody = replaceQueryPlaceholders(
                  allDataHtmlBody,
                  queryData,
                );
              }

              const allDataAttachments =
                await generateAttachments(allDataResults);

              const allDataEmailPayload = {
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
                subject: allDataSubject,
                text: allDataTextBody,
                html: allDataHtmlBody,
              };

              if (allDataAttachments.length > 0) {
                allDataEmailPayload.attachments = allDataAttachments;
              }

              if (
                toEmails.length > 0 ||
                ccEmails.length > 0 ||
                bccEmails.length > 0
              ) {
                try {
                  logger.info("=== All-data email payload ===", {
                    actionId: currentAction.id,
                    from: allDataEmailPayload.from,
                    to: allDataEmailPayload.to,
                    cc: allDataEmailPayload.cc,
                    bcc: allDataEmailPayload.bcc,
                    subject: allDataEmailPayload.subject,
                    hasAttachments: !!allDataEmailPayload.attachments,
                    attachmentsCount:
                      allDataEmailPayload.attachments?.length || 0,
                    attachmentFilenames: allDataEmailPayload.attachments?.map(
                      (a) => a.filename,
                    ),
                  });

                  logger.info("=== Sending all-data email ===", {
                    actionId: currentAction.id,
                    sendEmailUrl: getSendEmailUrl(),
                  });

                  const allDataEmailResponse =
                    await sendEmail(allDataEmailPayload);

                  logger.info("=== All-data email response ===", {
                    actionId: currentAction.id,
                    response: allDataEmailResponse,
                  });

                  logger.info(
                    "All-data email sent successfully to configured To/CC/BCC",
                    {
                      actionId: currentAction.id,
                      to: toEmails,
                      cc: ccEmails,
                      bcc: bccEmails,
                    },
                  );
                } catch (emailError) {
                  logger.error("Error sending all-data email", {
                    actionId: currentAction.id,
                    error: emailError.message,
                    stack: emailError.stack,
                  });
                }
              }
            }

            logger.info("Emailer_type 'E' processing complete", {
              actionId: currentAction.id,
              customerCount: groupedArray.length,
            });
            return;
          }

          // Original behavior for non-E type emails
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
            // Log critical details for debugging deliverability
            from: emailPayload.from,
            to: emailPayload.to,
            cc: emailPayload.cc,
            bcc: emailPayload.bcc,
            subject: emailPayload.subject,
          });

          if (!emailPayload.to.length) {
            logger.warn("No recipients for action, skipping", {
              actionId: currentAction.id,
              database: db,
            });
            return;
          }

          logger.info("=== Sending email ===", {
            actionId: currentAction.id,
            sendEmailUrl: getSendEmailUrl(),
          });

          const sendEmailResponse = await sendEmail(emailPayload);

          logger.info("=== Send email response ===", {
            actionId: currentAction.id,
            response: sendEmailResponse,
          });

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
            domainData: jobDomainData,
          } = job.data;

          // ── set linkExpiryDate BEFORE any awaits so catch always has it ──
          // (will be overwritten below after config is fetched)

          let token;
          let domainData = null;
          try {
            // Use domainData from job if available, otherwise fetch it
            if (jobDomainData) {
              console.log("Using domainData from job:", jobDomainData);
              domainData = jobDomainData;
            } else {
              console.log("Fetching domain data for database:", dbName);
              domainData = await fetchDomainData(dbName);
              console.log("Domain data fetched:", domainData);
            }

            console.log("Fetching auth token for database:", dbName);
            token = await getAuthToken(
              connection,
              dbName,
              false,
              domainData?.BLApiUrl,
            );
            if (!token)
              throw new Error(`Authentication failed for database: ${dbName}`);
            console.log(`Auth successful for database: ${dbName}`);
          } catch (authError) {
            console.error("Auth error:", authError.message);
            throw new Error(
              `Cannot process email - authentication failed: ${authError.message}`,
            );
          }

          const baseConfigUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/${Email_Event_Config_Id}`;
          const configUrl = replaceApiUrlPrefix(
            baseConfigUrl,
            domainData?.BLApiUrl,
          );
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
              token = await getAuthToken(
                connection,
                dbName,
                true,
                domainData?.BLApiUrl,
              );
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
                const baseUdfQueryUrl = process.env.UDF_QUERY_URL;
                const UDF_QUERY_URL = replaceApiUrlPrefix(
                  baseUdfQueryUrl,
                  domainData?.BLApiUrl,
                );
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
                  } catch { }
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

          // if (config.emailer_type === "E") {
          //   try {
          //     // local UDF URL just for this block – avoids "before initialization" error
          //     const emailQueueUrl =
          //       process.env.UDF_QUERY_URL ||
          //       "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";

          //     const emailQueueResponse = await axios.post(
          //       emailQueueUrl,
          //       { query: `select * from d_email_queue where id=${ID}` },
          //       {
          //         headers: {
          //           ...buildApiHeaders({ bearerToken: token }),
          //           "Content-Type": "application/json",
          //         },
          //       },
          //     );

          //     let emailQueueData = emailQueueResponse.data;
          //     if (typeof emailQueueData === "string") {
          //       try {
          //         emailQueueData = JSON.parse(emailQueueData);
          //       } catch {}
          //     }

          //     const records =
          //       emailQueueData?.tblData ||
          //       emailQueueData?.data ||
          //       emailQueueData?.result ||
          //       [];

          //     if (
          //       Array.isArray(records) &&
          //       records.length > 0 &&
          //       records[0].to_email
          //     ) {
          //       config.recipients = records[0].to_email;
          //     }
          //   } catch (err) {
          //     console.error(
          //       "Error fetching email_queue record for emailer_type E:",
          //       err.message,
          //     );
          //   }
          // }

          if (config.emailer_type === "E") {
            try {
              const baseEmailQueueUrl =
                process.env.UDF_QUERY_URL ||
                "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";
              const emailQueueUrl = replaceApiUrlPrefix(
                baseEmailQueueUrl,
                domainData?.BLApiUrl,
              );

              const emailQueueResponse = await axios.post(
                emailQueueUrl,
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
                } catch { }
              }

              const records =
                emailQueueData?.tblData ||
                emailQueueData?.data ||
                emailQueueData?.result ||
                [];

              if (Array.isArray(records) && records.length > 0) {
                const row = records[0];

                if (row.to_email) {
                  config.recipients = row.to_email;
                }

                config.cc = "";
                config.bcc = "";
              }
            } catch (err) {
              console.error(
                "Error fetching email_queue record for emailer_type E:",
                err.message,
              );
            }
          }
          // ── Attachments (declare first) ───────────────────────────────────
          let attachments = [];
          const baseUdfQueryUrl =
            "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";
          const UDF_QUERY_URL = replaceApiUrlPrefix(
            baseUdfQueryUrl,
            domainData?.BLApiUrl,
          );

          const parseTblData = (raw) => {
            let parsed = raw;
            if (typeof raw === "string") {
              try {
                parsed = JSON.parse(raw);
              } catch { }
            }
            return (
              parsed?.tblData ||
              (Array.isArray(parsed) ? parsed : parsed?.data || [])
            );
          };

          if (config.include_layout_pdf === "Y") {
            try {
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

              console.log(
                "Email Queue API response:",
                JSON.stringify(emailQueueResponse.data, null, 2),
              );

              let emailQueueData = emailQueueResponse.data;
              if (typeof emailQueueData === "string") {
                try {
                  emailQueueData = JSON.parse(emailQueueData);
                } catch { }
              }

              const records =
                emailQueueData?.tblData ||
                emailQueueData?.data ||
                emailQueueData?.result ||
                [];
              console.log("Email Queue records:", records);
              if (
                Array.isArray(records) &&
                records.length > 0 &&
                records[0].to_email
              ) {
                console.log("Original config.recipients:", config.recipients);
                config.recipients = records[0].to_email;
                console.log("Updated config.recipients:", config.recipients);
              }
            } catch (err) {
              console.error("Error fetching email_queue record:", err.message);
            }

            try {
              const object_type = config.object_type || config.event_name;
              const baseLayoutPdfUrl =
                "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/ReportViewer/Home/GetLayoutInPDF";
              const layoutPdfUrl = replaceApiUrlPrefix(
                baseLayoutPdfUrl,
                domainData?.BLApiUrl,
              );

              const url = new URL(layoutPdfUrl);
              url.searchParams.append("object_type", object_type);
              url.searchParams.append("database", dbName);
              url.searchParams.append("token", token);
              url.searchParams.append("id", EntityId.toString());

              console.log(`Fetching layout PDF from: ${url.toString()}`);

              const pdfResponse = await axios.get(url.toString(), {
                responseType: "arraybuffer",
              });

              console.log("Layout PDF response status:", pdfResponse.status);

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

            if (
              config.event_name === "d_cf_filemaster_attachment" &&
              CombinedIds
            ) {
              try {
                const response = await axios.post(
                  UDF_QUERY_URL,
                  {
                    query: `select top 1 * from d_cf_filemaster_attachment where id in (${CombinedIds}) order by id desc`,
                  },
                  {
                    headers: {
                      ...buildApiHeaders({ bearerToken: token }),
                      "Content-Type": "application/json",
                    },
                  },
                );

                const tblData = parseTblData(response.data);

                if (tblData.length > 0) {
                  const containerNo = tblData[0].container_no || "";
                  const remarks = tblData[0].remarks || "";

                  console.log("Fetched container_no:", containerNo, "remarks:", remarks);

                  config.title = (config.title || "")
                    .replace(/{{container_no}}/gi, containerNo)
                    .replace(/{{remarks}}/gi, remarks);

                  config.msg_body = (config.msg_body || "")
                    .replace(/{{container_no}}/gi, containerNo)
                    .replace(/{{remarks}}/gi, remarks);


                }
              } catch (err) {
                console.error("Error fetching container_no and remarks:", err.message);
              }
            }
            const dynamicData = await fetchUdfData({
              token,
              tableName: tableNameForPlaceholders,
              entityId: VL_entityId,
              blApiUrl: domainData?.BLApiUrl,
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

          console.log("Fetching SMTP config");
          const smtp = await fetchSmtpConfig({
            token,
            connection,
            dbName,
            blApiUrl: domainData?.BLApiUrl,
          });
          if (!smtp) throw new Error("SMTP configuration unavailable");
          console.log("SMTP config received");

          // Use existing domainData for replacing confirm_link placeholders
          if (domainData?.url && config.msg_body) {
            config.msg_body = config.msg_body
              .replace(/{{confirm_link}}/g, domainData.url)
              .replace(/{{not_confirm_link}}/g, domainData.url);
          }

          const emailPayload = buildEmailPayloadFromConfig(
            config,
            smtp,
            attachments,
          );
          // console.log(
          //   "Built email payload:",
          //   JSON.stringify(emailPayload, null, 2),
          // );
          console.log("Built email payload:", {
            ...emailPayload,
            attachments: emailPayload.attachments?.map((a) => ({
              filename: a.filename,
              contentType: a.contentType,
              encoding: a.encoding,
              contentLength: a.content?.length || 0,
            })),
          });

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
            blApiUrl: domainData?.BLApiUrl,
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
            const domainData = await fetchDomainData(dbName);
            const token = await getAuthToken(
              connection,
              dbName,
              false,
              domainData?.BLApiUrl,
            );
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
              link_expiry: linkExpiryDate,
              response: err.message,
              retry_count: job.attemptsMade,
              blApiUrl: domainData?.BLApiUrl,
            });
          } catch (ackErr) {
            console.error("Failed to update failure status:", ackErr.message);
          }
        }

        throw err;
      }
    },
    {
      connection: workerConnection,
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
  return worker;
};

module.exports = { startEmailWorker };
