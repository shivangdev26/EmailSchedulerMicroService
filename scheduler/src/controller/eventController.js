const { emailQueue, connection } = require("../bullmq");
const { getAuthToken } = require("../services/common/apiAuthService");
const { updateEmailQueueStatus } = require("../services/emailScheduler/ackService");
const { fetchDomainData } = require("../services/common/urlService");

const triggerEvent = async (req, res) => {
  try {
    const {
      dbName,
      ID,
      Email_Event_Config_Id,
      EntityId,
      ChildId,
      CombinedIds,
      event_name,
      eventName,
    } = req.body;

    const resolvedEventName = event_name || eventName || null;

    if (!dbName || !Email_Event_Config_Id) {
      return res.status(400).json({
        success: false,
        message: "dbName and Email_Event_Config_Id are required",
      });
    }

    console.log("Received trigger full data:", req.body);

    console.log("About to call fetchDomainData with dbName:", dbName);
    const domainData = await fetchDomainData(dbName);
    console.log("Received domainData from fetchDomainData:", domainData);

    const token = await getAuthToken(
      connection,
      dbName,
      false,
      domainData?.BLApiUrl,
    );
    console.log("Got auth token!");

    await emailQueue.add(
      "process-email-trigger",
      {
        dbName,
        ID,
        Email_Event_Config_Id,
        EntityId,
        ChildId,
        CombinedIds,
        event_name: resolvedEventName,
        domainData,
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
