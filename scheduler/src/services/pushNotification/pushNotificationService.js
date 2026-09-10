const axios = require("axios");
const { buildApiHeaders } = require("../common/apiAuthService");
const { replaceApiUrlPrefix } = require("../common/urlService");
const logger = require("../../utils/logger");

const executeUdfQuery = async ({ token, query, blApiUrl }) => {
  try {
    const baseUrl =
      process.env.UDF_QUERY_URL ||
      "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";
    const url = replaceApiUrlPrefix(baseUrl, blApiUrl);

    const res = await axios({
      method: "POST",
      url,
      headers: {
        ...buildApiHeaders({ bearerToken: token }),
        "Content-Type": "application/json",
      },
      data: { query },
      timeout: 30000,
    });

    let responseData = res.data;
    if (typeof responseData === "string") {
      try {
        responseData = JSON.parse(responseData);
      } catch (e) {}
    }

    const data =
      responseData?.tblData || responseData?.data || responseData?.result;
    return data;
  } catch (err) {
    logger.error("Failed to execute UDF query", {
      query: query ? query.slice(0, 100) : "",
      error: err.message,
      status: err.response?.status,
    });
    return null;
  }
};

const triggerPushAlertsProcedure = async ({ token, blApiUrl }) => {
  try {
    await executeUdfQuery({
      token,
      query: "EXEC sp_ls_pushalerts",
      blApiUrl,
    });
  } catch (err) {
    logger.error("Error triggering sp_ls_pushalerts", { error: err.message });
  }
};

const fetchPendingPushNotifications = async ({
  token,
  blApiUrl,
  limit = 100,
}) => {
  try {
    const query = `
      SELECT TOP ${Number(limit) || 100} 
        t0.id, 
        t0.title, 
        ISNULL(t0.msgtext,'') as msgtext, 
        ISNULL(USR.fcm_token, '') as fcm_token, 
        t1.id as status_id, 
        t0.severity, 
        t0.parent_source, 
        t0.parent_id, 
        ISNULL(t3.id, 0) as request_detail_id, 
        ISNULL(t2.action_id, 0) as action_id, 
        ISNULL(t2.action_name, t0.action_name) as action_name,
        CASE WHEN t0.parent_source = 0 THEN ISNULL(t_setup.alert_query, '') ELSE '' END as alert_query
      FROM m_notifications t0 WITH(NOLOCK)
      INNER JOIN m_user_master USR WITH(NOLOCK) ON t0.notifier_id = USR.id
      INNER JOIN m_notification_status t1 WITH(NOLOCK) ON t0.id = t1.parent_id AND t1.notification_type in (1) AND t1.msgstatus = 0 AND ISNULL(t0.is_deleted, 'N') = 'N'
      LEFT JOIN m_notifications_setup t_setup WITH(NOLOCK) ON t_setup.id = t0.parent_id AND t0.parent_source = 0
      LEFT JOIN m_approval_request t2 WITH(NOLOCK) ON t0.parent_id = t2.id AND t0.parent_source = 2
      LEFT JOIN m_approval_request_details t3 WITH(NOLOCK) ON t2.id = t3.parent_id AND t0.notifier_id = t3.approver_user_id AND t0.parent_source = 2
    `;

    const data = await executeUdfQuery({
      token,
      query,
      blApiUrl,
    });

    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === "object") {
      return [data];
    }
    return [];
  } catch (err) {
    logger.error("Error fetching pending push notifications", {
      error: err.message,
    });
    return [];
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { sendDirectFcmV1, getServiceAccount } = require("./firebaseAuthService");

const dispatchFcmNotification = async (payload, maxRetries = 3) => {
  const useDirect =
    process.env.USE_DIRECT_FCM === "true" ||
    process.env.FCM_DISPATCH_MODE === "direct" ||
    (!process.env.FCM_GATEWAY_URL && !!getServiceAccount());

  if (useDirect) {
    try {
      const directResult = await sendDirectFcmV1({
        deviceToken: payload.device_token,
        title: payload.title,
        body: payload.body,
        screen: payload.data?.screen,
        dataPayload: payload.data?.data,
      });

      return directResult;
    } catch (directErr) {
      logger.error("Direct FCM v1 failed, checking gateway fallback...", {
        error: directErr.message,
      });
    }
  }

  const fcmUrl =
    process.env.FCM_GATEWAY_URL ||
    process.env.SEND_NOTIFICATION_URL ||
    "https://microservices.dcctz.com/api/send_fcm_notification";

  const apiToken =
    process.env.FCM_API_TOKEN ||
    process.env.SEND_EMAIL_API_TOKEN ||
    "EAAWOFw8QuSgBOZB6IYFbdSTpTBWD9pXeI5DEZB8ZCs8Ivtg7Fopi9llcc5hddMgUx65IiLe7cZCJevlWMV7JVkTbwm8qG7FMDh3PMoiGabhuufRtgRV32gy0Ttw0XeZAJcBj48gEywbPrQ3K6wxL0ZBabBfsVhGBcqVTxGWHJ1UZBUXPkKoMiJ1QbIHnBAu0pL1";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(fcmUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        timeout: 15000,
      });

      let resData = res.data;
      if (typeof resData === "string") {
        try {
          resData = JSON.parse(resData);
        } catch (e) {}
      }

      const isSuccess =
        resData?.success === true ||
        resData?.status === "success" ||
        resData?.statusCode === 200 ||
        res.status === 200;

      const messageId =
        resData?.response?.name ||
        resData?.message_id ||
        resData?.messageId ||
        resData?.id ||
        "";

      return {
        success: isSuccess,
        messageId: String(messageId),
        rawResponse: resData,
      };
    } catch (err) {
      const status = err.response?.status;

      if (status === 429 && attempt < maxRetries) {
        const retryAfterHeader = err.response?.headers?.["retry-after"];
        const waitTimeSec = Number(retryAfterHeader) || attempt * 2;
        logger.warn(
          `FCM rate limit (429) hit. Backing off for ${waitTimeSec}s before retry ${attempt + 1}/${maxRetries}...`,
        );
        await sleep(waitTimeSec * 1000);
        continue;
      }

      logger.error("FCM dispatch failed", {
        error: err.message,
        status,
        response: err.response?.data,
      });
      return {
        success: false,
        messageId: "",
        error: err.message,
      };
    }
  }

  return {
    success: false,
    messageId: "",
    error: "Max retries exceeded for FCM dispatch",
  };
};

const markNotificationProcessed = async ({
  token,
  blApiUrl,
  statusId,
  success,
  messageId = "",
  jsonResult = "",
  alertLinkObjectResult = "",
  requestDetailId = 0,
  notificationId = 0,
}) => {
  try {
    const statusVal = success ? 1 : 2;
    const safeMsgId = String(messageId).replace(/'/g, "''");

    let updateStatusQuery = "";
    if (success) {
      updateStatusQuery = `UPDATE m_notification_status SET fcm_messageid = '${safeMsgId}', senttime = GETDATE(), msgstatus = ${statusVal}, log_inst = log_inst + 1 WHERE id = ${Number(statusId)}`;
    } else {
      updateStatusQuery = `UPDATE m_notification_status SET fcm_messageid = '${safeMsgId}', msgstatus = ${statusVal}, log_inst = log_inst + 1 WHERE id = ${Number(statusId)}`;
    }
    await executeUdfQuery({ token, query: updateStatusQuery, blApiUrl });

    if (Number(requestDetailId) > 0) {
      const updateApprovalQuery = `UPDATE m_approval_request_details SET ready_to_notify = 'Y' WHERE id = ${Number(requestDetailId)}`;
      await executeUdfQuery({ token, query: updateApprovalQuery, blApiUrl });
    }

  } catch (err) {
    logger.error("Error in markNotificationProcessed", {
      statusId,
      requestDetailId,
      error: err.message,
    });
  }
};

const updateAlertFrequencyLastRun = async ({ token, blApiUrl, alertIds }) => {
  if (!alertIds || alertIds.length === 0) return;
  try {
    const ids = alertIds
      .map((id) => Number(id))
      .filter(Boolean)
      .join(",");
    if (!ids) return;
    const updateQuery = `UPDATE m_alert_setup_frequency SET lastruntime = GETDATE() WHERE id IN (${ids})`;
    await executeUdfQuery({ token, query: updateQuery, blApiUrl });
  } catch (err) {
    logger.error("Error updating alert setup frequency lastruntime", {
      error: err.message,
    });
  }
};

const dispatchNotificationEmail = async ({
  token,
  blApiUrl,
  notificationId,
  title,
  msgtext,
  actionName,
  tableRows,
}) => {
  try {
    if (!notificationId) return;

    // 1. Look up notifier email and check if email is enabled in setup
    const notifUserRows = await executeUdfQuery({
      token,
      query: `
        SELECT TOP 1 
          ISNULL(u.email, ISNULL(usr.email, '')) as notifier_email,
          ISNULL(u.first_name, ISNULL(usr.first_name, '')) as first_name,
          ISNULL(u.last_name, ISNULL(usr.last_name, '')) as last_name,
          ISNULL(u.username, ISNULL(usr.username, '')) as username,
          CASE 
            WHEN n.parent_source = 2 THEN ISNULL(app_u.email, 'Y')
            WHEN n.parent_source = 1 THEN ISNULL(alt_u.email, 'Y')
            ELSE 'Y'
          END as is_email_enabled
        FROM m_notifications n
        LEFT JOIN m_user_master usr ON n.notifier_id = usr.id
        LEFT JOIN vw_lookup_user_setup u ON n.notifier_id = u.id
        -- For approvals (parent_source = 2)
        LEFT JOIN m_approval_request req ON n.parent_id = req.id AND n.parent_source = 2
        LEFT JOIN m_approval_request_details det ON n.request_detail_id = det.id AND n.parent_source = 2
        LEFT JOIN m_approval_setup_user app_u ON req.approval_id = app_u.parent_id 
             AND n.notifier_id = app_u.user_id 
             AND det.stepnumber = app_u.stepnumber
        -- For alerts (parent_source = 1)
        LEFT JOIN m_alert_setup_user alt_u ON n.parent_id = alt_u.parent_id 
             AND n.notifier_id = alt_u.user_id 
             AND n.parent_source = 1
        WHERE n.id = ${Number(notificationId)}
      `,
      blApiUrl,
    });

    const isEmailEnabled = notifUserRows?.[0]?.is_email_enabled !== "N";
    const recipientEmail =
      Array.isArray(notifUserRows) && notifUserRows[0]?.notifier_email
        ? String(notifUserRows[0].notifier_email).trim()
        : "";

    if (!isEmailEnabled) {
      logger.info("Email notification is disabled for user in setup; skipping email dispatch", {
        notificationId,
        recipient: recipientEmail,
      });
      return;
    }

    if (!recipientEmail || !recipientEmail.includes("@")) {
      logger.debug("No valid recipient email found for notification", {
        notificationId,
        recipientEmail,
      });
      return;
    }

    // 2. Fetch SMTP configuration
    let smtp = null;
    try {
      const { fetchSmtpConfig } = require("../emailScheduler/emailerSmtpAccountService");
      smtp = await fetchSmtpConfig({ token, blApiUrl });
    } catch (e) {}

    const server = smtp?.server_name || smtp?.server || "in-v3.mailjet.com";
    const fromEmail =
      smtp?.email_address || smtp?.email || "enotifications@mowara.co.tz";
    const username = smtp?.user_name || smtp?.email_address || "";
    const password = smtp?.password || "";
    const port = smtp?.port_number || smtp?.port || 587;

    let tableHtml = "";
    if (Array.isArray(tableRows) && tableRows.length > 0) {
      try {
        const { formatResultsToHtmlTable } = require("../workflowEmail/workflowEmailService");
        tableHtml = formatResultsToHtmlTable(tableRows);
      } catch (_) {}
    }

    const emailPayload = {
      from: fromEmail,
      to: [recipientEmail],
      subject: `[LogSuite Alert] ${title}`,
      text: msgtext,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #e60000; padding: 12px 16px; border-radius: 6px 6px 0 0; margin: -20px -20px 16px -20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 18px;">${title}</h2>
          </div>
          <p style="font-size: 14px; color: #333333; line-height: 1.6;">${msgtext}</p>
          ${tableHtml ? `<div style="margin-top: 15px;">${tableHtml}</div>` : ""}
          <div style="background-color: #f8f9fa; padding: 10px 14px; border-radius: 6px; font-size: 12px; color: #555555; margin-top: 15px;">
            <strong>Action:</strong> ${actionName || "Approval / Alert Notification"}<br/>
            <strong>Notification ID:</strong> ${notificationId}
          </div>
          <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;" />
          <p style="font-size: 11px; color: #888888; text-align: center;">
            Sent automatically from DCC LogSuite Notification Microservice
          </p>
        </div>
      `,
      smtp: {
        server,
        email: username,
        password,
        port,
      },
    };

    const sendEmailUrl =
      process.env.SEND_EMAIL_API_URL ||
      "https://microservices.dcctz.com/api/send_email";
    const apiKey = process.env.SEND_EMAIL_API_TOKEN;

    const emailRes = await axios.post(sendEmailUrl, emailPayload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });

    logger.info("Push notification email dispatched successfully", {
      notificationId,
      recipient: recipientEmail,
      status: emailRes.status,
    });
  } catch (emailErr) {
    logger.error("Failed to dispatch push notification email", {
      notificationId,
      error: emailErr.message,
    });
  }
};

const processSinglePushNotification = async ({ item, token, blApiUrl }) => {
  const notificationId = Number(item.notificationId || item.id || 0);
  const title = String(item.title || "");
  const msgtext = String(item.msgtext || item.message || "");
  const fcmToken = String(item.fcm_token || item.fcmToken || "");
  const statusId = Number(item.status_id || item.statusId || 0);
  const severity = Number(item.severity || 0);
  const parentSource = Number(item.parent_source ?? 0);
  const parentId = Number(item.parent_id ?? 0);
  const requestDetailId = Number(item.request_detail_id ?? 0);
  const actionId = Number(item.actionId || item.action_id || 0);
  const actionName = String(item.actionName || item.action_name || "");
  const alertQuery = String(item.alert_query || "");

  let notificationType = "notification";
  let queryResult = "";
  let alertLinkObjectResult = "";
  let alertId = null;

  try {
    if (parentSource === 0 && alertQuery) {
      const formattedQuery = alertQuery.replace(/\{0\}/g, parentId);
      const data = await executeUdfQuery({
        token,
        query: formattedQuery,
        blApiUrl,
      });
      queryResult = JSON.stringify(data || []);
    } else if (parentSource === 1) {
      notificationType = "alert";
      if (parentId > 0) {
        const alertSetupRows = await executeUdfQuery({
          token,
          query: `SELECT alert_query FROM m_alert_setup WHERE id = ${parentId}`,
          blApiUrl,
        });

        if (
          Array.isArray(alertSetupRows) &&
          alertSetupRows.length > 0 &&
          alertSetupRows[0].alert_query
        ) {
          const dynamicSql = alertSetupRows[0].alert_query;
          const data = await executeUdfQuery({
            token,
            query: dynamicSql,
            blApiUrl,
          });
          queryResult = JSON.stringify(data || []);
        }

        const linkRows = await executeUdfQuery({
          token,
          query: `SELECT [linkcolumn],[linkobject] FROM [m_alert_setup_linkobjects] WHERE parent_id = ${parentId}`,
          blApiUrl,
        });
        alertLinkObjectResult = JSON.stringify(linkRows || []);
        alertId = parentId;
      }
    } else if (parentSource === 2) {
      notificationType = "approval";
    }

    let pushResult = { success: false, messageId: "" };
    if (fcmToken) {
      const messageItem = {
        type: notificationType,
        severity: String(severity),
        notificationId: String(notificationId),
        parent_id: String(parentId),
        request_detail_id: String(requestDetailId),
        action_id: String(actionId),
        action_name: actionName,
        CustomData: "",
      };

      const fcmPayload = {
        portal: "dcc_approval",
        device_token: fcmToken,
        title,
        body: msgtext,
        android_channel_id: "high_importance_channel",
        sound: "custom_sound",
        content_available: true,
        mutable_content: true,
        data: {
          screen:
            notificationType === "approval"
              ? "approval"
              : actionName || notificationType,
          data: JSON.stringify(messageItem),
        },
      };

      pushResult = await dispatchFcmNotification(fcmPayload);

      if (pushResult.success) {
        logger.info("Push notification dispatched successfully", {
          notificationId,
          statusId,
          messageId: pushResult.messageId,
        });
      }
    } else {
      logger.info("No mobile FCM token registered for user; sending email notification directly", {
        notificationId,
        statusId,
      });
    }

    // Always dispatch email notification to user inbox
    let emailSuccess = false;
    try {
      let parsedRows = [];
      if (queryResult) {
        try {
          parsedRows = JSON.parse(queryResult);
        } catch (_) {}
      }
      await dispatchNotificationEmail({
        token,
        blApiUrl,
        notificationId,
        title,
        msgtext,
        actionName,
        tableRows: parsedRows,
      });
      emailSuccess = true;
    } catch (emailErr) {
      logger.warn("Notification email dispatch warning", {
        notificationId,
        error: emailErr.message,
      });
    }

    const overallSuccess = pushResult.success || emailSuccess;

    await markNotificationProcessed({
      token,
      blApiUrl,
      statusId,
      success: overallSuccess,
      messageId: pushResult.messageId || "email-dispatched",
      jsonResult: queryResult,
      alertLinkObjectResult,
      requestDetailId,
      notificationId,
    });

    return { success: overallSuccess, alertId };
  } catch (err) {
    logger.error("Error processing single push notification", {
      notificationId,
      error: err.message,
    });
    await markNotificationProcessed({
      token,
      blApiUrl,
      statusId,
      success: false,
      messageId: "",
      jsonResult: queryResult,
      alertLinkObjectResult,
      requestDetailId,
      notificationId,
    });
    return { success: false, alertId };
  }
};

module.exports = {
  executeUdfQuery,
  triggerPushAlertsProcedure,
  fetchPendingPushNotifications,
  dispatchFcmNotification,
  dispatchNotificationEmail,
  markNotificationProcessed,
  updateAlertFrequencyLastRun,
  processSinglePushNotification,
};
