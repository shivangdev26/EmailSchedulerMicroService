const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");
const dayjs = require("dayjs");

/**
 *
 * @param {Object} params
 * @param {string} params.token
 * @param {string} params.tableName
 * @param {number} params.entityId
 * @returns {Promise<Object|null>}  */
const fetchUdfData = async ({ token, tableName, entityId }) => {
  try {
    const query = `select * FROM ${tableName} where id=${entityId}`;
    console.log(` Executing UDF Query: ${query}`);

    const url = process.env.UDF_QUERY_URL;
    if (!url) {
      throw new Error("UDF_QUERY_URL environment variable is not defined");
    }
    const res = await axios({
      method: "POST",
      url: url,
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
 *
 * @param {string} text
 * @param {Object} data
 * @returns {string}
 */
const replacePlaceholders = (text, data) => {
  if (!text || !data) return text || "";

  return text.replace(/\{\{(.*?)\}\}/g, (match, content) => {
    const parts = content.split("|").map((p) => p.trim());
    const key = parts[0];
    let value = data[key];

    if (value === undefined) return match;

    if (parts.length > 1) {
      const filterPart = parts[1];
      if (filterPart.startsWith("date:")) {
        const formatMatch = filterPart.match(/date:\s*"(.*?)"/);
        if (formatMatch) {
          let format = formatMatch[1];

          format = format
            .replace(/%d|d/g, "DD")
            .replace(/%m|m/g, "MM")
            .replace(/%Y|Y/g, "YYYY")
            .replace(/%y|y/g, "YY");

          const date = dayjs(value);
          if (date.isValid()) {
            return date.format(format);
          }
        }
      }

      if (filterPart.startsWith("floatformat:")) {
        const precisionMatch = filterPart.match(/floatformat:\s*(\d+)/);
        if (precisionMatch) {
          const N = parseInt(precisionMatch[1]);
          const num = parseFloat(value);
          if (!isNaN(num)) {
            const fixed = num.toFixed(N);
            const parts = fixed.split(".");
            let integerPart = parts[0];
            const decimalPart = parts.length > 1 ? "." + parts[1] : "";

            const regex = new RegExp(`(\\d)(?=(\\d{${N}})+(?!\\d))`, "g");
            integerPart = integerPart.replace(regex, "$1,");

            return integerPart + decimalPart;
          }
        }
      }
    }

    return String(value);
  });
};

module.exports = { fetchUdfData, replacePlaceholders };
