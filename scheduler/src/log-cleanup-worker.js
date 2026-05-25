const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
const maxAgeMs = 60 * 1000; // 1 minute

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
        if (now - stats.mtimeMs > maxAgeMs && stats.size > 0) {
          fs.truncateSync(filePath, 0);
          console.log(`[LogCleanup] Truncated: ${file}`);
        }
      } catch (err) {
        // Ignore errors for individual files
      }
    }
  } catch (err) {
    console.error('[LogCleanup] Error:', err.message);
  }
};

console.log('[LogCleanup] Starting fallback log cleanup worker');
cleanupLogs();
setInterval(cleanupLogs, 30 * 1000); // Check every 30 seconds
