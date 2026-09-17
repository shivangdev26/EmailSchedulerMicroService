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
const { startEmailWorker } = require("./workers/emailWorker");
const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");
const { startAlertWorker } = require("./workers/alertWorker");
const { startAlertPolling } = require("./workers/alertPollingWorker");
const {
  startPushNotificationWorker,
} = require("./workers/pushNotificationWorker");
const { startWorkflowEmailWorker } = require("./workers/workflowEmailWorker");

let emailWorker = null;
let schedulerPollingWorker = null;
let alertWorker = null;
let alertPollingWorker = null;
let pushNotificationWorker = null;
let workflowEmailWorker = null;

let isShuttingDown = false;
let redisConnectionAttempts = 0;
const activeIntervals = [];
const activeTimeouts = [];

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
    redisConnectionAttempts = 0;
  });
  connection.on("ready", () => {
    logger.info("Redis ready");
  });
  connection.on("close", () => {
    if (!isShuttingDown) logger.warn("Redis connection closed");
  });
  connection.on("reconnecting", () => {
    if (!isShuttingDown)
      logger.warn(`Redis reconnecting... attempt ${++redisConnectionAttempts}`);
  });

  return connection;
};

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION", {
    message: err.message,
    stack: err.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  logger.error("UNHANDLED REJECTION", {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

logger.info("Loading app...");

const connection = createRedisConnection();
const emailQueueName = "email-scheduler";
const emailQueue = new Queue(emailQueueName, {
  connection,
  defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
});

const app = express();

app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      logger.debug(`Request size: ${buf.length} bytes`);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(responseHandler);
app.use("/api", routes);
app.use(errorHandler);

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
    if (server) await new Promise((res) => server.close(res));
    if (emailWorker) {
      console.log("Closing email worker...");
      await emailWorker.close();
    }
    if (
      schedulerPollingWorker &&
      typeof schedulerPollingWorker.close === "function"
    ) {
      console.log("Closing scheduler polling worker...");
      await schedulerPollingWorker.close();
    }
    if (alertWorker) {
      console.log("Closing alert worker...");
      await alertWorker.close();
    }
    if (alertPollingWorker && typeof alertPollingWorker.close === "function") {
      console.log("Closing alert polling worker...");
      await alertPollingWorker.close();
    }
    if (
      pushNotificationWorker &&
      typeof pushNotificationWorker.close === "function"
    ) {
      console.log("Closing push notification worker...");
      await pushNotificationWorker.close();
    }
    if (
      workflowEmailWorker &&
      typeof workflowEmailWorker.close === "function"
    ) {
      console.log("Closing workflow email worker...");
      await workflowEmailWorker.close();
    }
    if (connection) {
      await connection.quit();
      console.log("Redis connection closed");
    }
    console.log("Graceful shutdown complete.");
    process.exit(0);
  } catch (err) {
    logger.error("Error during graceful shutdown", { error: err.message });
    process.exit(1);
  }
};

logger.info("App loaded. Starting HTTP server...");

const PORT = process.env.PORT || 5000;
app.set("trust proxy", true);
let server = null;

server = app.listen(PORT, "0.0.0.0", async () => {
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.maxConnections = 1000;

  logger.info(`Server running on http://localhost:${PORT}`);

  console.log("Starting email worker...");
  emailWorker = startEmailWorker();
  console.log("Email worker started successfully");

  console.log("Starting scheduler polling worker...");
  schedulerPollingWorker = startSchedulerPolling();
  console.log("Scheduler polling worker started successfully");

  // Temporarily disabled Alert Worker & Alert Polling Worker
  // console.log("Starting alert worker...");
  // alertWorker = startAlertWorker();
  // console.log("Alert worker started successfully");

  // console.log("Starting alert polling worker...");
  // alertPollingWorker = startAlertPolling();
  // console.log("Alert polling worker started successfully");

  console.log("Starting push notification worker...");
  pushNotificationWorker = startPushNotificationWorker();
  console.log("Push notification worker started successfully");

  console.log("Starting workflow email worker...");
  workflowEmailWorker = startWorkflowEmailWorker();
  console.log("Workflow email worker started successfully");

  const isIISNode = typeof process.env.IISNODE_VERSION !== "undefined";
  if (isIISNode) {
    logger.info("Running under IISNode — keep-alive active");
    trackInterval(
      setInterval(() => {
        if (!isShuttingDown) logger.debug("IISNode keep-alive ping");
      }, 30000),
    );
  }
});

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGBREAK", () => gracefulShutdown("SIGBREAK"));
process.on("message", (msg) => {
  if (msg === "shutdown") gracefulShutdown("IIS_SHUTDOWN");
});

if (process.platform === "win32") {
  require("readline")
    .createInterface({ input: process.stdin, output: process.stdout })
    .on("SIGINT", () => process.emit("SIGINT"));
}

module.exports = { app, server, emailQueue, connection };
