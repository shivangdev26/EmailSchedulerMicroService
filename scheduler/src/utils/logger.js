const winston = require("winston");
const path = require("path");
const fs = require("fs");

const getLogsDir = () => {
  let currentDir = __dirname;
  let projectRoot = null;

  try {
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, "package.json"))) {
        projectRoot = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch (e) {
    console.error("Error finding project root:", e.message);
  }

  if (!projectRoot) {
    projectRoot = path.join(__dirname, "../..");
  }

  const logsDir = path.join(projectRoot, "logs");

  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log("Logs directory created at:", logsDir);
    }
  } catch (e) {
    console.error("Error creating logs directory:", e.message);
  }

  return logsDir;
};

const logsDir = getLogsDir();

console.log("=== LOGGER INITIALIZATION ===");
console.log("Logs directory:", logsDir);
console.log("Dir exists:", fs.existsSync(logsDir));

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format((info) => {
    const utcDate = new Date(info.timestamp);
    info.timestamp =
      utcDate.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    return info;
  })(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

const transports = [];

try {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  );
  console.log("Added combined.log transport");
} catch (e) {
  console.error("Error adding combined.log transport:", e.message);
}

try {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  );
  console.log("Added error.log transport");
} catch (e) {
  console.error("Error adding error.log transport:", e.message);
}

transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }),
);
console.log("Added console transport");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "email-scheduler" },
  transports: transports,
  exitOnError: false,
});

console.log("Logger created successfully");

try {
  logger.info("Logger initialized successfully", { logsDirectory: logsDir });
  console.log("Test log message sent to logger");
} catch (e) {
  console.error("Error sending test log:", e.message);
}

module.exports = logger;
