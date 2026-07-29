const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");
const { replaceApiUrlPrefix } = require("./urlService");
const dayjs = require("dayjs");

/**
 *
 * @param {Object} params
 * @param {string} params.token
 * @param {string} params.tableName
 * @param {number} params.entityId
 * @returns {Promise<Object|null>}  */
const fetchUdfData = async ({ token, tableName, entityId, blApiUrl }) => {
  try {
    const query = `select * FROM ${tableName} where id=${entityId}`;
    console.log(` Executing UDF Query: ${query}`);

    const baseUrl = process.env.UDF_QUERY_URL;
    if (!baseUrl) {
      throw new Error("UDF_QUERY_URL environment variable is not defined");
    }
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

const executeMultipleQueries = async ({ token, action, blApiUrl }) => {
  const baseUrl = process.env.UDF_QUERY_URL;
  if (!baseUrl) {
    throw new Error("UDF_QUERY_URL environment variable is not defined");
  }
  const url = replaceApiUrlPrefix(baseUrl, blApiUrl);

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
    /\{(query_result_\d+|subtitle_query_\d+|customer_summary|grouped_data|clean_data)\}/g,
    (match, key) => {
      const value = data[key];
      if (value === undefined || value === null) return match;
      if (Array.isArray(value)) {
        if (value.length === 0) return "";
        const keys = Object.keys(value[0]);

        let tableHtml = `<table style="width: auto; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; text-align: left; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border-radius: 4px; overflow: hidden;">`;

        tableHtml += `<thead><tr style="background-color: #3b82f6; color: #ffffff;">`;
        keys.forEach((k) => {
          tableHtml += `<th style="padding: 3px; font-weight: 600; border-bottom: 1px solid #e2e8f0; border-right: 1px solid rgba(255,255,255,0.1); font-size: 11px; text-transform: uppercase;">${k}</th>`;
        });
        tableHtml += `</tr></thead>`;

        tableHtml += `<tbody>`;
        value.forEach((row, index) => {
          const rowBg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
          tableHtml += `<tr style="background-color: ${rowBg};">`;
          keys.forEach((k) => {
            const cellVal =
              row[k] !== null && row[k] !== undefined ? row[k] : "";
            tableHtml += `<td style="padding: 3px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #475569; font-size: 11px;">${cellVal}</td>`;
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table>`;
        return tableHtml;
      }
      return String(value);
    },
  );
};

//new change

/**
 * Resolves dot-notation placeholders like {{user.name}} by fetching the relation ID
 * from the attachment record, querying the corresponding table, and replacing it.
 *
 * @param {Object} params
 * @param {string} params.text
 * @param {Object} params.attachmentRecord
 * @param {string} params.token
 * @param {string} params.blApiUrl
 * @returns {Promise<string>}
 */
const resolveDotPlaceholders = async ({ text, attachmentRecord, token, blApiUrl }) => {
  if (!text || !attachmentRecord) return text || "";

  const dotRegex = /\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = dotRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const relation = match[1];
    const field = match[2];
    if (!matches.some(m => m.fullMatch === fullMatch)) {
      matches.push({ fullMatch, relation, field });
    }
  }

  if (matches.length === 0) return text;

  let resultText = text;
  const baseUrl = process.env.UDF_QUERY_URL;
  if (!baseUrl) {
    throw new Error("UDF_QUERY_URL environment variable is not defined");
  }
  const url = replaceApiUrlPrefix(baseUrl, blApiUrl);

  for (const item of matches) {
    const { fullMatch, relation, field } = item;


    const isZero = (val) => val !== undefined && val !== null && (val === 0 || val === "0");

    if (
      isZero(attachmentRecord[field]) ||
      isZero(attachmentRecord[`${field}_id`]) ||
      isZero(attachmentRecord[`${relation}_id`]) ||
      isZero(attachmentRecord[relation])
    ) {
      console.log(`[resolveDotPlaceholders] FK value for ${relation}.${field} is 0 (unset). Replacing ${fullMatch} with empty string.`);
      const escapedMatch = fullMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const replRegex = new RegExp(escapedMatch, 'gi');
      resultText = resultText.replace(replRegex, "");
      continue;
    }

    const isValidId = (val) => {
      if (val === undefined || val === null || val === "") return false;
      const num = Number(val);
      return !isNaN(num) && num > 0;
    };

    let relationId;
    if (isValidId(attachmentRecord[field])) {
      relationId = attachmentRecord[field];
    } else if (isValidId(attachmentRecord[`${field}_id`])) {
      relationId = attachmentRecord[`${field}_id`];
    } else {
      const strippedField = typeof field === 'string' ? field.replace(/_no|_id/g, '') : '';
      const mappedField = typeof field === 'string' ? field.replace(/_no/g, '_id') : '';
      if (strippedField && isValidId(attachmentRecord[strippedField])) {
        relationId = attachmentRecord[strippedField];
      } else if (mappedField && isValidId(attachmentRecord[mappedField])) {
        relationId = attachmentRecord[mappedField];
      } else if (isValidId(attachmentRecord[`${relation}_id`])) {
        relationId = attachmentRecord[`${relation}_id`];
      } else if (isValidId(attachmentRecord[relation])) {
        relationId = attachmentRecord[relation];
      } else if (isValidId(attachmentRecord.id)) {
        relationId = attachmentRecord.id;
      }
    }

    if (relationId === undefined || relationId === null) {
      console.warn(`[resolveDotPlaceholders] No ID found in attachment record for relation: ${relation}`);
      continue;
    }

    const candidates = [
      relation,
      `m_${relation}_master`,
      relation.endsWith("s") ? relation : `${relation}s`
    ];

    let tblData = [];
    let succeeded = false;

    const getPrimaryKeyColumn = async (tableName) => {
      try {
        const pkQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = '${tableName}'`;
        const res = await axios({
          method: "POST",
          url: url,
          headers: {
            ...buildApiHeaders({ bearerToken: token }),
            "Content-Type": "application/json",
          },
          data: { query: pkQuery },
        });

        let responseData = res.data;
        if (typeof responseData === "string") {
          try {
            responseData = JSON.parse(responseData);
          } catch { }
        }

        const rows = responseData?.tblData || responseData?.data || responseData?.result || [];
        if (rows.length > 0) {
          const colName = rows[0].COLUMN_NAME || rows[0].column_name || rows[0].columN_NAME || rows[0].ColumN_Name;
          if (colName) return colName;
        }
      } catch (err) {
        console.error(`[resolveDotPlaceholders] Error fetching PK for ${tableName}:`, err.message);
      }
      return "id";
    };

    const runQuery = async (tableName) => {
      const pkColumn = await getPrimaryKeyColumn(tableName);
      const query = `select * from ${tableName} where ${pkColumn} = ${relationId}`;
      console.log(`[resolveDotPlaceholders] Trying table '${tableName}' on PK '${pkColumn}': ${query}`);
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
        } catch { }
      }

      if (responseData && responseData.succeeded === false) {
        return null;
      }
      return responseData?.tblData || responseData?.data || responseData?.result || [];
    };

    for (const tableName of candidates) {
      try {
        const parsed = await runQuery(tableName);
        if (parsed && parsed.length > 0) {
          tblData = parsed;
          succeeded = true;
          break;
        }
      } catch (err) {
      }
    }

    if (!succeeded) {
      try {
        console.log(`[resolveDotPlaceholders] No candidate matched. Searching database schema for relation: ${relation}`);
        const schemaQuery = `SELECT TOP 1 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%${relation}%' OR REPLACE(TABLE_NAME, '_', '') LIKE '%${relation}%' ORDER BY CASE WHEN TABLE_NAME LIKE '%_header' THEN 1 ELSE 2 END`;
        const res = await axios({
          method: "POST",
          url: url,
          headers: {
            ...buildApiHeaders({ bearerToken: token }),
            "Content-Type": "application/json",
          },
          data: { query: schemaQuery },
        });

        let responseData = res.data;
        if (typeof responseData === "string") {
          try {
            responseData = JSON.parse(responseData);
          } catch { }
        }

        const schemaRows = responseData?.tblData || responseData?.data || responseData?.result || [];
        if (schemaRows.length > 0) {
          const matchedTable = schemaRows[0].TABLE_NAME || schemaRows[0].table_name || schemaRows[0].tablE_NAME;
          if (matchedTable) {
            console.log(`[resolveDotPlaceholders] Found fuzzy matched table: ${matchedTable}`);
            const parsed = await runQuery(matchedTable);
            if (parsed && parsed.length > 0) {
              tblData = parsed;
              succeeded = true;
            }
          }
        }
      } catch (err) {
        console.error(`[resolveDotPlaceholders] Schema search error for ${relation}:`, err.message);
      }
    }

    if (succeeded && tblData.length > 0) {
      const relRecord = tblData[0];
      const relKeys = Object.keys(relRecord);

      let fieldValue;
      if (relRecord['name'] !== undefined && relRecord['name'] !== null) {
        fieldValue = relRecord['name'];
      } else if (relKeys.length >= 2) {
        const secondKey = relKeys[1];
        fieldValue = relRecord[secondKey] !== undefined && relRecord[secondKey] !== null ? relRecord[secondKey] : "";
      } else {
        fieldValue = relRecord[field] !== undefined && relRecord[field] !== null ? relRecord[field] : "";
      }

      const escapedMatch = fullMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const replRegex = new RegExp(escapedMatch, 'gi');
      resultText = resultText.replace(replRegex, fieldValue);

      console.log(`[resolveDotPlaceholders] Successfully replaced ${fullMatch} with: ${fieldValue}`);
    } else {
      console.warn(`[resolveDotPlaceholders] Failed to resolve relation details for ${fullMatch}`);
    }
  }

  return resultText;
};
//new change

module.exports = {
  fetchUdfData,
  replacePlaceholders,
  executeMultipleQueries,
  replaceQueryPlaceholders,
  resolveDotPlaceholders,
};
