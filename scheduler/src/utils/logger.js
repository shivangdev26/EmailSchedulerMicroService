// const winston = require("winston");
// const path = require("path");
// const fs = require("fs");

// const logsDir = path.join(__dirname, "../../logs");

// console.log("=== LOGGER STARTING ===");
// console.log("Log directory:", logsDir);

// try {
//   if (!fs.existsSync(logsDir)) {
//     fs.mkdirSync(logsDir, { recursive: true });
//     console.log("Created logs directory");
//   } else {
//     console.log("Logs directory already exists");
//   }
// } catch (e) {
//   console.error("Error with logs directory:", e.message);
// }

// const testFilePath = path.join(logsDir, "test.txt");
// try {
//   fs.writeFileSync(
//     testFilePath,
//     `Server started at ${new Date().toISOString()}\n`,
//   );
//   console.log("Created test file:", testFilePath);
// } catch (e) {
//   console.error("Error creating test file:", e.message);
// }

// const logger = winston.createLogger({
//   level: "info",
//   format: winston.format.json(),
//   transports: [
//     new winston.transports.File({
//       filename: path.join(logsDir, "error.log"),
//       level: "error",
//     }),
//     new winston.transports.File({
//       filename: path.join(logsDir, "combined.log"),
//     }),
//   ],
// });

// logger.add(
//   new winston.transports.Console({
//     format: winston.format.simple(),
//   }),
// );

// console.log("Logger created, sending test log...");

// try {
//   logger.info("Server started successfully", {
//     timestamp: new Date().toISOString(),
//   });
//   console.log("Test log sent");
// } catch (e) {
//   console.error("Error sending test log:", e.message);
// }

// module.exports = logger;
const winston = require("winston");
const path = require("path");
const fs = require("fs");

const logsDir = path.join(__dirname, "..", "logs");

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (e) {
  console.error("[logger] Cannot create logs dir:", e.message);
}

const transports = [
  new winston.transports.Console({
    format: winston.format.simple(),
  }),
];

// Only add file transports if the directory is writable
try {
  fs.accessSync(logsDir, fs.constants.W_OK);
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
  );
} catch (e) {
  console.error(
    "[logger] Logs dir not writable, file logging disabled:",
    e.message,
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
  exitOnError: false,
});

module.exports = logger;
