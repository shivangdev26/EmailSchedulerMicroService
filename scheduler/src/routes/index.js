const express = require("express");
const router = express.Router();
const userRoutes = require("../v1/routes/userRoutes");
const emailRoutes = require("../v1/routes/emailRoutes");
const { triggerEvent } = require("../controller/eventController");
const { triggerEmailer } = require("../controller/emailerController");
const {
  authenticate,
  listLogFiles,
  downloadLogFile,
  downloadAllLogs,
} = require("../controller/logController");

console.log("Registering EMAILER trigger route: /email_scheduler/api/trigger");

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is healthy and running",
    timestamp: new Date().toISOString(),
  });
});

router.use("/v1", userRoutes);

router.post("/trigger", triggerEmailer);

// router.post("/test-cron", async (req, res) => {
//   try {
//     await processEmailQueueStatus();
//     res.json({
//       success: true,
//       message: "Cron logic executed. Check console logs for details.",
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });
router.post(
  "/email_scheduler/api/trigger",
  (req, res, next) => {
    console.log("EMAILER ROUTE HIT!");
    next();
  },
  triggerEmailer,
);

router.post("/alerts/test", async (req, res) => {
  const { fetchDomainData } = require("../services/urlService");
  const { getAuthToken } = require("../services/apiAuthService");
  const { fetchAlertSetups, executeAlertQuery } = require("../services/alertService");
  const { connection } = require("../bullmq");

  const dbName = req.body.dbName || "DCCBusinessSuite_mowara_test";
  try {
    const domainData = await fetchDomainData(dbName);
    if (!domainData || !domainData.BLApiUrl) {
      return res.status(400).json({ success: false, error: "Could not fetch BLApiUrl for dbName: " + dbName });
    }

    const token = await getAuthToken(connection, dbName, true, domainData.BLApiUrl);
    const alertSetups = await fetchAlertSetups({ token, blApiUrl: domainData.BLApiUrl });

    const results = [];
    for (const alert of alertSetups) {
      let queryResult = null;
      if (alert.alert_query) {
        queryResult = await executeAlertQuery({
          token,
          query: alert.alert_query,
          blApiUrl: domainData.BLApiUrl
        });
      }

      const eligibleUsers = (alert.m_alert_setup_user || []).filter(u => u.alert === "Y");
      results.push({
        alertId: alert.id,
        title: alert.title,
        isActive: alert.is_active,
        query: alert.alert_query,
        eligibleUsers,
        queryResultCount: Array.isArray(queryResult) ? queryResult.length : 0,
        queryResult
      });
    }

    res.json({
      success: true,
      dbName,
      blApiUrl: domainData.BLApiUrl,
      alertCount: alertSetups.length,
      alerts: results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Log routes with static password authentication
router.get("/logs", authenticate, listLogFiles);
router.get("/logs/download-all", authenticate, downloadAllLogs);
router.get("/logs/:filename", authenticate, downloadLogFile);

module.exports = router;
