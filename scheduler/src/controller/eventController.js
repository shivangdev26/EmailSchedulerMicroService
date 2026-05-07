const { emailQueue, connection } = require("../bullmq");
const { getAuthToken } = require("../services/apiAuthService");
const { updateEmailQueueStatus } = require("../services/ackService");

const triggerEvent = async (req, res) => {
  try {
    const { dbName, ID, Email_Event_Config_Id } = req.body;

    if (!dbName || !Email_Event_Config_Id) {
      return res.status(400).json({
        success: false,
        message: "dbName and Email_Event_Config_Id are required",
      });
    }

    console.log(" Received trigger:", { dbName, ID, Email_Event_Config_Id });

    // 1. Get auth token (from Redis or Login API)
    const token = await getAuthToken(connection, dbName);

    // 2. Store in BullMQ
    await emailQueue.add(
      "process-email-trigger",
      {
        dbName,
        ID, // This is the ID for acknowledgment? Or event id? User says "id, event id, db_name"
        Email_Event_Config_Id,
      },
      {
        attempts: 3,
        backoff: {
          type: "fixed",
          delay: 5000,
        },
        removeOnComplete: true,
      },
    );

    await updateEmailQueueStatus({
      token,
      id: ID,
      email_queue_id: Email_Event_Config_Id,
      ack_status: "Y",
      status: "PENDING",
      dbName: dbName,
    });

    return res.json({
      success: true,
      message: "Event triggered and queued for processing",
      token: token,
    });
  } catch (error) {
    console.error(" Error in triggerEvent:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = { triggerEvent };
