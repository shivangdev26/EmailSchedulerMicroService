const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const logger = require("./utils/logger");

let redisConnectionAttempts = 0;

const createRedisConnection = () => {
  const connection = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(
        `Redis reconnection attempt ${times}, next retry in ${delay}ms`,
      );
      return delay;
    },
    enableReadyCheck: true,
  });

  connection.on("error", (err) => {
    logger.error("Redis connection error", { error: err.message });
  });

  connection.on("connect", () => {
    logger.info("Redis connected successfully");
    redisConnectionAttempts = 0;
  });

  connection.on("ready", () => {
    logger.info("Redis connection ready");
  });

  connection.on("close", () => {
    logger.warn("Redis connection closed");
  });

  connection.on("reconnecting", () => {
    redisConnectionAttempts++;
    logger.warn(`Redis reconnecting... Attempt ${redisConnectionAttempts}`);
  });

  return connection;
};

const connection = createRedisConnection();

const emailQueueName = "email-scheduler";

const emailQueue = new Queue(emailQueueName, {
  connection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});

console.log(" Redis connected:", connection.options.host);

module.exports = {
  connection,
  emailQueue,
  emailQueueName,
};
