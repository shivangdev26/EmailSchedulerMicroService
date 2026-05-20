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

const executeMultipleQueries = async ({ token, action }) => {
  const url = process.env.UDF_QUERY_URL;
  if (!url) {
    throw new Error("UDF_QUERY_URL environment variable is not defined");
  }

  // console.log(`[executeMultipleQueries] Starting for action ${action.id}`);

  const queries = [];
  const subtitleQueries = [];

  // Collect main queries (query, query_1, query_2, query_3, query_4)
  if (action.query && action.query.trim())
    queries.push({ index: 0, query: action.query.trim() });
  if (action.query_1 && action.query_1.trim())
    queries.push({ index: 1, query: action.query_1.trim() });
  if (action.query_2 && action.query_2.trim())
    queries.push({ index: 2, query: action.query_2.trim() });
  if (action.query_3 && action.query_3.trim())
    queries.push({ index: 3, query: action.query_3.trim() });
  if (action.query_4 && action.query_4.trim())
    queries.push({ index: 4, query: action.query_4.trim() });

  // console.log(
  //   `[executeMultipleQueries] Collected ${queries.length} queries:`,
  //   queries.map((q) => ({
  //     index: q.index,
  //     query: q.query.slice(0, 50) + "...",
  //   })),
  // );

  // Collect subtitle queries (subtitle_query, subtitle_query1, subtitle_query2, subtitle_query3, subtitle_query4)
  if (action.subtitle_query && action.subtitle_query.trim())
    subtitleQueries.push({ index: 0, text: action.subtitle_query.trim() });
  if (action.subtitle_query1 && action.subtitle_query1.trim())
    subtitleQueries.push({ index: 1, text: action.subtitle_query1.trim() });
  if (action.subtitle_query2 && action.subtitle_query2.trim())
    subtitleQueries.push({ index: 2, text: action.subtitle_query2.trim() });
  if (action.subtitle_query3 && action.subtitle_query3.trim())
    subtitleQueries.push({ index: 3, text: action.subtitle_query3.trim() });
  if (action.subtitle_query4 && action.subtitle_query4.trim())
    subtitleQueries.push({ index: 4, text: action.subtitle_query4.trim() });

  // console.log(
  //   `[executeMultipleQueries] Collected ${subtitleQueries.length} subtitle queries`,
  // );

  const queryResults = {};
  const rawQueryResults = {}; // For attachments
  for (const { index, query } of queries) {
    try {
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
          // ignore parse errors for now
        }
      }

      const data =
        responseData?.tblData || responseData?.data || responseData?.result;

      queryResults[`query_result_${index}`] = data;
      rawQueryResults[`query_result_${index}`] = data;
    } catch (err) {
      console.error(
        ` Failed to execute query_${index}:`,
        err.response?.status,
        err.message,
      );
      queryResults[`query_result_${index}`] = null;
      rawQueryResults[`query_result_${index}`] = null;
    }
  }

  const subtitleResults = {};
  for (const { index, text } of subtitleQueries) {
    subtitleResults[`subtitle_query_${index}`] = text;
  }

  return {
    ...queryResults,
    ...subtitleResults,
    _rawResults: rawQueryResults,
  };
};

const replaceQueryPlaceholders = (text, data) => {
  if (!text || !data) return text || "";
  return text.replace(
    /\{(query_result_\d+|subtitle_query_\d+)\}/g,
    (match, key) => {
      const value = data[key];
      if (value === undefined || value === null) return match;
      if (Array.isArray(value)) {
        // Format array as HTML table if it's query_result
        if (key.startsWith("query_result_")) {
          if (value.length === 0) return "";
          // Get keys from first item for table headers
          const keys = Object.keys(value[0]);
          let tableHtml = "<table border='1' cellpadding='5' cellspacing='0'>";
          // Add header row
          tableHtml += "<thead><tr>";
          keys.forEach((k) => {
            tableHtml += `<th>${k}</th>`;
          });
          tableHtml += "</tr></thead>";
          // Add data rows
          tableHtml += "<tbody>";
          value.forEach((row) => {
            tableHtml += "<tr>";
            keys.forEach((k) => {
              tableHtml += `<td>${row[k] !== null && row[k] !== undefined ? row[k] : ""}</td>`;
            });
            tableHtml += "</tr>";
          });
          tableHtml += "</tbody></table>";
          return tableHtml;
        }
        return JSON.stringify(value);
      }
      return String(value);
    },
  );
};

module.exports = {
  fetchUdfData,
  replacePlaceholders,
  executeMultipleQueries,
  replaceQueryPlaceholders,
};
