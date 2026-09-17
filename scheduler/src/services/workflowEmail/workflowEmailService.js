const axios = require("axios");
const { executeUdfQuery } = require("../pushNotification/pushNotificationService");
const logger = require("../../utils/logger");

const formatResultsToHtmlTable = (rows) => {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  const columns = Object.keys(rows[0]);
  let html = `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; margin-bottom: 12px;">`;

  html += `<thead><tr style="background-color: #e60000; color: #ffffff; text-align: center;">`;
  columns.forEach((col) => {
    html += `<th style="padding: 6px; border: 1px solid #000000; font-weight: bold; font-size: 11px;">${col}</th>`;
  });
  html += `</tr></thead><tbody>`;

  rows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? "#ffffff" : "#f9f9f9";
    html += `<tr style="background-color: ${bg};">`;
    columns.forEach((col) => {
      const val = row[col] !== null && row[col] !== undefined ? row[col] : "";
      html += `<td style="padding: 5px; border: 1px solid #cccccc; color: #333333; text-align: left;">${val}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  return html;
};

const fetchPendingWorkflowEmails = async ({ token, blApiUrl }) => {
  try {
    const data = await executeUdfQuery({
      token,
      query: "SELECT TOP 5 * FROM [vw_emailer_workflow_list]",
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
    logger.error("Error fetching workflow emails", { error: err.message });
    return [];
  }
};

const updateWorkflowEventTracking = async ({
  token,
  blApiUrl,
  workflowId,
  trackingId,
  responseMessage,
}) => {
  try {
    const safeMsg = String(responseMessage || "").replace(/'/g, "''");
    const query = `UPDATE d_workflow_event_tracking SET is_processed = 'Y', process_date = GETDATE(), alert_response = '${safeMsg}' WHERE workflow_id = '${workflowId}' AND id = '${trackingId}'`;
    await executeUdfQuery({ token, query, blApiUrl });
  } catch (err) {
    logger.error("Error updating d_workflow_event_tracking", {
      workflowId,
      trackingId,
      error: err.message,
    });
  }
};

const processAndSendWorkflowEmail = async ({
  workflowItem,
  token,
  blApiUrl,
}) => {
  const workflowId = workflowItem.workflow_id || workflowItem.workflowId;
  const trackingId = workflowItem.tracking_id || workflowItem.trackingId;
  const actionName = workflowItem.title || "Workflow Notification";
  const toRaw = workflowItem.email || workflowItem.email_to || "";
  const server = workflowItem.server_name || "";
  const fromEmail = workflowItem.email_address || "";
  const password = workflowItem.password || "";

  logger.info(`Processing workflow email`, {
    workflowId,
    trackingId,
    actionName,
  });

  const toList = String(toRaw)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (toList.length === 0) {
    logger.warn(`Workflow email has no recipients, skipping`, {
      workflowId,
      trackingId,
    });
    await updateWorkflowEventTracking({
      token,
      blApiUrl,
      workflowId,
      trackingId,
      responseMessage: "No recipient email provided",
    });
    return;
  }

  let body = String(workflowItem.msg_body || "");

  const queries = [
    workflowItem.query,
    workflowItem.query_1,
    workflowItem.query_2,
    workflowItem.query_3,
    workflowItem.query_4,
  ];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (q && String(q).trim()) {
      try {
        const rows = await executeUdfQuery({
          token,
          query: String(q).trim(),
          blApiUrl,
        });

        if (Array.isArray(rows) && rows.length > 0) {
          const tableHtml = formatResultsToHtmlTable(rows);
          body = body.replace(
            new RegExp(`\\{query_result_${i}\\}`, "g"),
            tableHtml,
          );
        } else {
          body = body.replace(new RegExp(`\\{query_result_${i}\\}`, "g"), "");
        }
      } catch (err) {
        logger.error(`Error executing query_${i} for workflow email`, {
          error: err.message,
        });
        body = body.replace(new RegExp(`\\{query_result_${i}\\}`, "g"), "");
      }
    } else {
      body = body.replace(new RegExp(`\\{query_result_${i}\\}`, "g"), "");
    }
  }

  const emailPayload = {
    from: fromEmail,
    to: toList,
    subject: actionName,
    text: actionName,
    html: body,
    smtp: {
      server,
      email: fromEmail,
      password,
    },
  };

  const sendEmailUrl =
    process.env.SEND_EMAIL_API_URL ||
    "https://microservices.dcctz.com/api/send_email";
  const apiKey =
    process.env.SEND_EMAIL_API_TOKEN ||
    "EAAWOFw8QuSgBOZB6IYFbdSTpTBWD9pXeI5DEZB8ZCs8Ivtg7Fopi9llcc5hddMgUx65IiLe7cZCJevlWMV7JVkTbwm8qG7FMDh3PMoiGabhuufRtgRV32gy0Ttw0XeZAJcBj48gEywbPrQ3K6wxL0ZBabBfsVhGBcqVTxGWHJ1UZBUXPkKoMiJ1QbIHnBAu0pL1";

  try {
    const response = await axios.post(sendEmailUrl, emailPayload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });

    let resData = response.data;
    if (typeof resData === "string") {
      try {
        resData = JSON.parse(resData);
      } catch (e) {}
    }

    const success =
      resData?.success === true ||
      resData?.status === "success" ||
      response.status === 200;

    if (success) {
      logger.info(`Workflow email sent successfully`, {
        workflowId,
        trackingId,
      });
      await updateWorkflowEventTracking({
        token,
        blApiUrl,
        workflowId,
        trackingId,
        responseMessage: "success",
      });
    } else {
      const errMsg = JSON.stringify(resData);
      logger.warn(`Workflow email API reported failure`, {
        workflowId,
        trackingId,
        error: errMsg,
      });
      await updateWorkflowEventTracking({
        token,
        blApiUrl,
        workflowId,
        trackingId,
        responseMessage: errMsg,
      });
    }
  } catch (err) {
    const errMsg = err.message || "Failed to dispatch workflow email";
    logger.error(`Failed to send workflow email`, {
      workflowId,
      trackingId,
      error: errMsg,
    });
    await updateWorkflowEventTracking({
      token,
      blApiUrl,
      workflowId,
      trackingId,
      responseMessage: errMsg,
    });
  }
};

module.exports = {
  formatResultsToHtmlTable,
  fetchPendingWorkflowEmails,
  processAndSendWorkflowEmail,
  updateWorkflowEventTracking,
};
