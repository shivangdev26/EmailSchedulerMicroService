const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");

/**
 * Updates the email queue status in the remote system.
 *
 * @param {Object} params
 * @param {string} params.token - Bearer token for authentication
 * @param {number} params.id - The record ID (from trigger payload)
 * @param {number} params.email_queue_id - The event ID to acknowledge
 * @param {string} params.ack_status - 'Y' or 'N'
 * @param {string} [params.tgr_status='s'] - 'Y' or 's'
 * @param {string} params.status - 'pending', 'Y' (success), or 'failed'
 * @param {string} [params.dbName] - Database name to include in user_fields
 * @param {string} [params.response] - Optional response message or error reason
 * @param {number} [params.retry_count] - Current retry count
 */
const updateEmailQueueStatus = async ({
  token,
  id = 0,
  email_queue_id,
  ack_status,
  tgr_status = "s",
  status,
  dbName = "",
  response = "",
  retry_count = 0,
}) => {
  try {
    const payload = {
      createdate: new Date().toISOString(),
      updatedate: new Date().toISOString(),
      createdby: 0,
      updatedby: 0,
      log_inst: 0,
      user_fields: {
        dbName: dbName,
        recordId: id,
      },
      m_approval_request: [],
      removeChildren: [],
      id: 0,
      email_queue_id: email_queue_id,
      tgr_status: tgr_status,
      ack_status: ack_status,
      status: status,
      response: response,
      retry_count: retry_count,
    };

    const url = process.env.EMAILER_ACK_URL;
    console.log(` Calling Acknowledgment API: ${url}`);
    const res = await axios({
      method: "POST",
      url: url,
      headers: {
        ...buildApiHeaders({ bearerToken: token }),
        "Content-Type": "application/json",
      },
      data: payload,
    });

    console.log(
      ` Acknowledgment API (ID: ${email_queue_id}, Status: ${status}) response status:`,
      res.status,
    );
    console.log(
      ` Acknowledgment API Response Data:`,
      JSON.stringify(res.data, null, 2),
    );
    return res.data;
  } catch (err) {
    console.error(
      ` Failed to update acknowledgment status for ID ${email_queue_id}:`,
      err.response?.status,
      err.message,
    );
    return null;
  }
};

module.exports = { updateEmailQueueStatus };
