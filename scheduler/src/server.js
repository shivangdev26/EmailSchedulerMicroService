// const path = require("path");
// require("dotenv").config({ path: path.join(__dirname, ".env") });

// const express = require("express");
// const cors = require("cors");
// const routes = require("./routes/index");
// const responseHandler = require("./utils/responseMiddleware.js");
// const cookieParser = require("cookie-parser");
// const errorHandler = require("./utils/errorMiddleware.js");
// const { Queue } = require("bullmq");
// const IORedis = require("ioredis");

// const logger = require("./utils/logger");

// let workersStarted = false;
// let cronJobsInitialized = false;
// let isShuttingDown = false;
// let redisConnectionAttempts = 0;

// const activeIntervals = [];
// const activeTimeouts = [];
// let emailWorker = null;
// let schedulerPollingWorker = null;

// const trackInterval = (intervalId) => {
//   activeIntervals.push(intervalId);
//   return intervalId;
// };

// const trackTimeout = (timeoutId) => {
//   activeTimeouts.push(timeoutId);
//   return timeoutId;
// };

// const clearAllTimers = () => {
//   console.log("Clearing all intervals and timeouts...");
//   logger.info("Clearing all intervals and timeouts...");

//   activeIntervals.forEach((id) => {
//     try {
//       clearInterval(id);
//     } catch (e) {
//       console.warn("Error clearing interval:", e.message);
//     }
//   });

//   activeTimeouts.forEach((id) => {
//     try {
//       clearTimeout(id);
//     } catch (e) {
//       console.warn("Error clearing timeout:", e.message);
//     }
//   });

//   activeIntervals.length = 0;
//   activeTimeouts.length = 0;
// };

// const createRedisConnection = () => {
//   const connection = new IORedis({
//     host: process.env.REDIS_HOST || "127.0.0.1",
//     port: process.env.REDIS_PORT || 6379,
//     maxRetriesPerRequest: null,
//     retryStrategy: (times) => {
//       if (isShuttingDown) return null;
//       const delay = Math.min(times * 50, 2000);
//       logger.warn(
//         `Redis reconnection attempt ${times}, next retry in ${delay}ms`,
//       );
//       return delay;
//     },
//     enableReadyCheck: true,
//   });

//   connection.on("error", (err) => {
//     if (!isShuttingDown) {
//       logger.error("Redis connection error", { error: err.message });
//     }
//   });

//   connection.on("connect", () => {
//     logger.info("Redis connected successfully");
//     redisConnectionAttempts = 0;
//   });

//   connection.on("ready", () => {
//     logger.info("Redis connection ready");
//   });

//   connection.on("close", () => {
//     if (!isShuttingDown) {
//       logger.warn("Redis connection closed");
//     }
//   });

//   connection.on("reconnecting", () => {
//     if (!isShuttingDown) {
//       redisConnectionAttempts++;
//       logger.warn(`Redis reconnecting... Attempt ${redisConnectionAttempts}`);
//     }
//   });

//   return connection;
// };

// process.on("uncaughtException", (err) => {
//   logger.error("UNCAUGHT EXCEPTION", {
//     message: err.message,
//     stack: err.stack,
//   });
//   console.error("\n\n UNCAUGHT EXCEPTION");
//   console.error("Message:", err.message);
//   console.error("Stack:", err.stack);

//   if (!isShuttingDown) {
//     logger.info("Attempting to restart workers and cron jobs...");
//     trackTimeout(
//       setTimeout(() => {
//         if (workersStarted && !isShuttingDown) {
//           try {
//             const { startEmailWorker } = require("./workers/emailWorker");
//             const {
//               startSchedulerPolling,
//             } = require("./workers/schedulerPollingWorker");
//             emailWorker = startEmailWorker();
//             schedulerPollingWorker = startSchedulerPolling();
//             logger.info("Workers restarted after uncaught exception");
//           } catch (e) {
//             logger.error("Failed to restart workers", { error: e.message });
//           }
//         }
//       }, 5000),
//     );
//   }
// });

// process.on("unhandledRejection", (reason, promise) => {
//   logger.error("UNHANDLED REJECTION", {
//     reason: reason?.message || reason,
//     stack: reason?.stack,
//     promise: String(promise),
//   });
//   console.error("\n\n UNHANDLED REJECTION");
//   console.error("Reason:", reason);
//   console.error("Promise:", promise);
// });

// console.log("Loading app.");

// const connection = createRedisConnection();

// const emailQueueName = "email-scheduler";
// const emailQueue = new Queue(emailQueueName, {
//   connection,
//   defaultJobOptions: {
//     removeOnComplete: false,
//     removeOnFail: false,
//   },
// });

// const app = express();

// app.use(
//   express.json({
//     limit: "10mb",
//     verify: (req, res, buf) => {
//       console.log(` Request size: ${buf.length} bytes`);
//     },
//   }),
// );

// app.use(
//   express.urlencoded({
//     extended: true,
//     limit: "10mb",
//   }),
// );
// app.use(cookieParser());

// app.use(responseHandler);

// app.use("/api", routes);

// app.use(errorHandler);

// const { startEmailWorker } = require("./workers/emailWorker");
// const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");

// const initializeCronJobs = async () => {
//   if (isShuttingDown) return;

//   try {
//     console.log("Initializing BullMQ scheduler jobs");
//     logger.info("Initializing BullMQ scheduler jobs");

//     await emailQueue.upsertJobScheduler(
//       "daily-email-job",
//       {
//         pattern: process.env.EMAIL_SCHEDULER_PATTERN || "0 0 18 * * *",
//         tz: process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata",
//       },
//       {
//         name: "send-daily-email",
//         data: {
//           source: "bullmq-cron",
//         },
//       },
//     );

//     await emailQueue.upsertJobScheduler(
//       "check-email-queue-job",
//       {
//         pattern: "*/5 * * * *",
//         tz: process.env.EMAIL_SCHEDULER_TIMEZONE || "Asia/Kolkata",
//       },
//       {
//         name: "check-email-queue-status",
//         data: {
//           source: "bullmq-cron",
//         },
//       },
//     );

//     console.log("BullMQ scheduler job created");
//     logger.info("BullMQ scheduler jobs created successfully");
//     cronJobsInitialized = true;
//   } catch (error) {
//     console.log("Failed to initialize BullMQ cron job:", error);
//     logger.error("Failed to initialize BullMQ cron jobs", {
//       error: error.message,
//       stack: error.stack,
//     });

//     if (!cronJobsInitialized && !isShuttingDown) {
//       logger.info("Retrying cron job initialization in 10 seconds...");
//       trackTimeout(setTimeout(initializeCronJobs, 10000));
//     }
//   }
// };

// const verifyAndRestartServices = async () => {
//   if (isShuttingDown) return;

//   try {
//     logger.info("Verifying services are running...");

//     if (!cronJobsInitialized) {
//       logger.warn("Cron jobs not initialized, reinitializing...");
//       await initializeCronJobs();
//     } else {
//       const repeatableJobs = await emailQueue.getRepeatableJobs();
//       logger.info("Verified repeatable jobs", { count: repeatableJobs.length });
//     }
//   } catch (error) {
//     logger.error("Service verification failed", { error: error.message });
//   }
// };

// console.log("App loaded");
// console.log("BullMQ modules loaded");

// const PORT = process.env.PORT || 5000;

// app.set("trust proxy", true);

// let server = null;

// const gracefulShutdown = async (signal) => {
//   if (isShuttingDown) {
//     console.log("Already shutting down, ignoring duplicate signal:", signal);
//     return;
//   }

//   isShuttingDown = true;
//   console.log(`\n${signal} received. Starting graceful shutdown...`);
//   logger.info(`${signal} received. Starting graceful shutdown...`);

//   clearAllTimers();

//   if (server) {
//     server.close(() => {
//       console.log("HTTP server closed");
//       logger.info("HTTP server closed");
//       cleanupResources();
//     });
//   } else {
//     cleanupResources();
//   }

//   trackTimeout(
//     setTimeout(() => {
//       console.error("Forced shutdown after timeout");
//       logger.error("Forced shutdown after timeout");
//       process.exit(1);
//     }, 30000),
//   );
// };

// const cleanupResources = async () => {
//   try {
//     console.log("Closing BullMQ queue...");
//     await emailQueue.close();
//     console.log("BullMQ queue closed");

//     console.log("Quitting Redis connection...");
//     await connection.quit();
//     console.log("Redis connection closed");
//     logger.info("BullMQ and Redis connections closed successfully");

//     console.log("Graceful shutdown complete");
//     logger.info("Graceful shutdown complete");
//     process.exit(0);
//   } catch (error) {
//     console.error("Error during resource cleanup:", error);
//     logger.error("Error during resource cleanup", { error: error.message });
//     process.exit(1);
//   }
// };

// server = app.listen(PORT, "0.0.0.0", async () => {
//   server.keepAliveTimeout = 65000;
//   server.headersTimeout = 66000;
//   server.maxConnections = 1000;

//   logger.info("Starting services...");

//   emailWorker = startEmailWorker();
//   schedulerPollingWorker = startSchedulerPolling();
//   workersStarted = true;

//   await initializeCronJobs();

//   console.log(`Server is running on http://localhost:${PORT}`);
//   logger.info(`Server is running on http://localhost:${PORT}`);

//   const selfPing = async () => {
//     if (isShuttingDown) return;

//     try {
//       logger.info("Self-ping - keeping server active", {
//         timestamp: new Date().toISOString(),
//       });

//       await verifyAndRestartServices();
//     } catch (err) {
//       logger.warn("Self-ping failed", { error: err.message });
//     }
//   };

//   trackInterval(setInterval(selfPing, 5 * 60 * 1000));
//   trackTimeout(setTimeout(selfPing, 10000));

//   trackInterval(setInterval(verifyAndRestartServices, 60 * 60 * 1000));
// });

// process.on("SIGINT", () => gracefulShutdown("SIGINT"));
// process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
// process.on("SIGBREAK", () => gracefulShutdown("SIGBREAK"));

// if (typeof process !== "undefined" && process.platform === "win32") {
//   const rl = require("readline").createInterface({
//     input: process.stdin,
//     output: process.stdout,
//   });

//   rl.on("SIGINT", () => {
//     process.emit("SIGINT");
//   });
// }

// process.on("message", (msg) => {
//   if (msg === "shutdown") {
//     gracefulShutdown("IIS_SHUTDOWN");
//   }
// });

// const isIISNode = typeof process.env.IISNODE_VERSION !== "undefined";
// if (isIISNode) {
//   logger.info("Running under IISNode - enabling additional safeguards");

//   trackInterval(
//     setInterval(() => {
//       if (!isShuttingDown) {
//         logger.debug("IISNode keep-alive ping");
//       }
//     }, 30000),
//   );
// }

// module.exports = { app, server, emailQueue, connection };

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

// ─── State ────────────────────────────────────────────────────────────────────
let workersStarted = false;
let cronJobsInitialized = false;
let isShuttingDown = false;
let redisConnectionAttempts = 0;
let workerHealthCheckInterval = null;

const activeIntervals = [];
const activeTimeouts = [];
let emailWorker = null;
let schedulerPollingWorker = null;

// ─── Timer Helpers ─────────────────────────────────────────────────────────────
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

// ─── Redis ────────────────────────────────────────────────────────────────────
const createRedisConnection = () => {
  const connection = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    // IMPORTANT: longer retry window for IIS recycling scenarios
    retryStrategy: (times) => {
      if (isShuttingDown) return null;
      const delay = Math.min(times * 100, 5000); // up to 5s between retries
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

// ─── Worker Management ────────────────────────────────────────────────────────
/**
 * Checks if a BullMQ worker is alive.
 * A worker is "alive" if it exists, is not closing, and its Redis client is connected.
 */
const isWorkerAlive = (worker) => {
  if (!worker) return false;
  try {
    // BullMQ workers expose .closing and the underlying connection state
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
    await worker.close();
    logger.info(`${name} stopped`);
  } catch (e) {
    logger.warn(`Error stopping ${name}`, { error: e.message });
  }
};

/**
 * Core function: start (or restart) both workers.
 * Safe to call multiple times — stops existing workers first.
 */
const startWorkers = async () => {
  if (isShuttingDown) return;

  const { startEmailWorker } = require("./workers/emailWorker");
  const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");

  // Stop existing workers cleanly before restarting
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
    workersStarted = true;
    logger.info("Workers started successfully");
  } catch (e) {
    logger.error("Failed to start workers", { error: e.message });
    workersStarted = false;
    // Retry in 15s
    if (!isShuttingDown) {
      trackTimeout(setTimeout(startWorkers, 15000));
    }
  }
};

/**
 * Periodic health check — runs every 2 minutes.
 * Restarts any dead workers automatically.
 */
const workerHealthCheck = async () => {
  if (isShuttingDown) return;

  const emailAlive = isWorkerAlive(emailWorker);
  const schedulerAlive = isWorkerAlive(schedulerPollingWorker);

  logger.info("Worker health check", { emailAlive, schedulerAlive });

  if (!emailAlive || !schedulerAlive) {
    logger.warn("One or more workers are dead — restarting...", {
      emailAlive,
      schedulerAlive,
    });
    await startWorkers();
  }
};

// ─── Process-level Error Handlers ─────────────────────────────────────────────
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

// ─── App Setup ────────────────────────────────────────────────────────────────
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

// ─── Cron Jobs ─────────────────────────────────────────────────────────────────
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
    // Also run a worker health check here
    await workerHealthCheck();
  } catch (error) {
    logger.error("Service verification failed", { error: error.message });
  }
};

// ─── Server ───────────────────────────────────────────────────────────────────
logger.info("App loaded. Starting HTTP server...");

const PORT = process.env.PORT || 5000;
app.set("trust proxy", true);
let server = null;

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
server = app.listen(PORT, "0.0.0.0", async () => {
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.maxConnections = 1000;

  logger.info(`Server running on http://localhost:${PORT}`);

  // Start workers
  await startWorkers();

  // Initialize cron jobs
  await initializeCronJobs();

  // ── Health check every 2 minutes: auto-restart dead workers ──
  trackInterval(setInterval(workerHealthCheck, 2 * 60 * 1000));

  // ── Full service verification every hour ──
  trackInterval(setInterval(verifyAndRestartServices, 60 * 60 * 1000));

  // ── First check after 30 seconds (catches IIS startup race conditions) ──
  trackTimeout(setTimeout(verifyAndRestartServices, 30000));

  // ── IISNode-specific keep-alive ──
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

// ─── Signal Handlers ──────────────────────────────────────────────────────────
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
