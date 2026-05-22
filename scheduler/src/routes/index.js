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

// Log routes with static password authentication
router.get("/logs", authenticate, listLogFiles);
router.get("/logs/download-all", authenticate, downloadAllLogs);
router.get("/logs/:filename", authenticate, downloadLogFile);

module.exports = router;
