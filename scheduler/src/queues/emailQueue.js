const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");

const emailQueue = new Queue(emailQueueName, { connection });

module.exports = emailQueue;
