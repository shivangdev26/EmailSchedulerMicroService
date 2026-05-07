// const { Queue } = require("bullmq");
// const { connection, emailQueueName } = require("../bullmq");
// const { fetchSchedulerActions } = require("../services/emailerActionService");
// const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");

// const dayjs = require("dayjs");
// const utc = require("dayjs/plugin/utc");
// const timezone = require("dayjs/plugin/timezone");

// dayjs.extend(utc);
// dayjs.extend(timezone);

// const emailQueue = new Queue(emailQueueName, { connection });

//config
// const DB_API =
//   "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";

// const LOGIN_API =
//   "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/auth/Login";

// const USERNAME = "admin";
// const PASSWORD = "Nice@4321";

// const POLL_INTERVAL = 15000;
// const BATCH_SIZE = 5;

//cache
// const tokenCache = new Map();

//helper
// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// const normalizeRecipients = (val) =>
//   val
//     ? val
//         .split(/[;,]/)
//         .map((v) => v.trim())
//         .filter(Boolean)
//     : [];

//tokrn
// const generateToken = async (db) => {
//   try {
//     const res = await fetch(LOGIN_API, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         username: USERNAME,
//         password: PASSWORD,
//         dbName: db,
//       }),
//     });

//     const json = await res.json();

//     if (!json?.access_token) throw new Error();

//     tokenCache.set(db, json.access_token);

//     console.log(` LOGIN: ${db}`);
//     return json.access_token;
//   } catch {
//     console.log(`LOGIN FAILED: ${db}`);
//     return null;
//   }
// };

// const getToken = async (db) => {
//   if (tokenCache.has(db)) return tokenCache.get(db);
//   return generateToken(db);
// };

//fetch db
// const fetchAllDatabases = async () => {
//   try {
//     const res = await fetch(DB_API);
//     const json = await res.json();
//     return [...new Set(json?.data?.map((d) => d.DBName) || [])];
//   } catch {
//     return [];
//   }
// };

//parser
// const parseScheduleDetails = (details, tz = "UTC") => {
//   if (!details) return null;

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

//   const advanced = details.match(
//     /every\s*(\d+)\s*day\(s\)\s*every\s*(\d+)\s*minute\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i,
//   );

//   if (advanced) {
//     let everyDays = Number(advanced[1]);
//     let everyMinutes = Number(advanced[2]);

//     let startH = Number(advanced[3]);
//     let startM = Number(advanced[4]);
//     let startP = advanced[5];

//     let endH = Number(advanced[6]);
//     let endM = Number(advanced[7]);
//     let endP = advanced[8];

//     // convert to 24h
//     if (startP === "PM" && startH !== 12) startH += 12;
//     if (startP === "AM" && startH === 12) startH = 0;

//     if (endP === "PM" && endH !== 12) endH += 12;
//     if (endP === "AM" && endH === 12) endH = 0;

//     return {
//       type: "ADVANCED",
//       everyDays,
//       everyMinutes,
//       startH,
//       endH,
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

//job
// const addRepeatJob = async (payload, cron, jobId) => {
//   const existing = await emailQueue.getRepeatableJobs();

//   const exists = existing.some((j) => j.key.includes(jobId));
//   if (exists) return;

//   await emailQueue.add("send-email", payload, {
//     repeat: { cron, tz: "UTC" },
//     jobId,
//   });

//   console.log(" SCHEDULED:", jobId);
// };

//main
// const startSchedulerPolling = () => {
//   console.log(" Scheduler started");

//   setInterval(async () => {
//     try {
//       const dbs = await fetchAllDatabases();
//       const smtp = await fetchSmtpConfig();

//       if (!smtp?.email_address) {
//         console.log(" No SMTP config");
//         return;
//       }

//       let allTenants = [];

//       /* batch loop */
//       for (let i = 0; i < dbs.length; i += BATCH_SIZE) {
//         const batch = dbs.slice(i, i + BATCH_SIZE);

//         const tenants = await Promise.all(
//           batch.map(async (db) => {
//             const token = await getToken(db);
//             if (!token) return null;

//             try {
//               const res = await fetchSchedulerActions(undefined, token);
//               return res ? { db, res } : null;
//             } catch {
//               return null;
//             }
//           }),
//         );

//         const validTenants = tenants.filter(Boolean);
//         allTenants.push(...validTenants);

//         //process
//         for (const { db, res } of validTenants) {
//           const actions = res.raw?.tblData || [];

//           for (const action of actions) {
//             if (action.is_active !== "Y") continue;

//             const to = normalizeRecipients(action.to);
//             if (!to.length) continue;

//             const payload = { action, smtp, db };
//             const tz = action.timezone || "UTC";

//             const parsed = parseScheduleDetails(action.schedule_details, tz);

//             if (parsed) {
//               if (parsed.type === "ONE") {
//                 const delay = parsed.date.diff(dayjs.utc());

//                 if (delay < -60000) continue;

//                 const jobId = `${db}-one-${action.id}-${parsed.date.valueOf()}`;

//                 const exists = await emailQueue.getJob(jobId);
//                 if (exists) continue;

//                 await emailQueue.add("send-email", payload, {
//                   delay: Math.max(delay, 0),
//                   jobId,
//                 });

//                 console.log(" ONE:", action.id);
//                 continue;
//               }

//               if (parsed.type === "DAILY") {
//                 await addRepeatJob(
//                   payload,
//                   parsed.cron,
//                   `${db}-daily-${action.id}`,
//                 );
//                 continue;
//               }
//             }

//             const cron = parseScheduleTime(action.schedule_time);

//             if (cron) {
//               await addRepeatJob(payload, cron, `${db}-fallback-${action.id}`);
//               continue;
//             }

//             console.log(" SKIPPED:", action.id);
//           }
//         }

//         await sleep(500);
//       }

//       /* ===== CLEANUP ===== */
//       const existingJobs = await emailQueue.getRepeatableJobs();

//       for (const job of existingJobs) {
//         const jobKey = job.key;

//         if (!jobKey) {
//           console.log(" No key found:", job);
//           continue;
//         }

//         const stillExists = allTenants.some(({ db, res }) =>
//           res?.raw?.tblData?.some(
//             (a) =>
//               a.is_active === "Y" &&
//               jobKey.includes(`${db}-`) &&
//               jobKey.includes(`-${a.id}`),
//           ),
//         );

//         if (!stillExists) {
//           await emailQueue.removeRepeatableByKey(job.key);
//           console.log("🧹 Removed stale job:", job.key);
//         }
//       }
//     } catch (err) {
//       console.error(" ERROR:", err.message);
//     }
//   }, POLL_INTERVAL);
// };

// module.exports = { startSchedulerPolling };

const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { fetchSchedulerActions } = require("../services/emailerActionService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const emailQueue = new Queue(emailQueueName, { connection });

//config
const DB_API =
  "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";

const LOGIN_API =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/auth/Login";

const USERNAME = process.env.LOGIN_USERNAME || "admin";
const PASSWORD = process.env.LOGIN_PASSWORD || "Nice@4321";

const POLL_INTERVAL = 15000;
const BATCH_SIZE = 5;

//cache
const tokenCache = new Map();

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
const generateToken = async (db) => {
  try {
    const res = await fetch(LOGIN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: USERNAME,
        password: PASSWORD,
        dbName: db,
      }),
    });

    const json = await res.json();

    if (!json?.access_token) throw new Error();

    tokenCache.set(db, json.access_token);

    console.log(` LOGIN: ${db}`);
    return json.access_token;
  } catch {
    console.log(` LOGIN FAILED: ${db}`);
    return null;
  }
};

const getToken = async (db) => {
  if (tokenCache.has(db)) return tokenCache.get(db);
  return generateToken(db);
};

// fetch db
const fetchAllDatabases = async () => {
  try {
    const res = await fetch(DB_API);
    const json = await res.json();
    return [...new Set(json?.data?.map((d) => d.DBName) || [])];
  } catch {
    return [];
  }
};

//parser
const parseScheduleDetails = (details, tz = "UTC") => {
  if (!details) return null;

  const one = details.match(
    /occurs on (\d{2})\/(\d{2})\/(\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)/i,
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

  const daily = details.match(/every day at (\d{1,2}):(\d{2}) (AM|PM)/i);

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

  const advanced = details.match(
    /every\s*(\d+)\s*day\(s\)\s*every\s*(\d+)\s*minute\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*starting on\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  );

  if (advanced) {
    let everyDays = Number(advanced[1]);
    let everyMinutes = Number(advanced[2]);

    let startH = Number(advanced[3]);
    let startM = Number(advanced[4]);
    let startP = advanced[5];

    let endH = Number(advanced[6]);
    let endM = Number(advanced[7]);
    let endP = advanced[8];

    if (startP === "PM" && startH !== 12) startH += 12;
    if (startP === "AM" && startH === 12) startH = 0;

    if (endP === "PM" && endH !== 12) endH += 12;
    if (endP === "AM" && endH === 12) endH = 0;

    const startDate = dayjs
      .tz(`${advanced[11]}-${advanced[10]}-${advanced[9]} 00:00`, tz)
      .utc();

    return {
      type: "ADVANCED",
      everyDays,
      everyMinutes,
      startH,
      startM,
      endH,
      endM,
      startDate,
      tz,
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
const addRepeatJob = async (payload, cron, jobId) => {
  const existing = await emailQueue.getRepeatableJobs();

  const exists = existing.some((j) => j.id === jobId && j.pattern === cron);

  if (exists) return;

  await emailQueue.add("send-email", payload, {
    repeat: { cron, tz: "UTC" },
    jobId,
  });

  console.log(" SCHEDULED:", jobId);
};

//main
const startSchedulerPolling = () => {
  console.log(" Scheduler started");

  setInterval(async () => {
    try {
      const dbs = await fetchAllDatabases();
      const smtp = await fetchSmtpConfig();

      if (!smtp?.email_address) {
        console.log(" No SMTP config");
        return;
      }

      let allTenants = [];

      //batch loop
      for (let i = 0; i < dbs.length; i += BATCH_SIZE) {
        const batch = dbs.slice(i, i + BATCH_SIZE);

        const tenants = await Promise.all(
          batch.map(async (db) => {
            const token = await getToken(db);
            if (!token) return null;

            try {
              const res = await fetchSchedulerActions(undefined, token);
              return res ? { db, res } : null;
            } catch {
              return null;
            }
          }),
        );

        const validTenants = tenants.filter(Boolean);
        allTenants.push(...validTenants);

        //process
        for (const { db, res } of validTenants) {
          const actions = res.raw?.tblData || [];

          for (const action of actions) {
            if (action.is_active !== "Y") continue;

            const to = normalizeRecipients(action.to);
            if (!to.length) continue;

            const payload = { action, smtp, db };
            const tz = action.timezone || "UTC";

            const parsed = parseScheduleDetails(action.schedule_details, tz);

            if (parsed) {
              if (parsed.type === "ONE") {
                const delay = parsed.date.diff(dayjs.utc());

                if (delay < -1800000) {
                  continue;
                }

                const jobId = `${db}-one-${action.id}-${parsed.date.valueOf()}`;

                const exists = await emailQueue.getJob(jobId);
                if (exists) continue;

                await emailQueue.add("send-email", payload, {
                  delay: Math.max(delay, 0),
                  jobId,
                });

                console.log(" ONE:", action.id);
                continue;
              }
              if (parsed.type === "ADVANCED") {
                await addRepeatJob(
                  { ...payload, advanced: parsed },
                  `*/${parsed.everyMinutes} * * * *`,
                  `${db}-adv-${action.id}`,
                );

                console.log(" ADV:", action.id);
                continue;
              }
              if (parsed.type === "DAILY") {
                // Check date boundaries if present
                const now = dayjs.utc();
                let shouldSchedule = true;

                // Extract dates from schedule_details for boundary checking
                const startDateMatch = action.schedule_details.match(
                  /starting on (\d{2})\/(\d{2})\/(\d{4})/i,
                );
                const endDateMatch = action.schedule_details.match(
                  /ending on (\d{2})\/(\d{2})\/(\d{4})/i,
                );

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
                  await addRepeatJob(
                    payload,
                    parsed.cron,
                    `${db}-daily-${action.id}`,
                  );
                }
                continue;
              }
            }

            if (
              !action.schedule_details ||
              action.schedule_details.trim() === ""
            ) {
              const cron = parseScheduleTime(action.schedule_time);

              if (cron) {
                await addRepeatJob(
                  payload,
                  cron,
                  `${db}-fallback-${action.id}`,
                );
                continue;
              }
            }

            console.log(" SKIPPED:", action.id);
          }
        }

        await sleep(500);
      }

      //cleanup
      const existingJobs = await emailQueue.getRepeatableJobs();

      for (const job of existingJobs) {
        const jobKey = job.key;

        if (!jobKey) {
          console.log(" No key found:", job);
          continue;
        }

        const stillExists = allTenants.some(({ db, res }) =>
          res?.raw?.tblData?.some(
            (a) =>
              a.is_active === "Y" &&
              jobKey.includes(`${db}-`) &&
              jobKey.includes(`-${a.id}`),
          ),
        );

        const hasValidData = allTenants.some(({ res }) => res?.raw?.tblData);
        if (!stillExists && hasValidData) {
          await emailQueue.removeRepeatableByKey(job.key);
          console.log(" Removed stale job:", job.key);
        }
      }
    } catch (err) {
      console.error(" ERROR:", err.message);
    }
  }, POLL_INTERVAL);
};

module.exports = { startSchedulerPolling };
