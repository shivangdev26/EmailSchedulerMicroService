const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");

/**
 * Fetches dynamic data using the UDF_query API to replace placeholders.
 *
 * @param {Object} params
 * @param {string} params.token - Bearer token
 * @param {string} params.tableName - The table name (event_name from config)
 * @param {number} params.entityId - The EntityId from trigger
 * @returns {Promise<Object|null>} The first row of data or null
 */
const fetchUdfData = async ({ token, tableName, entityId }) => {
  try {
    const query = `select * FROM ${tableName} where id=${entityId}`;
    console.log(` Executing UDF Query: ${query}`);

    const res = await axios({
      method: "POST",
      url: process.env.UDF_QUERY_URL,
      headers: {
        ...buildApiHeaders({ bearerToken: token }),
        "Content-Type": "application/json",
      },
      data: { query },
    });

    console.log(` UDF Query API status:`, res.status);

    let responseData = res.data;
    if (typeof responseData === "string") {
      try {
        responseData = JSON.parse(responseData);
      } catch (e) {
        console.warn(" UDF Query Response is a string but not valid JSON");
      }
    }

    console.log(
      ` UDF Query API Response:`,
      JSON.stringify(responseData, null, 2),
    );

    // The API usually returns data in res.data.data or res.data.tblData
    const data =
      responseData?.tblData || responseData?.data || responseData?.result;

    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data;
    }

    return null;
  } catch (err) {
    console.error(
      ` Failed to fetch UDF data for ${tableName} (ID: ${entityId}):`,
      err.response?.status,
      err.message,
    );
    return null;
  }
};

/**
 * Replaces placeholders in a string using provided data.
 *
 * @param {string} text - The text containing placeholders like {{field_name}}
 * @param {Object} data - The data object containing values
 * @returns {string} The text with placeholders replaced
 */
const replacePlaceholders = (text, data) => {
  if (!text || !data) return text || "";

  return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : match;
  });
};

module.exports = { fetchUdfData, replacePlaceholders };
