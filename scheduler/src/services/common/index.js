const apiAuthService = require("./apiAuthService");
const urlService = require("./urlService");
const emailSenderService = require("./emailSenderService");

module.exports = {
  ...apiAuthService,
  ...urlService,
  ...emailSenderService,
  apiAuthService,
  urlService,
  emailSenderService,
};
