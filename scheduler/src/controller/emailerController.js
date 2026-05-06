const { emailQueue, connection } = require("../bullmq");
const { getAuthToken } = require("../services/apiAuthService");
const { updateEmailQueueStatus } = require("../services/ackService");

const triggerEmailer = async (req, res) => {
  console.log("=== EMAILER TRIGGER API CALLED ===");
  console.log("Request body:", req.body);
  console.log("Request headers:", req.headers);

  try {
    const { dbName, ID, Email_Event_Config_Id } = req.body;

    console.log("Parsed data:", { dbName, ID, Email_Event_Config_Id });

    // Validate required fields
    if (!dbName || !ID || !Email_Event_Config_Id) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: dbName, ID, Email_Event_Config_Id",
      });
    }

    // Get auth token
    const token = await getAuthToken(connection, dbName);
    if (!token) {
      return res.status(500).json({
        success: false,
        message: "Failed to obtain authentication token",
      });
    }

    // Store job in Bull MQ
    const jobData = {
      dbName,
      ID,
      Email_Event_Config_Id,
      token,
      timestamp: new Date().toISOString(),
    };

    const job = await emailQueue.add("process-email-trigger", jobData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    console.log(
      `Emailer job queued with ID: ${job.id} for evnt_id: ${Email_Event_Config_Id}`,
    );

    // First acknowledgment: ack_status to Y, status to pending
    try {
      await updateEmailQueueStatus({
        token,
        id: ID,
        email_queue_id: Email_Event_Config_Id,
        ack_status: "Y",
        tgr_status: "Y",
        status: "PENDING",
        dbName: dbName,
        response: "Email job received and queued",
        retry_count: 0,
      });
      console.log(
        `First acknowledgment sent for event ${Email_Event_Config_Id}`,
      );
    } catch (ackError) {
      console.error("Failed to send first acknowledgment:", ackError.message);
    }

    res.json({
      success: true,
      message: "Emailer job queued successfully",
      jobId: job.id,
      token: token,
    });
  } catch (error) {
    console.error("Error in triggerEmailer:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = { triggerEmailer };
