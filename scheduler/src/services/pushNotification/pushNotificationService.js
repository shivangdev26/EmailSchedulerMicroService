const axios = require("axios");
const dayjs = require("dayjs");
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
        ISNULL(t3.id, ISNULL(t0.request_detail_id, 0)) as request_detail_id, 
        ISNULL(t2.action_id, 0) as action_id, 
        ISNULL(t2.action_name, t0.action_name) as action_name,
        ISNULL(t3.stepnumber, t0.sequence_stage) as stepnumber,
        CASE WHEN t0.parent_source = 0 THEN ISNULL(t_setup.alert_query, '') ELSE '' END as alert_query
      FROM m_notifications t0 WITH(NOLOCK)
      INNER JOIN m_user_master USR WITH(NOLOCK) ON t0.notifier_id = USR.id
      INNER JOIN m_notification_status t1 WITH(NOLOCK) ON t0.id = t1.parent_id AND t1.notification_type in (1) AND t1.msgstatus = 0 AND ISNULL(t0.is_deleted, 'N') = 'N'
      LEFT JOIN m_notifications_setup t_setup WITH(NOLOCK) ON t_setup.id = t0.parent_id AND t0.parent_source = 0
      LEFT JOIN m_approval_request t2 WITH(NOLOCK) ON t0.parent_id = t2.id AND t0.parent_source = 2
      LEFT JOIN m_approval_request_details t3 WITH(NOLOCK) ON (t0.request_detail_id = t3.id OR (t2.id = t3.parent_id AND t0.notifier_id = t3.approver_user_id)) AND t0.parent_source = 2
      WHERE (
        t0.parent_source != 2 
        OR (
          ISNULL(t2.request_status, 'P') = 'P'
          AND ISNULL(t3.request_status, 'P') = 'P'
          AND NOT EXISTS (
            SELECT 1 
            FROM m_approval_request_details prev WITH(NOLOCK)
            WHERE prev.parent_id = t2.id 
              AND prev.stepnumber < ISNULL(t3.stepnumber, t0.sequence_stage)
              AND prev.request_status != 'A'
          )
        )
      )
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
    process.env.USE_DIRECT_FCM !== "false" &&
    process.env.FCM_DISPATCH_MODE !== "gateway" &&
    !!getServiceAccount();

  if (useDirect) {
    try {
      const directResult = await sendDirectFcmV1({
        deviceToken: payload.device_token,
        title: payload.title,
        body: payload.body,
        screen: payload.data?.screen,
        dataPayload: payload.data?.data,
        portalUrl: payload.portalUrl,
      });

      if (directResult && directResult.success) {
        return directResult;
      }

      logger.warn("Direct FCM v1 failed, falling back to gateway...", {
        error: directResult?.error,
      });
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

const buildApprovalEmailHtml = ({
  title,
  msgtext,
  actionName,
  notificationId,
  stageNumber,
  requesterName,
  requesterEmail,
  docNum,
  requisitionNo,
  amount,
  costCenter,
  empName,
  requestDate,
  portalUrl,
  tableHtml = "",
}) => {
  const displayDoc =
    requisitionNo || docNum
      ? `${requisitionNo ? requisitionNo : `Doc #${docNum}`}`
      : `Ref #${notificationId}`;
  const formattedAmount =
    amount !== undefined &&
    amount !== null &&
    amount !== "" &&
    Number(amount) > 0
      ? Number(amount).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #d32f2f; padding: 24px 30px; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 20px; margin-bottom: 8px;">
                      Approval Required
                    </span>
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3;">
                      ${title}
                    </h1>
                    <p style="color: rgba(255, 255, 255, 0.9); margin: 6px 0 0 0; font-size: 13px;">
                      Document Ref: <strong>${displayDoc}</strong>
                    </p>
                  </td>
                  ${
                    stageNumber
                      ? `
                  <td align="right" valign="top" style="white-space: nowrap;">
                    <span style="background-color: #ffffff; color: #d32f2f; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 6px; display: inline-block;">
                      Stage ${stageNumber}
                    </span>
                  </td>`
                      : ""
                  }
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 30px;">
              
              <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 18px 0;">
                A new request requires your review and approval in <strong>LogSuite</strong>.
              </p>

              <!-- Document Details Table -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px; line-height: 1.6;">
                      <tr>
                        <td style="color: #64748b; width: 140px; padding: 4px 0; font-weight: 500;">Document Ref:</td>
                        <td style="color: #0f172a; font-weight: 700; padding: 4px 0;">${displayDoc}</td>
                      </tr>
                      ${
                        requesterName
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 4px 0; font-weight: 500;">Requested By:</td>
                        <td style="color: #0f172a; padding: 4px 0;">${requesterName} ${requesterEmail ? `<span style="color: #64748b; font-size: 12px;">(${requesterEmail})</span>` : ""}</td>
                      </tr>`
                          : ""
                      }
                      ${
                        requestDate
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 4px 0; font-weight: 500;">Request Date:</td>
                        <td style="color: #0f172a; padding: 4px 0;">${requestDate}</td>
                      </tr>`
                          : ""
                      }
                      ${
                        formattedAmount
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 4px 0; font-weight: 500;">Total Amount:</td>
                        <td style="color: #d32f2f; font-weight: 700; font-size: 15px; padding: 4px 0;">${formattedAmount}</td>
                      </tr>`
                          : ""
                      }
                      ${
                        empName
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 4px 0; font-weight: 500;">Beneficiary:</td>
                        <td style="color: #0f172a; padding: 4px 0;">${empName}</td>
                      </tr>`
                          : ""
                      }
                      ${
                        costCenter
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 4px 0; font-weight: 500;">Cost Center:</td>
                        <td style="color: #0f172a; padding: 4px 0;">${costCenter}</td>
                      </tr>`
                          : ""
                      }
                      ${
                        msgtext &&
                        msgtext.trim() &&
                        msgtext.trim() !== "ok" &&
                        msgtext.trim() !== "wq"
                          ? `
                      <tr>
                        <td style="color: #64748b; padding: 4px 0; font-weight: 500;">Remarks / Notes:</td>
                        <td style="color: #0f172a; padding: 4px 0;">${msgtext}</td>
                      </tr>`
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>

              ${
                tableHtml
                  ? `
              <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #475569; text-transform: uppercase;">Details</h4>
                ${tableHtml}
              </div>`
                  : ""
              }

              <!-- Action Button -->
              ${
                portalUrl
                  ? `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 10px 0;">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" target="_blank" style="background-color: #d32f2f; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block; box-shadow: 0 2px 4px rgba(211, 47, 47, 0.3);">
                      Open in LogSuite &rarr;
                    </a>
                  </td>
                </tr>
              </table>`
                  : ""
              }

            </td>
          </tr>



          <!-- Footer -->
          <tr>
            <td style="background-color: #ffffff; padding: 18px 30px; text-align: center; border-top: 1px solid #f1f5f9;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                Sent automatically by <strong>DCC LogSuite Notification Service</strong>
              </p>
              <p style="font-size: 10px; color: #cbd5e1; margin: 0;">
                Please do not reply directly to this automated email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const buildAlertEmailHtml = ({
  title,
  msgtext,
  actionName,
  notificationId,
  tableHtml = "",
  portalUrl = "",
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #1e293b; padding: 22px 30px; text-align: left;">
              <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #93c5fd; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 20px; margin-bottom: 8px;">
                System Alert
              </span>
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3;">
                ${title}
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 30px;">
              ${
                msgtext && msgtext.trim()
                  ? `
              <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 18px 0;">
                ${msgtext}
              </p>`
                  : ""
              }

              ${
                tableHtml
                  ? `
              <div style="margin: 15px 0;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #475569; text-transform: uppercase;">Alert Data</h4>
                ${tableHtml}
              </div>`
                  : ""
              }

              ${
                portalUrl
                  ? `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0 10px 0;">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" target="_blank" style="background-color: #1e293b; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-block;">
                      Open LogSuite Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>`
                  : ""
              }
            </td>
          </tr>



          <!-- Footer -->
          <tr>
            <td style="background-color: #ffffff; padding: 18px 30px; text-align: center; border-top: 1px solid #f1f5f9;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                Sent automatically by <strong>DCC LogSuite Notification Service</strong>
              </p>
              <p style="font-size: 10px; color: #cbd5e1; margin: 0;">
                Please do not reply directly to this automated email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const dispatchNotificationEmail = async ({
  token,
  blApiUrl,
  notificationId,
  title,
  msgtext,
  actionName,
  tableRows,
  dbName = "",
  portalUrl = "",
}) => {
  try {
    if (!notificationId) return;

    // 1. Look up notification, user, and approval / alert details
    const notifUserRows = await executeUdfQuery({
      token,
      query: `
        SELECT TOP 1 
          n.id,
          n.title,
          n.msgtext,
          n.notifier_id,
          n.parent_id,
          n.parent_source,
          n.request_detail_id,
          n.action_name,
          n.sequence_stage,
          n.createdate as notif_date,
          ISNULL(u.email, ISNULL(usr.email, '')) as notifier_email,
          ISNULL(u.first_name, ISNULL(usr.first_name, '')) as first_name,
          ISNULL(u.last_name, ISNULL(usr.last_name, '')) as last_name,
          ISNULL(u.username, ISNULL(usr.username, '')) as username,
          CASE 
            WHEN n.parent_source = 2 THEN ISNULL(app_u.email, 'Y')
            WHEN n.parent_source = 1 THEN ISNULL(alt_u.email, 'Y')
            ELSE 'Y'
          END as is_email_enabled,
          req.requested_by as app_requested_by,
          req.request_date as app_request_date,
          req.request_details as app_request_details,
          req.request_status as app_request_status,
          req.table_name as app_table_name,
          req.action_id as app_action_id,
          det.stepnumber as app_stepnumber,
          requser.username as req_username,
          requser.first_name as req_first_name,
          requser.last_name as req_last_name,
          requser.email as req_email
        FROM m_notifications n
        LEFT JOIN m_user_master usr ON n.notifier_id = usr.id
        LEFT JOIN vw_lookup_user_setup u ON n.notifier_id = u.id
        -- For approvals (parent_source = 2)
        LEFT JOIN m_approval_request req ON n.parent_id = req.id AND n.parent_source = 2
        LEFT JOIN m_approval_request_details det ON n.request_detail_id = det.id AND n.parent_source = 2
        LEFT JOIN m_approval_setup_user app_u ON req.approval_id = app_u.parent_id 
             AND n.notifier_id = app_u.user_id 
             AND det.stepnumber = app_u.stepnumber
        LEFT JOIN vw_lookup_user_setup requser ON req.requested_by = requser.id
        -- For alerts (parent_source = 1)
        LEFT JOIN m_alert_setup_user alt_u ON n.parent_id = alt_u.parent_id 
             AND n.notifier_id = alt_u.user_id 
             AND n.parent_source = 1
        WHERE n.id = ${Number(notificationId)}
      `,
      blApiUrl,
    });

    const notif = notifUserRows?.[0];
    const isEmailEnabled = notif?.is_email_enabled !== "N";
    const recipientEmail = notif?.notifier_email
      ? String(notif.notifier_email).trim()
      : "";

    if (!isEmailEnabled) {
      logger.info(
        "Email notification is disabled for user in setup; skipping email dispatch",
        {
          notificationId,
          recipient: recipientEmail,
        },
      );
      return;
    }

    if (!recipientEmail || !recipientEmail.includes("@")) {
      logger.debug("No valid recipient email found for notification", {
        notificationId,
        recipientEmail,
      });
      return;
    }

    let docRecord = null;
    if (notif?.app_table_name && notif?.app_action_id) {
      try {
        const docRows = await executeUdfQuery({
          token,
          query: `SELECT TOP 1 * FROM ${notif.app_table_name} WHERE id = ${Number(notif.app_action_id)}`,
          blApiUrl,
        });
        if (Array.isArray(docRows) && docRows.length > 0) {
          docRecord = docRows[0];
        }
      } catch (docErr) {
        logger.debug("Could not fetch underlying document details", {
          table: notif.app_table_name,
          id: notif.app_action_id,
          error: docErr.message,
        });
      }
    }

    // 3. Fetch SMTP configuration
    let smtp = null;
    try {
      const {
        fetchSmtpConfig,
      } = require("../emailScheduler/emailerSmtpAccountService");
      smtp = await fetchSmtpConfig({ token, blApiUrl, dbName });
    } catch (e) {}

    const defaultFrom =
      process.env.DEFAULT_FROM_EMAIL ||
      process.env.DEFAULT_EMAIL_FROM ||
      "enotifications@mowara.co.tz";
    const server = smtp?.server_name || smtp?.server || "in-v3.mailjet.com";
    const fromEmail = smtp?.email_address || smtp?.email || defaultFrom;
    const username = smtp?.user_name || smtp?.email_address || "";
    const password = smtp?.password || "";
    const port = smtp?.port_number || smtp?.port || 587;

    let tableHtml = "";
    if (Array.isArray(tableRows) && tableRows.length > 0) {
      try {
        const {
          formatResultsToHtmlTable,
        } = require("../workflowEmail/workflowEmailService");
        tableHtml = formatResultsToHtmlTable(tableRows);
      } catch (_) {}
    }

    let resolvedPortalUrl = portalUrl;
    if (!resolvedPortalUrl && dbName) {
      try {
        const { fetchDomainData } = require("../common/urlService");
        const domainData = await fetchDomainData(dbName);
        resolvedPortalUrl = domainData?.url || "";
      } catch (_) {}
    }

    const isApproval = Number(notif?.parent_source) === 2;
    let emailSubject = "";
    let emailHtml = "";

    if (isApproval) {
      const reqName =
        notif?.req_first_name || notif?.req_last_name
          ? `${notif.req_first_name || ""} ${notif.req_last_name || ""}`.trim()
          : notif?.req_username || "";
      const reqDate = notif?.app_request_date
        ? dayjs(notif.app_request_date).format("DD-MMM-YYYY HH:mm")
        : "";
      const docNum = docRecord?.doc_num || "";
      const requisitionNo = docRecord?.requisition_no || "";
      const displayDoc =
        requisitionNo || docNum
          ? `${requisitionNo ? requisitionNo : `Doc #${docNum}`}`
          : `Ref #${notificationId}`;
      const amount =
        docRecord?.amount ||
        docRecord?.total_amount ||
        docRecord?.trans_amt ||
        null;
      const costCenter = docRecord?.cost_center || "";
      const empName = docRecord?.emp_name || "";

      emailSubject = `[LogSuite Approval] ${title} - ${displayDoc}`;
      emailHtml = buildApprovalEmailHtml({
        title,
        msgtext,
        actionName: actionName || notif?.action_name,
        notificationId,
        stageNumber: notif?.sequence_stage || notif?.app_stepnumber,
        requesterName: reqName,
        requesterEmail: notif?.req_email,
        docNum,
        requisitionNo,
        amount,
        costCenter,
        empName,
        requestDate: reqDate,
        portalUrl: resolvedPortalUrl,
        tableHtml,
      });
    } else {
      emailSubject = `[LogSuite Alert] ${title}`;
      emailHtml = buildAlertEmailHtml({
        title,
        msgtext,
        actionName: actionName || notif?.action_name,
        notificationId,
        tableHtml,
        portalUrl: resolvedPortalUrl,
      });
    }

    const emailPayload = {
      from: fromEmail,
      to: [recipientEmail],
      subject: emailSubject,
      text: msgtext || title,
      html: emailHtml,
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
    const apiKey =
      process.env.SEND_EMAIL_API_TOKEN ||
      "EAAWOFw8QuSgBOZB6IYFbdSTpTBWD9pXeI5DEZB8ZCs8Ivtg7Fopi9llcc5hddMgUx65IiLe7cZCJevlWMV7JVkTbwm8qG7FMDh3PMoiGabhuufRtgRV32gy0Ttw0XeZAJcBj48gEywbPrQ3K6wxL0ZBabBfsVhGBcqVTxGWHJ1UZBUXPkKoMiJ1QbIHnBAu0pL1";

    let emailRes = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        emailRes = await axios.post(sendEmailUrl, emailPayload, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 30000,
        });
        break;
      } catch (err) {
        if (err.response?.status === 429 && attempt < 3) {
          logger.warn(
            `Push notification email 429 rate limit hit, retrying attempt ${attempt + 1} in 2s...`,
            {
              notificationId,
              recipient: recipientEmail,
            },
          );
          await sleep(2000 * attempt);
        } else {
          throw err;
        }
      }
    }

    logger.info("Push notification email dispatched successfully", {
      notificationId,
      recipient: recipientEmail,
      status: emailRes?.status,
    });
    await sleep(500);
  } catch (emailErr) {
    logger.error("Failed to dispatch push notification email", {
      notificationId,
      error: emailErr.message,
    });
  }
};

const processSinglePushNotification = async ({
  item,
  token,
  blApiUrl,
  dbName = "",
  portalUrl = "",
}) => {
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
      if (parentId > 0) {
        const currentStep = Number(item.stepnumber || item.sequence_stage || 1);
        const pendingPrior = await executeUdfQuery({
          token,
          query: `SELECT COUNT(1) as cnt FROM m_approval_request_details WITH(NOLOCK) WHERE parent_id = ${parentId} AND stepnumber < ${currentStep} AND request_status != 'A'`,
          blApiUrl,
        });
        const pendingCount = Number(pendingPrior?.[0]?.cnt || 0);
        if (pendingCount > 0) {
          logger.warn(
            `Skipping approval notification ${notificationId} (stage ${currentStep}) because previous stages are still pending approval`,
            {
              notificationId,
              parentId,
              currentStep,
              pendingPriorCount: pendingCount,
            },
          );
          return { success: false, alertId: null };
        }
      }
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
        portalUrl,
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
      logger.info(
        "No mobile FCM token registered for user; sending email notification directly",
        {
          notificationId,
          statusId,
        },
      );
    }

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
        dbName,
        portalUrl,
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
