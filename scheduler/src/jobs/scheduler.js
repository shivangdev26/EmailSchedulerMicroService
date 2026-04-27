const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { fetchSchedulerActions } = require("../services/emailerActionService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");

const emailQueue = new Queue(emailQueueName, { connection });

const calculateDelay = (timeStr) => {
  if (!timeStr) return null;

  const [hours, minutes] = timeStr.split(":").map(Number);

  const now = new Date();
  const target = new Date();

  target.setHours(hours, minutes, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target - now;
};
const startSchedulerPolling = () => {
  console.log(" Scheduler polling started");

  setInterval(
    async () => {
      try {
        const [res, smtp] = await Promise.all([
          fetchSchedulerActions(),
          fetchSmtpConfig(),
        ]);

        const actions = res.raw?.tblData || [];

        for (const action of actions) {
          if (action.is_active?.trim().toUpperCase() !== "Y") continue;
          if (!action.schedule_time) continue;

          const today = new Date().toISOString().split("T")[0];

          const jobId = `sch-${action.id}-${today}-${action.schedule_time.replace(":", "-")}`;

          // const delay = calculateDelay(action.schedule_time);
          const delay = 5000;

          if (!delay || delay < 0) {
            console.log(" Invalid delay, skipping");
            continue;
          }

          if (!smtp || !smtp.email_address) {
            console.log(" Invalid SMTP config");
            continue;
          }

          const payload = {
            type: "SCHEDULER",
            action,
            smtp,
          };

          console.log(" Scheduling:", {
            id: action.id,
            time: action.schedule_time,
          });

          await emailQueue.add("send-email", payload, {
            delay,
            jobId,
            attempts: 3,
            removeOnComplete: {
              age: 60,
            },
          });
        }
      } catch (err) {
        console.error(" Scheduler error:", err.message);
      }
    },
    5 * 60 * 1000,
  );
};

module.exports = { startSchedulerPolling };
