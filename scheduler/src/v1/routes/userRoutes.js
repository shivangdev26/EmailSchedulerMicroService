const express = require("express");
const router = express.Router();

const emailQueue = require("../../queues/emailQueue");

router.post("/trigger-job", async (req, res) => {
  try {
    const { actionsUrl, eventConfigUrl, source = "manual" } = req.body;

    await emailQueue.add(
      "send-daily-email",
      {
        source,
        actionsUrl,
        eventConfigUrl,
      },
      {
        attempts: 3,
        backoff: 5000,
      },
    );

    res.json({
      success: true,
      message: "Job triggered with dynamic apis",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
module.exports = router;
