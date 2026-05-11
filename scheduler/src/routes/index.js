const express = require("express");
const router = express.Router();
const userRoutes = require("../v1/routes/userRoutes");
const emailRoutes = require("../v1/routes/emailRoutes");
const { triggerEvent } = require("../controller/eventController");
const { triggerEmailer } = require("../controller/emailerController");
const {
  processEmailQueueStatus,
} = require("../services/emailQueueCronService");

console.log("Registering EMAILER trigger route: /email_scheduler/api/trigger");

router.use("/v1", userRoutes);
router.post("/trigger", triggerEmailer);
router.post("/test-cron", async (req, res) => {
  try {
    await processEmailQueueStatus();
    res.json({
      success: true,
      message: "Cron logic executed. Check console logs for details.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
router.post(
  "/email_scheduler/api/trigger",
  (req, res, next) => {
    console.log("EMAILER ROUTE HIT!");
    next();
  },
  triggerEmailer,
);

module.exports = router;
