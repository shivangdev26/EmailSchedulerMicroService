const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const {
  fetchEventConfigurations,
} = require("../services/emailerActionService");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");

const emailQueue = new Queue(emailQueueName, { connection });

const triggerEvent = async (eventName) => {
  try {
    const [res, smtp] = await Promise.all([
      fetchEventConfigurations(),
      fetchSmtpConfig(),
    ]);

    const events = res.data || [];

    const matchedEvents = events.filter(
      (e) => e.event_name === eventName && e.is_enabled === "Y",
    );

    for (const event of matchedEvents) {
      const payload = {
        type: "EVENT",
        event,
        smtp,
      };

      console.log(" Triggering event:", event.event_name);

      await emailQueue.add("send-email", payload, {
        attempts: 3,
      });
    }
  } catch (err) {
    console.error(" Event trigger error:", err.message);
  }
};

module.exports = { triggerEvent };
