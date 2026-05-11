const { emailQueue } = require("./bullmq");

const initializeCronJobs = async () => {
  try {
    console.log("Initializing BullMQ scheduler jobs");

    await emailQueue.upsertJobScheduler(
      "daily-email-job",
      {
        pattern: process.env.EMAIL_SCHEDULER_PATTERN || "0 0 18 * * *",
        tz: process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata",
      },
      {
        name: "send-daily-email",
        data: {
          source: "bullmq-cron",
        },
      },
    );

    await emailQueue.upsertJobScheduler(
      "check-email-queue-job",
      {
        pattern: "*/5 * * * *",
        tz: process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata",
      },
      {
        name: "check-email-queue-status",
        data: {
          source: "bullmq-cron",
        },
      },
    );

    console.log("BullMQ scheduler job created");
  } catch (error) {
    console.log("Failed to initialize BullMQ cron job:", error);
  }
};

module.exports = {
  initializeCronJobs,
};
