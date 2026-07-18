const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");
const { replaceApiUrlPrefix } = require("./urlService");
const logger = require("../utils/logger");

/**
 * Fetches all active Alert Setups for a given database.
 * @param {Object} params
 * @param {string} params.token
 * @param {string} params.blApiUrl
 * @returns {Promise<Array>}
 */
const fetchAlertSetups = async ({ token, blApiUrl }) => {
  try {
    const baseUrl = "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/AlertSetup";
    const url = replaceApiUrlPrefix(baseUrl, blApiUrl);
    
    logger.info(`Fetching Alert Setups`, { url });
    const res = await axios.get(url, {
      headers: buildApiHeaders({ bearerToken: token }),
    });

    let data = res.data?.data || res.data?.tblData || [];
    
    if (data && !Array.isArray(data)) {
      data = [data];
    }
    
    return data;
  } catch (err) {
    logger.error(`Failed to fetch Alert Setups`, {
      error: err.message,
      status: err.response?.status,
    });
    return [];
  }
};

/**
 * Fetches the specific Alert Setup by ID if needed.
 */
const fetchAlertSetupById = async ({ token, blApiUrl, id }) => {
  try {
    const baseUrl = `https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/AlertSetup/${id}`;
    const url = replaceApiUrlPrefix(baseUrl, blApiUrl);
    
    logger.info(`Fetching Alert Setup by ID`, { url, id });
    const res = await axios.get(url, {
      headers: buildApiHeaders({ bearerToken: token }),
    });

    let data = res.data?.data || res.data?.tblData || [];
    if (data && !Array.isArray(data)) {
      data = [data];
    }
    
    return data.length > 0 ? data[0] : null;
  } catch (err) {
    logger.error(`Failed to fetch Alert Setup ${id}`, {
      error: err.message,
      status: err.response?.status,
    });
    return null;
  }
};

/**
 * Executes a dynamic query for an alert.
 * @param {Object} params
 * @param {string} params.token
 * @param {string} params.query
 * @param {string} params.blApiUrl
 * @returns {Promise<Object|null>}
 */
const executeAlertQuery = async ({ token, query, blApiUrl }) => {
  try {
    logger.info(`Executing Alert Query`, { query });

    const baseUrl = "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/UDF_query";
    const url = replaceApiUrlPrefix(baseUrl, blApiUrl);
    
    const res = await axios({
      method: "POST",
      url: url,
      headers: {
        ...buildApiHeaders({ bearerToken: token }),
        "Content-Type": "application/json",
      },
      data: { query },
    });

    let responseData = res.data;
    if (typeof responseData === "string") {
      try {
        responseData = JSON.parse(responseData);
      } catch (e) {
        logger.warn("Alert Query Response is a string but not valid JSON");
      }
    }

    const data =
      responseData?.tblData || responseData?.data || responseData?.result;

    return data;
  } catch (err) {
    logger.error(`Failed to execute Alert Query`, {
      error: err.message,
      status: err.response?.status,
    });
    return null;
  }
};

module.exports = {
  fetchAlertSetups,
  fetchAlertSetupById,
  executeAlertQuery,
};
