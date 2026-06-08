// const { Queue } = require("bullmq");
// const { connection, emailQueueName } = require("../bullmq");
// const {
//   fetchSchedulerActions,
//   buildActionApiHeaders,
// } = require("../services/emailerActionService");
// const axios = require("axios");
// const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
// const { getAuthToken } = require("../services/apiAuthService");
// const logger = require("../utils/logger");

// const dayjs = require("dayjs");
// const utc = require("dayjs/plugin/utc");
// const timezone = require("dayjs/plugin/timezone");

// dayjs.extend(utc);
// dayjs.extend(timezone);

// const emailQueue = new Queue(emailQueueName, { connection });

// //config
// const DB_API =
//   "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";

// const LOGIN_API =
//   "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/auth/Login";
// const POLL_INTERVAL = 15000;
// const USERNAME = process.env.LOGIN_USERNAME || "fin1";
// const PASSWORD = process.env.LOGIN_PASSWORD || "123456";
// const BATCH_SIZE = Number(process.env.SCHEDULER_BATCH_SIZE) || 10;

// //cache keys
// const TOKEN_CACHE_KEY_PREFIX = "scheduler:token:";

// //helper
// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// const normalizeRecipients = (val) =>
//   val
//     ? val
//         .split(/[;,]/)
//         .map((v) => v.trim())
//         .filter(Boolean)
//     : [];

// //token
// const getToken = async (db) => {
//   try {
//     const token = await getAuthToken(connection, db);
//     return token;
//   } catch {
//     // logger.warn(`Login failed for database: ${db}`);
//     return null;
//   }
// };

// // fetch db
// const fetchAllDatabases = async (retries = 3) => {
//   let lastError = null;

//   for (let i = 0; i < retries; i++) {
//     try {
//       const response = await axios.get(DB_API, { timeout: 30000 });
//       const databases = response.data?.data || [];
//       const dbNames = databases.map((db) => db.DBName).filter(Boolean);

//       const uniqueDbNames = [...new Set(dbNames)];

//       logger.info(`Fetched ${uniqueDbNames.length} databases`, {
//         databases: uniqueDbNames,
//       });
//       return uniqueDbNames;
//     } catch (err) {
//       lastError = err;
//       logger.warn(
//         `Fetch databases attempt ${i + 1}/${retries} failed:`,
//         err.message,
//       );

//       if (i < retries - 1) {
//         await sleep(2000 * (i + 1));
//       }
//     }
//   }

//   logger.error("Error fetching databases after retries", {
//     error: lastError?.message,
//   });
//   return ["DCCBusinessSuite_mowara_test"];
// };

// //parser
// const parseScheduleDetails = (details, tz = "UTC") => {
//   logger.debug("Parsing schedule details", { details, timezone: tz });
//   if (!details || typeof details !== "string") return null;

//   const one = details.match(
//     /occurs on (\d{2})\/(\d{2})\/(\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)/i,
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

//   const daily = details.match(/every day at (\d{1,2}):(\d{2}) (AM|PM)/i);

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

//   // const advanced =
//   //   details.match(
//   //     /every\s*(\d+)\s*day\(s\)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*starting on\s*(\d{2})\/(\d{2})\/(\d{4})/i,
//   //   ) ||
//   //   details.match(
//   //     /every\s*(\d+)\s*day\(s\)every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*starting on\s*(\d{2})\/(\d{2})\/(\d{4})/i,
//   //   );

//   const advanced = details.match(
//     /every\s*(?:(\d+)\s*day\(s\)|day)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
//   );

//   if (advanced) {
//     logger.info("=== PARSE SCHEDULE DETAILS DEBUG ===", {
//       details,
//       advancedGroups: advanced.slice(0),
//     });

//     let everyDays = advanced[1] ? Number(advanced[1]) : 1;
//     // let everyDays = Number(advanced[1]);
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

// const parseScheduleFromObject = (scheduleObj, tz = process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata") => {
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

//     // Parse starting_at and ending_at to get startH/startM/endH/endM
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

//     return {
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

// const parseScheduleTime = (timeStr) => {
//   if (!timeStr) return null;

//   const [h, m] = timeStr.split(":").map(Number);
//   if (isNaN(h) || isNaN(m)) return null;

//   return `${m} ${h} * * *`;
// };

// //job
// const addRepeatJob = async (payload, cron, jobId) => {
//   const existing = await emailQueue.getRepeatableJobs();
//   for (const j of existing) {
//     if (j.key && j.key.includes(jobId)) {
//       logger.info(`Removing old repeatable job`, { jobId, pattern: j.pattern });
//       await emailQueue.removeRepeatableByKey(j.key);
//     }
//   }

//   await emailQueue.add("send-email", payload, {
//     repeat: { cron, tz: "UTC" },
//     jobId,
//   });

//   logger.info(`Scheduled job`, { jobId });
// };

// //main
// const startSchedulerPolling = () => {
//   logger.info("Scheduler started");

//   setInterval(async () => {
//     try {
//       const dbs = await fetchAllDatabases();

//       let allTenants = [];
//       let smtpToken = null;

//       for (let i = 0; i < dbs.length; i += BATCH_SIZE) {
//         const batch = dbs.slice(i, i + BATCH_SIZE);

//         const tenants = await Promise.all(
//           batch.map(async (db) => {
//             const token = await getToken(db);
//             if (!token) return null;

//             try {
//               const listRes = await fetchSchedulerActions(undefined, token);
//               logger.debug(`Fetched scheduler actions for database`, {
//                 database: db,
//                 response: listRes,
//               });
//               if (listRes && !smtpToken) {
//                 smtpToken = token;
//                 logger.info(`Set SMTP token for database`, { database: db });
//               }

//               const actionsWithDetails = await Promise.allSettled(
//                 (listRes.raw?.tblData || []).map(async (action) => {
//                   try {
//                     const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
//                     const headers = buildActionApiHeaders(token);
//                     const response = await axios.get(url, { headers });

//                     let actionData = null;
//                     if (
//                       response.data?.data &&
//                       Array.isArray(response.data.data) &&
//                       response.data.data.length > 0
//                     ) {
//                       actionData = response.data.data[0];
//                     } else if (
//                       response.data?.tblData &&
//                       Array.isArray(response.data.tblData) &&
//                       response.data.tblData.length > 0
//                     ) {
//                       actionData = response.data.tblData[0];
//                     }

//                     return actionData || action;
//                   } catch (err) {
//                     logger.warn(`Failed to fetch complete details for action`, {
//                       actionId: action.id,
//                       error: err.message,
//                     });
//                     return action;
//                   }
//                 }),
//               );

//               const validActions = actionsWithDetails
//                 .filter((result) => result.status === "fulfilled")
//                 .map((result) => result.value);

//               logger.info(`Fetched complete actions for database`, {
//                 database: db,
//                 count: validActions.length,
//               });

//               return {
//                 db,
//                 res: {
//                   ...listRes,
//                   items: validActions,
//                   raw: { ...listRes.raw, tblData: validActions },
//                 },
//                 token,
//               };
//             } catch {
//               return null;
//             }
//           }),
//         );

//         const validTenants = tenants.filter(Boolean);
//         allTenants.push(...validTenants);

//         await sleep(500);
//       }

//       const smtp = await fetchSmtpConfig({
//         token: smtpToken,
//         connection,
//         dbName: allTenants.length > 0 ? allTenants[0].db : null,
//       });

//       if (!smtp?.email_address) {
//         logger.warn("No SMTP config found");
//         return;
//       }

//       const activeJobKeys = new Set();

//       for (const { db, res } of allTenants) {
//         const actions = res.raw?.tblData || [];

//         for (const action of actions) {
//           logger.info(`Checking action`, {
//             actionId: action.id,
//             is_active: action.is_active,
//             database: db,
//           });

//           if (action.is_active !== "Y") {
//             logger.info(`Skipping inactive action`, {
//               actionId: action.id,
//               database: db,
//             });
//             continue;
//           }
//           const to = normalizeRecipients(action.to);
//           if (!to.length) continue;

//           const payload = { action, smtp, db };
//           const tz = action.timezone || "UTC";

//           let parsed = null;
//           try {
//             if (action.schedule_details && action.schedule_details.trim()) {
//               parsed = parseScheduleDetails(action.schedule_details, tz);
//             }

//             if (
//               !parsed &&
//               action.m_emailer_action_schedule &&
//               action.m_emailer_action_schedule.length > 0
//             ) {
//               for (const scheduleObj of action.m_emailer_action_schedule) {
//                 parsed = parseScheduleFromObject(scheduleObj, tz);
//                 if (parsed) break;
//               }
//             }

//             if (!parsed && action.schedule_time) {
//               const cron = parseScheduleTime(action.schedule_time);
//               if (cron) {
//                 parsed = { type: "DAILY", cron };
//               }
//             }
//           } catch (err) {
//             parsed = null;
//           }

//           if (parsed) {
//             if (parsed.type === "ONE") {
//               const delay = parsed.date.diff(dayjs.utc());
//               const jobId = `${db}-one-${action.id}-${parsed.date.valueOf()}`;
//               const redisKey = `scheduler:one-time:${jobId}`;

//               // Check if we've already scheduled this one-time job
//               const alreadyScheduled = await connection.get(redisKey);
//               if (alreadyScheduled) {
//                 logger.debug(`One-time job already scheduled`, { jobId });
//                 continue;
//               }

//               if (delay < -1800000) continue;

//               const exists = await emailQueue.getJob(jobId);
//               if (exists) {
//                 logger.debug(`One-time job already exists in queue`, { jobId });
//                 continue;
//               }

//               await emailQueue.add("send-email", payload, {
//                 delay: Math.max(delay, 0),
//                 jobId,
//                 removeOnComplete: true,
//                 removeOnFail: true,
//               });

//               // Mark the job as scheduled in Redis with TTL set to 24 hours after the scheduled date
//               const ttl = Math.max(
//                 86400,
//                 Math.floor((parsed.date.valueOf() - Date.now()) / 1000) + 86400,
//               );
//               await connection.set(redisKey, "1", "EX", ttl);

//               logger.info(`Scheduled one-time email`, {
//                 actionId: action.id,
//                 database: db,
//                 jobId,
//               });
//               continue;
//             }
//             if (parsed.type === "ADVANCED") {
//               const jobKey = `${db}-adv-${action.id}`;
//               activeJobKeys.add(jobKey);
//               await addRepeatJob(
//                 { ...payload, advanced: parsed },
//                 `*/${parsed.everyMinutes} * * * *`,
//                 jobKey,
//               );

//               logger.info(`Scheduled advanced email`, {
//                 actionId: action.id,
//                 database: db,
//               });
//               continue;
//             }
//             if (parsed.type === "DAILY") {
//               const now = dayjs.utc();
//               let shouldSchedule = true;
//               const startDateMatch =
//                 action.schedule_details &&
//                 typeof action.schedule_details === "string"
//                   ? action.schedule_details.match(
//                       /starting on (\d{2})\/(\d{2})\/(\d{4})/i,
//                     )
//                   : null;
//               const endDateMatch =
//                 action.schedule_details &&
//                 typeof action.schedule_details === "string"
//                   ? action.schedule_details.match(
//                       /ending on (\d{2})\/(\d{2})\/(\d{4})/i,
//                     )
//                   : null;

//               if (startDateMatch) {
//                 const startDate = dayjs
//                   .tz(
//                     `${startDateMatch[3]}-${startDateMatch[2]}-${startDateMatch[1]} 00:00`,
//                     "UTC",
//                   )
//                   .utc();
//                 if (now.isBefore(startDate)) {
//                   shouldSchedule = false;
//                 }
//               }

//               if (endDateMatch && shouldSchedule) {
//                 const endDate = dayjs
//                   .tz(
//                     `${endDateMatch[3]}-${endDateMatch[2]}-${endDateMatch[1]} 23:59`,
//                     "UTC",
//                   )
//                   .utc();
//                 if (now.isAfter(endDate)) {
//                   shouldSchedule = false;
//                 }
//               }

//               if (shouldSchedule) {
//                 const jobKey = `${db}-daily-${action.id}`;
//                 activeJobKeys.add(jobKey);
//                 await addRepeatJob(payload, parsed.cron, jobKey);
//               }
//               continue;
//             }
//           }

//           if (
//             !action.schedule_details ||
//             action.schedule_details.trim() === ""
//           ) {
//             const cron = parseScheduleTime(action.schedule_time);
//             if (cron) {
//               const jobKey = `${db}-fallback-${action.id}`;
//               activeJobKeys.add(jobKey);
//               await addRepeatJob(payload, cron, jobKey);
//               continue;
//             }
//           }
//         }
//       }

//       const existingJobs = await emailQueue.getRepeatableJobs();
//       logger.info(`Checking ${existingJobs.length} existing repeatable jobs`, {
//         activeJobKeys: Array.from(activeJobKeys),
//         existingJobKeys: existingJobs.map((j) => j.key),
//       });
//       for (const job of existingJobs) {
//         const jobKey = job.key;
//         if (!jobKey) continue;

//         if (
//           job.name === "check-email-queue-status" ||
//           job.name === "send-daily-email"
//         ) {
//           continue;
//         }

//         if (
//           jobKey.includes("-adv-") ||
//           jobKey.includes("-daily-") ||
//           jobKey.includes("-fallback-")
//         ) {
//           let isActive = false;
//           for (const activeJobId of activeJobKeys) {
//             if (jobKey.includes(activeJobId)) {
//               isActive = true;
//               break;
//             }
//           }
//           if (!isActive) {
//             logger.info(`Removing inactive job`, { jobKey });
//             await emailQueue.removeRepeatableByKey(job.key);
//           } else {
//             logger.debug(`Keeping active job`, { jobKey });
//           }
//         }
//       }
//     } catch (err) {
//       logger.error("Scheduler error", { error: err.message, stack: err.stack });
//     }
//   }, POLL_INTERVAL);
// };

// module.exports = { startSchedulerPolling };

const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const {
  fetchSchedulerActions,
  buildActionApiHeaders,
} = require("../services/emailerActionService");
const axios = require("axios");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
const { getAuthToken } = require("../services/apiAuthService");
const logger = require("../utils/logger");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const emailQueue = new Queue(emailQueueName, { connection });
//new logic
let isPolling = false;
const scheduledJobCache = new Map();
//new logic

//config
const DB_API =
  process.env.DATABASES_API_URL ||
  "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";

const LOGIN_API =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/auth/Login";
const POLL_INTERVAL = 15000;
const USERNAME = process.env.LOGIN_USERNAME || "fin1";
const PASSWORD = process.env.LOGIN_PASSWORD || "123456";
const BATCH_SIZE = Number(process.env.SCHEDULER_BATCH_SIZE) || 10;

//cache keys
const TOKEN_CACHE_KEY_PREFIX = "scheduler:token:";

//helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeRecipients = (val) =>
  val
    ? val
        .split(/[;,]/)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

//token
const getToken = async (db) => {
  try {
    const token = await getAuthToken(connection, db);
    return token;
  } catch {
    return null;
  }
};

// fetch db
const fetchAllDatabases = async (retries = 3) => {
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(DB_API, { timeout: 30000 });
      const databases = response.data?.data || [];

      // Filter databases where email_service_type is 'N'
      const filteredDatabases = databases.filter(
        (db) => db.email_service_type === "N",
      );

      const dbNames = filteredDatabases.map((db) => db.DBName).filter(Boolean);

      const uniqueDbNames = [...new Set(dbNames)];

      logger.info(
        `Fetched ${databases.length} total databases, filtered to ${uniqueDbNames.length} with email_service_type = 'N'`,
        {
          allDatabases: databases.map((db) => ({
            name: db.DBName,
            serviceType: db.email_service_type,
          })),
          filteredDatabases: uniqueDbNames,
        },
      );
      return uniqueDbNames;
    } catch (err) {
      lastError = err;
      logger.warn(
        `Fetch databases attempt ${i + 1}/${retries} failed:`,
        err.message,
      );

      if (i < retries - 1) {
        await sleep(2000 * (i + 1));
      }
    }
  }

  logger.error("Error fetching databases after retries", {
    error: lastError?.message,
  });
  return ["DCCBusinessSuite_mowara_test"];
};

//parser
const parseScheduleDetails = (details, tz = "UTC") => {
  logger.debug("Parsing schedule details", { details, timezone: tz });
  if (!details || typeof details !== "string") return null;

  const one = details.match(
    // /occurs on (\d{2})\/(\d{2})\/(\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)/i,
    // /(?:occurs\s+)?on (\d{2})\/(\d{2})\/(\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)/i,

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

  // const daily = details.match(/every day at (\d{1,2}):(\d{2}) (AM|PM)/i);
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

    logger.info("ADVANCED REGEX GROUPS", {
      amount: advanced[2],
      type: advanced[3],
      allGroups: advanced.slice(0),
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

const parseScheduleTime = (timeStr) => {
  if (!timeStr) return null;

  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;

  return `${m} ${h} * * *`;
};

//job
// const addRepeatJob = async (payload, cron, jobId) => {
//   const existing = await emailQueue.getRepeatableJobs();

//   for (const j of existing) {
//     if (j.key && j.key.includes(jobId)) {
//       console.log(j);

//       logger.info(`Removing old repeatable job`, { jobId, pattern: j.pattern });
//       await emailQueue.removeRepeatableByKey(j.key);
//     }
//   }

//   await emailQueue.add("send-email", payload, {
//     repeat: { cron, tz: "UTC" },
//     jobId,
//   });

//   logger.info(`Scheduled job`, { jobId });
// };

//job
//new logic
const addRepeatJob = async (payload, cron, jobId) => {
  if (scheduledJobCache.get(jobId) === cron) {
    logger.debug(`Job already scheduled with same cron, skipping`, {
      jobId,
      cron,
    });
    return;
  }

  const existing = await emailQueue.getRepeatableJobs();
  for (const j of existing) {
    if (j.key && j.key.includes(jobId)) {
      logger.info(`Removing old repeatable job`, { jobId, pattern: j.pattern });
      await emailQueue.removeRepeatableByKey(j.key);
    }
  }

  await emailQueue.add("send-email", payload, {
    repeat: { cron, tz: "UTC" },
    jobId,
  });

  scheduledJobCache.set(jobId, cron);
  logger.info(`Scheduled job`, { jobId, cron });
};
//new logic

//main polling logic
const pollScheduler = async () => {
  // ── new logic ──
  if (isPolling) {
    logger.warn("Previous poll still running, skipping this cycle");
    return;
  }
  isPolling = true;
  // new logic
  try {
    const dbs = await fetchAllDatabases();

    let allTenants = [];
    let smtpToken = null;

    for (let i = 0; i < dbs.length; i += BATCH_SIZE) {
      const batch = dbs.slice(i, i + BATCH_SIZE);

      const tenants = await Promise.all(
        batch.map(async (db) => {
          const token = await getToken(db);
          if (!token) return null;

          try {
            const listRes = await fetchSchedulerActions(undefined, token);
            logger.debug(`Fetched scheduler actions for database`, {
              database: db,
              response: listRes,
            });
            if (listRes && !smtpToken) {
              smtpToken = token;
              logger.info(`Set SMTP token for database`, { database: db });
            }

            logger.info("=== Initial list actions with schedule details ===", {
              database: db,
              actions: (listRes.raw?.tblData || []).map((a) => ({
                id: a.id,
                hasScheduleDetails: !!a.schedule_details,
                scheduleDetails: a.schedule_details,
              })),
            });

            const actionsWithDetails = await Promise.allSettled(
              (listRes.raw?.tblData || []).map(async (action) => {
                logger.info(`=== Initial action data for ${action.id} ===`, {
                  hasScheduleDetails: !!action.schedule_details,
                  scheduleDetails: action.schedule_details,
                });
                try {
                  const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
                  const headers = buildActionApiHeaders(token);

                  logger.info(
                    `=== Fetching complete details for action ${action.id} ===`,
                    {
                      url: url,
                    },
                  );

                  const response = await axios.get(url, { headers });

                  logger.info(`=== Response for action ${action.id} ===`, {
                    responseStatus: response.status,
                    responseData: response.data,
                  });

                  let actionData = null;
                  if (
                    response.data?.data &&
                    Array.isArray(response.data.data) &&
                    response.data.data.length > 0
                  ) {
                    actionData = {
                      ...response.data.data[0],
                      ...action,
                      m_emailer_action_schedule:
                        response.data.data[0].m_emailer_action_schedule,
                    };
                    // Explicitly ensure we preserve schedule_details from list action
                    actionData.schedule_details = action.schedule_details;
                  } else if (
                    response.data?.tblData &&
                    Array.isArray(response.data.tblData) &&
                    response.data.tblData.length > 0
                  ) {
                    actionData = {
                      ...response.data.tblData[0],
                      ...action,
                      m_emailer_action_schedule:
                        response.data.tblData[0].m_emailer_action_schedule,
                    };
                    // Explicitly ensure we preserve schedule_details from list action
                    actionData.schedule_details = action.schedule_details;
                  }

                  logger.info(
                    `=== Final actionData for action ${action.id} ===`,
                    {
                      hasScheduleDetails: !!actionData?.schedule_details,
                      scheduleDetails: actionData?.schedule_details,
                      hasMEmailerActionSchedule:
                        !!actionData?.m_emailer_action_schedule,
                    },
                  );

                  return actionData || action;
                } catch (err) {
                  logger.warn(`Failed to fetch complete details for action`, {
                    actionId: action.id,
                    error: err.message,
                  });
                  return action;
                }
              }),
            );

            const validActions = actionsWithDetails
              .filter((result) => result.status === "fulfilled")
              .map((result) => result.value);

            logger.info(`Fetched complete actions for database`, {
              database: db,
              count: validActions.length,
            });

            return {
              db,
              res: {
                ...listRes,
                items: validActions,
                raw: { ...listRes.raw, tblData: validActions },
              },
              token,
            };
          } catch {
            return null;
          }
        }),
      );

      const validTenants = tenants.filter(Boolean);
      allTenants.push(...validTenants);

      await sleep(500);
    }

    const smtp = await fetchSmtpConfig({
      token: smtpToken,
      connection,
      dbName: allTenants.length > 0 ? allTenants[0].db : null,
    });

    if (!smtp?.email_address) {
      logger.warn("No SMTP config found");
      return;
    }

    const activeJobKeys = new Set();

    for (const { db, res } of allTenants) {
      const actions = res.raw?.tblData || [];

      for (const action of actions) {
        logger.info(`Checking action`, {
          actionId: action.id,
          is_active: action.is_active,
          database: db,
        });

        if (action.is_active !== "Y") {
          logger.info(`Skipping inactive action`, {
            actionId: action.id,
            database: db,
          });
          continue;
        }
        // Don't skip if emailer_type or email_service_type is "E" (dynamic recipients from query)
        const isDynamicEmailType =
          action.emailer_type === "E" || action.email_service_type === "E";
        const to = normalizeRecipients(action.to);
        if (!to.length && !isDynamicEmailType) continue;

        logger.info("=== Checking dynamic email type ===", {
          actionId: action.id,
          isDynamicEmailType,
          emailer_type: action.emailer_type,
          email_service_type: action.email_service_type,
        });

        const payload = { action, smtp, db };
        const tz = action.timezone || "UTC";
        logger.info("=== Action timezone ===", {
          actionId: action.id,
          timezone: action.timezone,
          usedTz: tz,
        });

        let parsed = null;
        try {
          logger.info("=== Action schedule details ===", {
            actionId: action.id,
            schedule_details: action.schedule_details,
            m_emailer_action_schedule: action.m_emailer_action_schedule,
          });

          // Priority 1: Use schedule_details if available
          if (action.schedule_details && action.schedule_details.trim()) {
            logger.info(
              "=== Trying to parse schedule_details (priority 1) ===",
              {
                actionId: action.id,
              },
            );
            parsed = parseScheduleDetails(action.schedule_details, tz);
            logger.info("=== parseScheduleDetails result ===", {
              actionId: action.id,
              parsed: parsed,
            });
            if (parsed) {
              logger.info("=== Successfully parsed schedule_details! ===", {
                actionId: action.id,
                parsedType: parsed.type,
              });
            } else {
              logger.warn(
                "=== Failed to parse schedule_details, skipping m_emailer_action_schedule ===",
                {
                  actionId: action.id,
                },
              );
            }
          }

          // Priority 2: Only use m_emailer_action_schedule if schedule_details is missing/empty
          if (
            !parsed &&
            (!action.schedule_details || !action.schedule_details.trim()) &&
            action.m_emailer_action_schedule &&
            action.m_emailer_action_schedule.length > 0
          ) {
            logger.info(
              "=== Falling back to parseScheduleFromObject (priority 2) ===",
              {
                actionId: action.id,
              },
            );

            for (const scheduleObj of action.m_emailer_action_schedule) {
              parsed = parseScheduleFromObject(scheduleObj, tz);
              if (parsed) break;
            }
          }

          // Priority 3: Only use schedule_time if neither of the above are available
          if (
            !parsed &&
            (!action.schedule_details || !action.schedule_details.trim()) &&
            (!action.m_emailer_action_schedule ||
              action.m_emailer_action_schedule.length === 0) &&
            action.schedule_time
          ) {
            logger.info("=== Falling back to schedule_time (priority 3) ===", {
              actionId: action.id,
            });
            const cron = parseScheduleTime(action.schedule_time);
            if (cron) {
              parsed = { type: "DAILY", cron };
            }
          }
        } catch (err) {
          logger.error("=== Error parsing schedule ===", {
            actionId: action.id,
            error: err.message,
            stack: err.stack,
          });
          parsed = null;
        }

        if (parsed) {
          if (parsed.type === "ONE") {
            const delay = parsed.date.diff(dayjs.utc());
            const jobId = `${db}-one-${action.id}-${parsed.date.valueOf()}`;
            const redisKey = `scheduler:one-time:${jobId}`;

            const alreadyScheduled = await connection.get(redisKey);
            if (alreadyScheduled) {
              logger.debug(`One-time job already scheduled`, { jobId });
              continue;
            }

            if (delay < -1800000) continue;

            const exists = await emailQueue.getJob(jobId);
            if (exists) {
              logger.debug(`One-time job already exists in queue`, { jobId });
              continue;
            }

            await emailQueue.add("send-email", payload, {
              delay: Math.max(delay, 0),
              jobId,
              removeOnComplete: true,
              removeOnFail: true,
            });

            const ttl = Math.max(
              86400,
              Math.floor((parsed.date.valueOf() - Date.now()) / 1000) + 86400,
            );
            await connection.set(redisKey, "1", "EX", ttl);

            logger.info(`Scheduled one-time email`, {
              actionId: action.id,
              database: db,
              jobId,
            });
            continue;
          }
          if (parsed.type === "ADVANCED") {
            const jobKey = `${db}-adv-${action.id}`;
            activeJobKeys.add(jobKey);

            // Generate correct cron for every N minutes
            let cron;
            if (parsed.everyMinutes === 60) {
              // Every hour, minute 0
              cron = "0 * * * *";
            } else if (parsed.everyMinutes > 60) {
              // For intervals longer than 1 hour, we'll just use a cron that runs every minute
              // and rely on the worker to check the actual interval
              cron = "* * * * *";
            } else {
              cron = `*/${parsed.everyMinutes} * * * *`;
            }

            await addRepeatJob({ ...payload, advanced: parsed }, cron, jobKey);

            logger.info(`Scheduled advanced email`, {
              actionId: action.id,
              database: db,
            });
            continue;
          }
          if (parsed.type === "WEEKLY") {
            const jobKey = `${db}-weekly-${action.id}`;
            activeJobKeys.add(jobKey);
            const cron = `${parsed.minute} ${parsed.hour} * * ${parsed.dayOfWeek}`;
            await addRepeatJob({ ...payload, advanced: parsed }, cron, jobKey);

            logger.info(`Scheduled weekly email`, {
              actionId: action.id,
              database: db,
              cron,
            });
            continue;
          }
          if (parsed.type === "DAILY") {
            const now = dayjs.utc();
            let shouldSchedule = true;
            const startDateMatch =
              action.schedule_details &&
              typeof action.schedule_details === "string"
                ? action.schedule_details.match(
                    /starting on (\d{2})\/(\d{2})\/(\d{4})/i,
                  )
                : null;
            const endDateMatch =
              action.schedule_details &&
              typeof action.schedule_details === "string"
                ? action.schedule_details.match(
                    /ending on (\d{2})\/(\d{2})\/(\d{4})/i,
                  )
                : null;

            if (startDateMatch) {
              const startDate = dayjs
                .tz(
                  `${startDateMatch[3]}-${startDateMatch[2]}-${startDateMatch[1]} 00:00`,
                  "UTC",
                )
                .utc();
              if (now.isBefore(startDate)) {
                shouldSchedule = false;
              }
            }

            if (endDateMatch && shouldSchedule) {
              const endDate = dayjs
                .tz(
                  `${endDateMatch[3]}-${endDateMatch[2]}-${endDateMatch[1]} 23:59`,
                  "UTC",
                )
                .utc();
              if (now.isAfter(endDate)) {
                shouldSchedule = false;
              }
            }

            if (shouldSchedule) {
              const jobKey = `${db}-daily-${action.id}`;
              activeJobKeys.add(jobKey);
              await addRepeatJob(payload, parsed.cron, jobKey);
            }
            continue;
          }
        }

        if (!action.schedule_details || action.schedule_details.trim() === "") {
          const cron = parseScheduleTime(action.schedule_time);
          if (cron) {
            const jobKey = `${db}-fallback-${action.id}`;
            activeJobKeys.add(jobKey);
            await addRepeatJob(payload, cron, jobKey);
            continue;
          }
        }
      }
    }

    const existingJobs = await emailQueue.getRepeatableJobs();
    logger.info(`Checking ${existingJobs.length} existing repeatable jobs`, {
      activeJobKeys: Array.from(activeJobKeys),
      existingJobKeys: existingJobs.map((j) => j.key),
    });
    for (const job of existingJobs) {
      const jobKey = job.key;
      if (!jobKey) continue;

      if (
        job.name === "check-email-queue-status" ||
        job.name === "send-daily-email"
      ) {
        continue;
      }

      if (
        jobKey.includes("-adv-") ||
        jobKey.includes("-daily-") ||
        jobKey.includes("-weekly-") ||
        jobKey.includes("-fallback-")
      ) {
        let isActive = false;
        for (const activeJobId of activeJobKeys) {
          if (jobKey.includes(activeJobId)) {
            isActive = true;
            break;
          }
        }
        if (!isActive) {
          logger.info(`Removing inactive job`, { jobKey });
          await emailQueue.removeRepeatableByKey(job.key);
        } else {
          logger.debug(`Keeping active job`, { jobKey });
        }
      }
    }
  } catch (err) {
    logger.error("Scheduler error", { error: err.message, stack: err.stack });
  } finally {
    //new logic
    isPolling = false;
  }
  //new logic
};

const startSchedulerPolling = () => {
  logger.info("Scheduler polling worker starting...");

  const intervalId = setInterval(pollScheduler, POLL_INTERVAL);

  pollScheduler().catch((err) => {
    logger.error("Initial poll failed", { error: err.message });
  });

  logger.info("Scheduler polling worker started", {
    pollInterval: POLL_INTERVAL,
  });

  return {
    intervalId,
    close: async () => {
      if (intervalId) {
        clearInterval(intervalId);
        logger.info("Scheduler polling worker stopped");
      }
    },
    isAlive: () => {
      return intervalId !== null && intervalId !== undefined;
    },
  };
};

module.exports = { startSchedulerPolling };
