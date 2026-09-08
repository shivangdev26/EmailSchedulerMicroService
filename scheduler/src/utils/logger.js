const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

const logsDir = path.join(__dirname, "../../logs");

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (e) {
  console.error("Error creating logs directory:", e.message);
}

const defaultFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.simple(),
);

const combinedFileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, "combined-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "14d",
  format: defaultFormat,
});

const errorFileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxFiles: "30d",
  format: defaultFormat,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: defaultFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    combinedFileRotateTransport,
    errorFileRotateTransport,
  ],
  exitOnError: false,
});

const triggerFileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, error, isSuccess, ...meta } =
      info;

    let badge = " [INFO]   ";
    if (level === "error") {
      badge = " [ERROR]  ";
    } else if (level === "warn") {
      badge = " [WARNING]";
    } else if (
      isSuccess ||
      (level === "info" &&
        (message?.toLowerCase().includes("success") ||
          message?.toLowerCase().includes("sent") ||
          meta?.status === "SENT"))
    ) {
      badge = " [SUCCESS]";
    }

    let eventName = meta.event_name || meta.eventName;
    if (!eventName && error && typeof error === "string" && error.includes(":")) {
      const candidate = error.split(":")[0].trim();
      if (candidate && !candidate.includes(" ") && !candidate.toLowerCase().includes("error")) {
        eventName = candidate;
      }
    }
    const jobId = meta.jobId ? `Job #${meta.jobId}` : null;
    const entityId =
      meta.EntityId !== undefined && meta.EntityId !== null
        ? `EntityId: ${meta.EntityId}`
        : null;
    const configId = meta.Email_Event_Config_Id
      ? `ConfigId: ${meta.Email_Event_Config_Id}`
      : null;

    const tags = [
      badge,
      jobId,
      eventName ? `Event: ${eventName}` : null,
      entityId,
      configId,
    ]
      .filter(Boolean)
      .join(" | ");

    const cleanMeta = { ...meta };
    delete cleanMeta.jobId;
    delete cleanMeta.jobName;
    delete cleanMeta.event_name;
    delete cleanMeta.eventName;
    delete cleanMeta.EntityId;
    delete cleanMeta.Email_Event_Config_Id;

    let metaOutput = "";
    if (error) {
      metaOutput += `\n     Error: ${error}`;
    }
    if (cleanMeta.reason) {
      metaOutput += `\n      Reason: ${cleanMeta.reason}`;
      delete cleanMeta.reason;
    }
    if (cleanMeta.diagnostics && Array.isArray(cleanMeta.diagnostics)) {
      metaOutput += `\n     Unreplaced Placeholders Diagnosis:`;
      for (const diag of cleanMeta.diagnostics) {
        metaOutput += `\n       - ${diag.placeholder} -> ${diag.reason}`;
        if (diag.suggestion) metaOutput += ` (Hint: ${diag.suggestion})`;
      }
      delete cleanMeta.diagnostics;
    }

    const remainingKeys = Object.keys(cleanMeta);
    if (remainingKeys.length > 0) {
      metaOutput += `\n     Details: ${JSON.stringify(cleanMeta, null, 2).replace(/\n/g, "\n    ")}`;
    }
    if (stack) {
      const cleanStack = stack
        .split("\n")
        .slice(0, 5)
        .map((line) => line.trim())
        .join("\n       ");
      metaOutput += `\n     Stack:\n       ${cleanStack}`;
    }

    return `[${timestamp}] ${tags}\n    >> ${message}${metaOutput}\n${"=".repeat(85)}`;
  }),
);

const triggerEmailRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, "trigger-email-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  format: triggerFileFormat,
});

const triggerEmailErrorRotateTransport = new winston.transports.DailyRotateFile(
  {
    filename: path.join(logsDir, "trigger-email-error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    level: "warn",
    maxFiles: "30d",
    format: triggerFileFormat,
  },
);

const triggerLogger = winston.createLogger({
  level: "info",
  format: triggerFileFormat,
  transports: [
    new winston.transports.Console({
      format: triggerFileFormat,
    }),
    triggerEmailRotateTransport,
    triggerEmailErrorRotateTransport,
  ],
  exitOnError: false,
});

triggerLogger.success = (message, meta = {}) =>
  triggerLogger.info(message, { ...meta, isSuccess: true });

logger.triggerLogger = triggerLogger;

module.exports = logger;
module.exports.logger = logger;
module.exports.triggerLogger = triggerLogger;
