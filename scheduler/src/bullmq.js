const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});

const emailQueueName = "email-scheduler";

const emailQueue = new Queue(emailQueueName, { connection });

console.log(" Redis connected:", connection.options.host);

module.exports = {
  connection,
  emailQueue,
  emailQueueName,
};
