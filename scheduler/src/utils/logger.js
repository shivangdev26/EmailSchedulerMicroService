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

// Better path
const logsDir = path.join(__dirname, "../logs");
// or: const logsDir = path.resolve(process.cwd(), "logs");

console.log("=== LOGGER STARTING ===");
console.log("__dirname:", __dirname);
console.log("process.cwd():", process.cwd());
console.log("logsDir:", logsDir);

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log("Created logs directory");
  } else {
    console.log("Logs directory already exists");
  }
} catch (e) {
  console.error("Error with logs directory:", e.message);
}

try {
  fs.appendFileSync(
    path.join(logsDir, "test.txt"),
    `Server started at ${new Date().toISOString()}\n`,
  );
  console.log("Created test file");
} catch (e) {
  console.error("Error creating test file:", e.message);
}

const logger = winston.createLogger({
  level: "debug", // temporarily use debug
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
  exitOnError: false,
});

logger.transports.forEach((transport) => {
  transport.on("error", (err) => {
    console.error("Logger transport error:", err.message);
  });
});

logger.info("Logger initialized", {
  timestamp: new Date().toISOString(),
});

module.exports = logger;
