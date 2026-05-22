const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const routes = require("./routes/index");
const responseHandler = require("./utils/responseMiddleware.js");
const cookieParser = require("cookie-parser");
const errorHandler = require("./utils/errorMiddleware.js");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const logger = require("./utils/logger");

let workersStarted = false;
let cronJobsInitialized = false;
let redisConnectionAttempts = 0;
const MAX_REDIS_RECONNECT_ATTEMPTS = 10;

const createRedisConnection = () => {
  const connection = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(
        `Redis reconnection attempt ${times}, next retry in ${delay}ms`,
      );
      return delay;
    },
    enableReadyCheck: true,
  });

  connection.on("error", (err) => {
    logger.error("Redis connection error", { error: err.message });
  });

  connection.on("connect", () => {
    logger.info("Redis connected successfully");
    redisConnectionAttempts = 0;
  });

  connection.on("ready", () => {
    logger.info("Redis connection ready");
  });

  connection.on("close", () => {
    logger.warn("Redis connection closed");
  });

  connection.on("reconnecting", () => {
    redisConnectionAttempts++;
    logger.warn(`Redis reconnecting... Attempt ${redisConnectionAttempts}`);
  });

  return connection;
};

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION", {
    message: err.message,
    stack: err.stack,
  });
  console.error("\n\n UNCAUGHT EXCEPTION");
  console.error("Message:", err.message);
  console.error("Stack:", err.stack);

  logger.info("Attempting to restart workers and cron jobs...");
  setTimeout(() => {
    if (workersStarted) {
      try {
        const { startEmailWorker } = require("./workers/emailWorker");
        const {
          startSchedulerPolling,
        } = require("./workers/schedulerPollingWorker");
        startEmailWorker();
        startSchedulerPolling();
        logger.info("Workers restarted after uncaught exception");
      } catch (e) {
        logger.error("Failed to restart workers", { error: e.message });
      }
    }
  }, 5000);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("UNHANDLED REJECTION", {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: String(promise),
  });
  console.error("\n\n UNHANDLED REJECTION");
  console.error("Reason:", reason);
  console.error("Promise:", promise);
});

console.log("Loading app.");

const connection = createRedisConnection();

const emailQueueName = "email-scheduler";
const emailQueue = new Queue(emailQueueName, {
  connection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});

const app = express();

app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      console.log(` Request size: ${buf.length} bytes`);
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);
app.use(cookieParser());

app.use(responseHandler);

app.use("/api", routes);

app.use(errorHandler);

const { startEmailWorker } = require("./workers/emailWorker");
const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");

const initializeCronJobs = async () => {
  try {
    console.log("Initializing BullMQ scheduler jobs");
    logger.info("Initializing BullMQ scheduler jobs");

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
    logger.info("BullMQ scheduler jobs created successfully");
    cronJobsInitialized = true;
  } catch (error) {
    console.log("Failed to initialize BullMQ cron job:", error);
    logger.error("Failed to initialize BullMQ cron jobs", {
      error: error.message,
      stack: error.stack,
    });

    if (!cronJobsInitialized) {
      logger.info("Retrying cron job initialization in 10 seconds...");
      setTimeout(initializeCronJobs, 10000);
    }
  }
};

const verifyAndRestartServices = async () => {
  try {
    logger.info("Verifying services are running...");

    if (!cronJobsInitialized) {
      logger.warn("Cron jobs not initialized, reinitializing...");
      await initializeCronJobs();
    } else {
      const repeatableJobs = await emailQueue.getRepeatableJobs();
      logger.info("Verified repeatable jobs", { count: repeatableJobs.length });
    }
  } catch (error) {
    logger.error("Service verification failed", { error: error.message });
  }
};

console.log("App loaded");
console.log("BullMQ modules loaded");

const PORT = process.env.PORT || 5000;

app.set("trust proxy", true);

const server = app.listen(PORT, "0.0.0.0", async () => {
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.maxConnections = 1000;

  logger.info("Starting services...");

  startEmailWorker();
  startSchedulerPolling();
  workersStarted = true;

  await initializeCronJobs();

  console.log(`Server is running on http://localhost:${PORT}`);
  logger.info(`Server is running on http://localhost:${PORT}`);

  const selfPing = async () => {
    try {
      logger.info("Self-ping - keeping server active", {
        timestamp: new Date().toISOString(),
      });

      await verifyAndRestartServices();
    } catch (err) {
      logger.warn("Self-ping failed", { error: err.message });
    }
  };

  setInterval(selfPing, 5 * 60 * 1000);
  setTimeout(selfPing, 10000);

  setInterval(verifyAndRestartServices, 60 * 60 * 1000);
});

const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Starting graceful shutdown...`);
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("HTTP server closed");
    logger.info("HTTP server closed");

    try {
      await emailQueue.close();
      await connection.quit();
      console.log("BullMQ connection closed");
      logger.info("BullMQ connection closed");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error);
      logger.error("Shutdown error", { error: error.message });
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("SIGBREAK", () => gracefulShutdown("SIGBREAK"));

if (typeof process !== "undefined" && process.platform === "win32") {
  const rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    process.emit("SIGINT");
  });
}

process.on("message", (msg) => {
  if (msg === "shutdown") {
    gracefulShutdown("IIS_SHUTDOWN");
  }
});

const isIISNode = typeof process.env.IISNODE_VERSION !== "undefined";
if (isIISNode) {
  logger.info("Running under IISNode - enabling additional safeguards");

  setInterval(() => {
    logger.debug("IISNode keep-alive ping");
  }, 30000);
}

module.exports = { app, server, emailQueue, connection };
