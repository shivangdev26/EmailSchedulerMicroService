const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");

/**
 *
 * @param {Object} params
 * @param {string} params.token
 * @param {number} params.id
 * @param {number} params.email_queu
 * @param {string} params.ack_status
 * @param {string} [params.tgr_status='s']
 * @param {string} params.status
 * @param {string} [params.dbName]
 * @param {number} [params.EntityId]
 * @param {number} [params.ChildId]
 * @param {string} [params.response]
 * @param {number} [params.retry_count]
 */
const updateEmailQueueStatus = async ({
  token,
  id = 0,
  email_queue_id,
  ack_status,
  tgr_status = "s",
  status,
  dbName = "",
  EntityId = 0,
  ChildId = 0,
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
        EntityId: EntityId,
        ChildId: ChildId,
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
    if (!url) {
      throw new Error("EMAILER_ACK_URL environment variable is not defined");
    }
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
