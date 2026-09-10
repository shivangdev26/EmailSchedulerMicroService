const common = require("./common");
const alert = require("./alert");
const emailScheduler = require("./emailScheduler");
const pushNotification = require("./pushNotification");
const workflowEmail = require("./workflowEmail");

module.exports = {
  common,
  alert,
  emailScheduler,
  pushNotification,
  workflowEmail,

  ...common,
  ...alert,
  ...emailScheduler,
  ...pushNotification,
  ...workflowEmail,
};
