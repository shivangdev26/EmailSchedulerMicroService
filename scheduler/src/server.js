const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const logger = require("./utils/logger");

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION", {
    message: err.message,
    stack: err.stack,
  });
  console.error("\n\n UNCAUGHT EXCEPTION");
  console.error("Message:", err.message);
  console.error("Stack:", err.stack);
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

const { connection } = require("./bullmq");
const app = require("./index");

const { startEmailWorker } = require("./workers/emailWorker");
const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");
const { initializeCronJobs } = require("./cronjobs");

console.log("App loaded");
console.log("BullMQ modules loaded");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, "0.0.0.0", async () => {
  startEmailWorker();
  startSchedulerPolling();

  await initializeCronJobs();

  console.log(`Server is running on http://localhost:${PORT}`);

  server.timeout = 0;

  const selfPing = async () => {
    try {
      logger.info("Self-ping - keeping server active", {
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn("Self-ping failed", { error: err.message });
    }
  };

  setInterval(selfPing, 5 * 60 * 1000);
  setTimeout(selfPing, 10000);
});

const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("HTTP server closed");

    try {
      await connection.quit();
      console.log("BullMQ connection closed");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
