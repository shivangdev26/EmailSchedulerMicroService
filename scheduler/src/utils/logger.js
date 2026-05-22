const winston = require("winston");
const path = require("path");
const fs = require("fs");

const findProjectRoot = () => {
  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return __dirname;
};

const projectRoot = findProjectRoot();
const logsDir = path.join(projectRoot, "logs");

if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log("Logs directory created at:", logsDir);
  } catch (err) {
    console.error("Failed to create logs directory:", err.message);
  }
}

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

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "email-scheduler" },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

logger.add(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }),
);

logger.info("Logger initialized", { logsDirectory: logsDir });

module.exports = logger;
