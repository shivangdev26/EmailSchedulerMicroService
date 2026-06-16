const { emailQueue, connection } = require("../bullmq");
const { getAuthToken } = require("../services/apiAuthService");
const { updateEmailQueueStatus } = require("../services/ackService");
const { fetchDomainData } = require("../services/urlService");

const triggerEvent = async (req, res) => {
  try {
    const {
      dbName,
      ID,
      Email_Event_Config_Id,
      EntityId,
      ChildId,
      CombinedIds,
    } = req.body;

    if (!dbName || !Email_Event_Config_Id) {
      return res.status(400).json({
        success: false,
        message: "dbName and Email_Event_Config_Id are required",
      });
    }

    console.log("Received trigger full data:", req.body);

    // Fetch domain data first for dynamic URLs
    console.log("About to call fetchDomainData with dbName:", dbName);
    const domainData = await fetchDomainData(dbName);
    console.log("Received domainData from fetchDomainData:", domainData);

    // 1. Get auth token (from Redis or Login API)
    const token = await getAuthToken(
      connection,
      dbName,
      false,
      domainData?.BLApiUrl,
    );
    console.log("Got auth token!");

    // 2. Store in BullMQ
    await emailQueue.add(
      "process-email-trigger",
      {
        dbName,
        ID,
        Email_Event_Config_Id,
        EntityId,
        ChildId,
        CombinedIds,
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
      email_queue_id: ID,
      ack_status: "Y",
      status: "PENDING",
      dbName: dbName,
      blApiUrl: domainData?.BLApiUrl,
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
