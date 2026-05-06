require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("\n\n UNCAUGHT EXCEPTION");
  console.error("Message:", err.message);
  console.error("Stack:", err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("\n\n UNHANDLED REJECTION");
  console.error("Reason:", reason);
  process.exit(1);
});

console.log("Loading app.");

const { connection } = require("./bullmq");
const app = require("./index");

const { startEmailWorker } = require("./workers/emailWorker");
const { startSchedulerPolling } = require("./workers/schedulerPollingWorker");

console.log("App loaded");
console.log("BullMQ modules loaded");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, "0.0.0.0", async () => {
  startEmailWorker();
  startSchedulerPolling();

  console.log(`Server is running on http://localhost:${PORT}`);
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
