const ackService = require("./ackService");
const attachmentService = require("./attachmentService");
const emailPayloadBuilder = require("./emailPayloadBuilder");
const emailerActionService = require("./emailerActionService");
const emailerSmtpAccountService = require("./emailerSmtpAccountService");
const schedulerService = require("./schedulerService");
const udfService = require("./udfService");

module.exports = {
  ...ackService,
  ...attachmentService,
  ...emailPayloadBuilder,
  ...emailerActionService,
  ...emailerSmtpAccountService,
  ...schedulerService,
  ...udfService,
  ackService,
  attachmentService,
  emailPayloadBuilder,
  emailerActionService,
  emailerSmtpAccountService,
  schedulerService,
  udfService,
};
