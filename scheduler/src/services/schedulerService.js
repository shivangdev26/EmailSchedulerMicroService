const { Queue } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const dayjs = require("dayjs");

const emailQueue = new Queue(emailQueueName, { connection });

const parseAdvancedSchedule = (details) => {
  if (!details) return null;

  const match = details.match(
    /every\s+(\d+)\s+day\(s\).*every\s+(\d+)\s+minute\(s\).*between\s+(\d{2}):(\d{2})\s*(AM|PM)\s+and\s+(\d{2}):(\d{2})\s*(AM|PM).*starting on\s+(\d{2})\/(\d{2})\/(\d{4})/i,
  );

  if (!match) return null;

  const to24 = (h, p) => {
    h = parseInt(h);
    if (p.toUpperCase() === "PM" && h !== 12) h += 12;
    if (p.toUpperCase() === "AM" && h === 12) h = 0;
    return h;
  };

  return {
    dayInterval: parseInt(match[1]),
    minuteInterval: parseInt(match[2]),
    startHour: to24(match[3], match[5]),
    startMinute: parseInt(match[4]),
    endHour: to24(match[6], match[8]),
    endMinute: parseInt(match[7]),
    startDate: dayjs(`${match[11]}-${match[10]}-${match[9]}`),
  };
};

const getNextRunTime = (config) => {
  let now = dayjs();
  let next = now.startOf("minute");

  while (true) {
    const diffDays = next.diff(config.startDate, "day");

    const validDay = diffDays >= 0 && diffDays % config.dayInterval === 0;

    const currentMin = next.hour() * 60 + next.minute();
    const startMin = config.startHour * 60 + config.startMinute;
    const endMin = config.endHour * 60 + config.endMinute;

    let inWindow;

    if (startMin <= endMin) {
      inWindow = currentMin >= startMin && currentMin <= endMin;
    } else {
      inWindow = currentMin >= startMin || currentMin <= endMin;
    }

    if (validDay && inWindow) {
      return next;
    }

    next = next.add(config.minuteInterval, "minute");
  }
};

const scheduleJob = async (action, smtp) => {
  const config = parseAdvancedSchedule(action.schedule_details);
  if (!config) return;

  const nextRun = getNextRunTime(config);

  const delay = nextRun.diff(dayjs());

  console.log(` Next run for ${action.id}:`, nextRun.format());

  await emailQueue.add(
    "send-email",
    {
      payload: { type: "SCHEDULER", action, smtp },
      config,
    },
    {
      delay,
      jobId: `prod-${action.id}`,
      removeOnComplete: true,
    },
  );
};

module.exports = { scheduleJob };
