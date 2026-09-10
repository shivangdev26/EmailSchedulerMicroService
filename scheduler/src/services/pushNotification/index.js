const {
  executeUdfQuery,
  triggerPushAlertsProcedure,
  fetchPendingPushNotifications,
  dispatchFcmNotification,
  dispatchNotificationEmail,
  markNotificationProcessed,
  updateAlertFrequencyLastRun,
  processSinglePushNotification,
} = require("./pushNotificationService");
const {
  getServiceAccount,
  getFirebaseAccessToken,
  sendDirectFcmV1,
} = require("./firebaseAuthService");

module.exports = {
  executeUdfQuery,
  triggerPushAlertsProcedure,
  fetchPendingPushNotifications,
  dispatchFcmNotification,
  dispatchNotificationEmail,
  markNotificationProcessed,
  updateAlertFrequencyLastRun,
  processSinglePushNotification,
  getServiceAccount,
  getFirebaseAccessToken,
  sendDirectFcmV1,
};
