const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");

const emailQueue = new Queue(emailQueueName, { connection });

const sendEventEmail = async ({ event, smtp }) => {
  await emailQueue.add("send-email", {
    type: "EVENT",
    event,
    smtp,
  });

  console.log(" Event email job added");
};

module.exports = { sendEventEmail };
