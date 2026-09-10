const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "logs");
const maxAgeMs = 1 * 24 * 60 * 60 * 1000;

const cleanupLogs = () => {
  try {
    if (!fs.existsSync(logsDir)) {
      return;
    }

    const files = fs.readdirSync(logsDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[LogCleanup] Deleted old log file: ${file}`);
        }
      } catch (err) {}
    }
  } catch (err) {
    console.error("[LogCleanup] Error:", err.message);
  }
};

console.log("[LogCleanup] Starting log cleanup worker (1-day retention)");
cleanupLogs();
setInterval(cleanupLogs, 60 * 60 * 1000);
