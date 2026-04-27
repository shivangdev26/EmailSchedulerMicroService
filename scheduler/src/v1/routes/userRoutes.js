// const express = require("express");
// const router = express.Router();

// router.get("/", (req, res) => {
//   res.send("User route works");
// });

// module.exports = router;
const express = require("express");
const router = express.Router();

const emailQueue = require("../../queues/emailQueue");

// router.post("/trigger-job", async (req, res) => {
//   try {
//     await emailQueue.add(
//       "send-daily-email",
//       { source: "manual" },
//       {
//         attempts: 3,
//         backoff: 5000,
//         removeOnComplete: true,
//         removeOnFail: false,
//       },
//     );
//     console.log(" Job triggered manually from API");

//     res.json({
//       success: true,
//       message: "Job triggered",
//     });
//   } catch (error) {
//     console.error(" Failed to trigger job:", error);

//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

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
