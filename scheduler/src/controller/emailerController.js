const { emailQueue, connection } = require("../bullmq");
const { getAuthToken } = require("../services/apiAuthService");
const { updateEmailQueueStatus } = require("../services/ackService");

const triggerEmailer = async (req, res) => {
  console.log("=== EMAILER TRIGGER API CALLED ===");
  console.log("Request body:", req.body);
  console.log("Request headers:", req.headers);

  try {
    const { dbName, ID, Email_Event_Config_Id, EntityId, ChildId } = req.body;

    console.log("Parsed data:", {
      dbName,
      ID,
      Email_Event_Config_Id,
      EntityId,
      ChildId,
    });

    if (!dbName || !ID || !Email_Event_Config_Id) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: dbName, ID, Email_Event_Config_Id",
      });
    }

    let token;
    try {
      token = await getAuthToken(connection, dbName);
      if (!token) {
        return res.status(500).json({
          success: false,
          message:
            "Failed to obtain authentication token - database may not exist",
        });
      }
      console.log(` Authentication successful for database: ${dbName}`);
    } catch (authError) {
      console.error(
        ` Authentication failed for database: ${dbName}`,
        authError.message,
      );
      return res.status(500).json({
        success: false,
        message: `Authentication failed - database '${dbName}' may not exist or credentials are invalid`,
        error: authError.message,
      });
    }

    const jobData = {
      dbName,
      ID,
      Email_Event_Config_Id,
      EntityId,
      ChildId,
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

    try {
      await updateEmailQueueStatus({
        token,
        id: ID,
        email_queue_id: Email_Event_Config_Id,
        ack_status: "Y",
        status: "PENDING",
        dbName: dbName,
        EntityId: EntityId,
        ChildId: ChildId,
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
