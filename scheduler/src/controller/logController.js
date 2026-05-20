const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const STATIC_PASSWORD = "logdownload123";

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== STATIC_PASSWORD) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid password" });
  }

  next();
};

// List all log files
const listLogFiles = (req, res) => {
  try {
    const logsDir = path.join(__dirname, "../../logs");

    if (!fs.existsSync(logsDir)) {
      return res
        .status(404)
        .json({ success: false, message: "Logs directory not found" });
    }

    const files = fs
      .readdirSync(logsDir)
      .filter((file) => fs.statSync(path.join(logsDir, file)).isFile())
      .map((file) => ({
        name: file,
        size: fs.statSync(path.join(logsDir, file)).size,
        modified: fs.statSync(path.join(logsDir, file)).mtime,
      }));

    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Download a single log file
const downloadLogFile = (req, res) => {
  try {
    const { filename } = req.params;
    const logsDir = path.join(__dirname, "../../logs");
    const filePath = path.join(logsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ success: false, message: "File not found" });
    }

    res.download(filePath, filename);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Download all log files as ZIP
const downloadAllLogs = (req, res) => {
  try {
    const logsDir = path.join(__dirname, "../../logs");

    if (!fs.existsSync(logsDir)) {
      return res
        .status(404)
        .json({ success: false, message: "Logs directory not found" });
    }

    const archive = archiver("zip", { zlib: { level: 9 } });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=all-logs.zip");

    archive.pipe(res);
    archive.directory(logsDir, false);
    archive.finalize();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  authenticate,
  listLogFiles,
  downloadLogFile,
  downloadAllLogs,
};
