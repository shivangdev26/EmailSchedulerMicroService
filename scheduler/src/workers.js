const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("./utils/logger");

let isShuttingDown = false;
let cronJobsInitialized = false;
const activeIntervals = [];
const activeTimeouts = [];
let emailWorker = null;
let schedulerPollingWorker = null;

const trackInterval = (intervalId) => {
  activeIntervals.push(intervalId);
  return intervalId;
};

const trackTimeout = (timeoutId) => {
  activeTimeouts.push(timeoutId);
  return timeoutId;
};

const clearAllTimers = () => {
  logger.info("Clearing all intervals and timeouts...");
  activeIntervals.forEach((id) => {
    try {
      clearInterval(id);
    } catch (e) {}
  });
  activeTimeouts.forEach((id) => {
    try {
      clearTimeout(id);
    } catch (e) {}
  });
  activeIntervals.length = 0;
  activeTimeouts.length = 0;
};

const createRedisConnection = () => {
  const connection = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      if (isShuttingDown) return null;
      const delay = Math.min(times * 100, 5000);
      logger.warn(
        `Redis reconnection attempt ${times}, retrying in ${delay}ms`,
      );
      return delay;
    },
    enableReadyCheck: true,
    connectTimeout: 10000,
    lazyConnect: false,
  });

  connection.on("error", (err) => {
    if (!isShuttingDown) logger.error("Redis error", { error: err.message });
  });
  connection.on("connect", () => {
    logger.info("Redis connected");
  });
  connection.on("ready", () => {
    logger.info("Redis ready");
  });
  connection.on("close", () => {
    if (!isShuttingDown) logger.warn("Redis connection closed");
  });

  return connection;
};

const connection = createRedisConnection();
const emailQueueName = "email-scheduler";
const emailQueue = new Queue(emailQueueName, {
  connection,
  defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
});

const isWorkerAlive = (worker) => {
  if (!worker) return false;

  try {
    if (worker.intervalId !== undefined) {
      return worker.isAlive ? worker.isAlive() : true;
    }

    if (worker.closing) return false;
    const redisClient = worker.opts?.connection;
    if (redisClient && redisClient.status === "end") return false;
    return true;
  } catch {
    return false;
  }
};

const stopWorker = async (worker, name) => {
  if (!worker) return;

  try {
    logger.info(`Stopping ${name}...`);

    if (worker.close && typeof worker.close === "function") {
      await worker.close();
    } else if (worker.opts) {
      await worker.close();
    }

    logger.info(`${name} stopped`);
  } catch (e) {
    logger.warn(`Error stopping ${name}`, { error: e.message });
  }
};

const initializeCronJobs = async () => {
  if (isShuttingDown) return;

  try {
    logger.info("Initializing BullMQ scheduler jobs...");

    await emailQueue.upsertJobScheduler(
      "daily-email-job",
      {
        pattern: process.env.EMAIL_SCHEDULER_PATTERN || "0 0 18 * * *",
        tz: process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata",
      },
      { name: "send-daily-email", data: { source: "bullmq-cron" } },
    );

    await emailQueue.upsertJobScheduler(
      "check-email-queue-job",
      {
        pattern: "*/5 * * * *",
        tz: process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata",
      },
      { name: "check-email-queue-status", data: { source: "bullmq-cron" } },
    );

    logger.info("BullMQ scheduler jobs created successfully");
    cronJobsInitialized = true;
  } catch (error) {
    logger.error("Failed to initialize BullMQ cron jobs", {
      error: error.message,
    });
    if (!cronJobsInitialized && !isShuttingDown) {
      logger.info("Retrying cron job initialization in 10 seconds...");
      trackTimeout(setTimeout(initializeCronJobs, 10000));
    }
  }
};

const verifyAndRestartServices = async () => {
  if (isShuttingDown) return;
  try {
    logger.info("Verifying services...");
    if (!cronJobsInitialized) {
      logger.warn("Cron jobs not initialized — reinitializing...");
      await initializeCronJobs();
    } else {
      const repeatableJobs = await emailQueue.getRepeatableJobs();
      logger.info("Repeatable jobs verified", { count: repeatableJobs.length });
    }
    await workerHealthCheck();
  } catch (error) {
    logger.error("Service verification failed", { error: error.message });
  }
};

const startWorkers = async () => {
  if (isShuttingDown) return;

  const { startEmailWorker } = require("./workers/emailWorker");
  const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");

  if (emailWorker) {
    await stopWorker(emailWorker, "emailWorker");
    emailWorker = null;
  }
  if (schedulerPollingWorker) {
    await stopWorker(schedulerPollingWorker, "schedulerPollingWorker");
    schedulerPollingWorker = null;
  }

  try {
    emailWorker = startEmailWorker();
    schedulerPollingWorker = startSchedulerPolling();
    logger.info("Workers started successfully", {
      emailWorkerType: emailWorker?.constructor?.name || "unknown",
      schedulerWorkerType: schedulerPollingWorker?.intervalId
        ? "CustomScheduler"
        : "unknown",
    });
  } catch (e) {
    logger.error("Failed to start workers", { error: e.message });
    if (!isShuttingDown) {
      trackTimeout(setTimeout(startWorkers, 15000));
    }
  }
};

const workerHealthCheck = async () => {
  if (isShuttingDown) return;

  const emailAlive = isWorkerAlive(emailWorker);
  const schedulerAlive = isWorkerAlive(schedulerPollingWorker);

  logger.info("Worker health check", {
    emailAlive,
    schedulerAlive,
    emailWorkerExists: !!emailWorker,
    schedulerWorkerExists: !!schedulerPollingWorker,
  });

  if (!emailAlive || !schedulerAlive) {
    logger.warn("One or more workers are dead — restarting...", {
      emailAlive,
      schedulerAlive,
    });
    await startWorkers();
  }
};

process.on("uncaughtException", async (err) => {
  logger.error("UNCAUGHT EXCEPTION", {
    message: err.message,
    stack: err.stack,
  });
  if (!isShuttingDown) {
    trackTimeout(
      setTimeout(async () => {
        if (!isShuttingDown) {
          logger.info("Restarting workers after uncaughtException...");
          await startWorkers();
        }
      }, 5000),
    );
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error("UNHANDLED REJECTION", {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    logger.warn("Already shutting down, ignoring:", signal);
    return;
  }
  isShuttingDown = true;
  logger.info(`${signal} received. Starting graceful shutdown...`);

  clearAllTimers();

  const forceExit = trackTimeout(
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000),
  );

  try {
    await stopWorker(emailWorker, "emailWorker");
    await stopWorker(schedulerPollingWorker, "schedulerPollingWorker");
    await emailQueue.close();
    await connection.quit();
    clearTimeout(forceExit);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", { error: err.message });
    process.exit(1);
  }
};

logger.info("Starting background workers...");

startWorkers().then(async () => {
  await initializeCronJobs();
  trackInterval(setInterval(workerHealthCheck, 2 * 60 * 1000));
  trackInterval(setInterval(verifyAndRestartServices, 60 * 60 * 1000));
  trackTimeout(setTimeout(verifyAndRestartServices, 30000));
});

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGBREAK", () => gracefulShutdown("SIGBREAK"));

if (process.platform === "win32") {
  require("readline")
    .createInterface({ input: process.stdin, output: process.stdout })
    .on("SIGINT", () => process.emit("SIGINT"));
}
