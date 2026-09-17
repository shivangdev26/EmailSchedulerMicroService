const {
  fetchAlertSetups,
  fetchAlertSetupById,
  executeAlertQuery,
} = require("./alertService");
const {
  fetchEventConfigs,
  fetchEventConfigById,
} = require("./eventConfigService");
const { sendEventEmail } = require("./eventEmailProducer");
const { processEmailQueueStatus } = require("./emailQueueCronService");

module.exports = {
  fetchAlertSetups,
  fetchAlertSetupById,
  executeAlertQuery,
  fetchEventConfigs,
  fetchEventConfigById,
  sendEventEmail,
  processEmailQueueStatus,
};
