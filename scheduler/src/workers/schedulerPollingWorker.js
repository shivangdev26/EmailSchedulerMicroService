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

//config
const DB_API =
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
    logger.warn(`Login failed for database: ${db}`);
    return null;
  }
};

// fetch db
const fetchAllDatabases = async () => {
  try {
    const response = await axios.get(DB_API);
    const databases = response.data?.data || [];
    const dbNames = databases.map((db) => db.DBName).filter(Boolean);

    const uniqueDbNames = [...new Set(dbNames)];

    logger.info(`Fetched ${uniqueDbNames.length} databases`, {
      databases: uniqueDbNames,
    });
    return uniqueDbNames;
  } catch (err) {
    logger.error("Error fetching databases", { error: err.message });
    return ["DCCBusinessSuite_mowara_test"];
  }
};

//parser
const parseScheduleDetails = (details, tz = "UTC") => {
  logger.debug("Parsing schedule details", { details, timezone: tz });
  if (!details || typeof details !== "string") return null;

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

  // const advanced =
  //   details.match(
  //     /every\s*(\d+)\s*day\(s\)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*starting on\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  //   ) ||
  //   details.match(
  //     /every\s*(\d+)\s*day\(s\)every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*starting on\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  //   );

  const advanced = details.match(
    /every\s*(?:(\d+)\s*day\(s\)|day)\s*every\s*(\d+)\s*(minute|hour)\(s\)\s*between\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*and\s*(\d{1,2}):(\d{2})\s*(AM|PM).*(?:Schedule will be\s*)?starting on\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*ending on\s*(\d{2})\/(\d{2})\/(\d{4}))?/i,
  );

  if (advanced) {
    let everyDays = advanced[1] ? Number(advanced[1]) : 1;
    // let everyDays = Number(advanced[1]);
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

    // Parse starting_at and ending_at to get startH/startM/endH/endM
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

    return {
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
const addRepeatJob = async (payload, cron, jobId) => {
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

  logger.info(`Scheduled job`, { jobId });
};

//main
const startSchedulerPolling = () => {
  logger.info("Scheduler started");

  setInterval(async () => {
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

              const actionsWithDetails = await Promise.allSettled(
                (listRes.raw?.tblData || []).map(async (action) => {
                  try {
                    const url = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerAction/${action.id}`;
                    const headers = buildActionApiHeaders(token);
                    const response = await axios.get(url, { headers });

                    let actionData = null;
                    if (
                      response.data?.data &&
                      Array.isArray(response.data.data) &&
                      response.data.data.length > 0
                    ) {
                      actionData = response.data.data[0];
                    } else if (
                      response.data?.tblData &&
                      Array.isArray(response.data.tblData) &&
                      response.data.tblData.length > 0
                    ) {
                      actionData = response.data.tblData[0];
                    }

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

      for (const { db, res } of allTenants) {
        const actions = res.raw?.tblData || [];

        for (const action of actions) {
          if (action.is_active !== "Y") continue;
          const to = normalizeRecipients(action.to);
          if (!to.length) continue;

          const payload = { action, smtp, db };
          const tz = action.timezone || "UTC";

          let parsed = null;
          try {
            if (action.schedule_details && action.schedule_details.trim()) {
              parsed = parseScheduleDetails(action.schedule_details, tz);
            }

            if (
              !parsed &&
              action.m_emailer_action_schedule &&
              action.m_emailer_action_schedule.length > 0
            ) {
              for (const scheduleObj of action.m_emailer_action_schedule) {
                parsed = parseScheduleFromObject(scheduleObj, tz);
                if (parsed) break;
              }
            }

            if (!parsed && action.schedule_time) {
              const cron = parseScheduleTime(action.schedule_time);
              if (cron) {
                parsed = { type: "DAILY", cron };
              }
            }
          } catch (err) {
            parsed = null;
          }

          if (parsed) {
            if (parsed.type === "ONE") {
              const delay = parsed.date.diff(dayjs.utc());
              if (delay < -1800000) continue;

              const jobId = `${db}-one-${action.id}-${parsed.date.valueOf()}`;
              const exists = await emailQueue.getJob(jobId);
              if (exists) continue;

              await emailQueue.add("send-email", payload, {
                delay: Math.max(delay, 0),
                jobId,
              });

              logger.info(`Scheduled one-time email`, {
                actionId: action.id,
                database: db,
              });
              continue;
            }
            if (parsed.type === "ADVANCED") {
              await addRepeatJob(
                { ...payload, advanced: parsed },
                `*/${parsed.everyMinutes} * * * *`,
                `${db}-adv-${action.id}`,
              );

              logger.info(`Scheduled advanced email`, {
                actionId: action.id,
                database: db,
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
              await addRepeatJob(payload, cron, `${db}-fallback-${action.id}`);
              continue;
            }
          }
        }
      }

      const existingJobs = await emailQueue.getRepeatableJobs();
      for (const job of existingJobs) {
        const jobKey = job.key;
        if (!jobKey) continue;

        if (
          job.name === "check-email-queue-status" ||
          job.name === "send-daily-email"
        ) {
          continue;
        }

        if (jobKey.includes("-adv-") || jobKey.includes("-daily-")) {
          logger.info(`Removing old job`, { jobKey });
          await emailQueue.removeRepeatableByKey(job.key);
        }
      }
    } catch (err) {
      logger.error("Scheduler error", { error: err.message });
    }
  }, POLL_INTERVAL);
};

module.exports = { startSchedulerPolling };
