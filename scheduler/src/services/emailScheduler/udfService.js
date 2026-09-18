const axios = require("axios");
const { buildApiHeaders } = require("../common/apiAuthService");
const { replaceApiUrlPrefix } = require("../common/urlService");
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
    if (value === null) value = "";

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
  const effectiveBlApiUrl = blApiUrl || action?.bl_api_url;
  const url = replaceApiUrlPrefix(baseUrl, effectiveBlApiUrl);

  const queries = [];
  const subtitleQueries = [];

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

  const queryResults = {};
  const rawQueryResults = {};
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
        } catch (e) {}
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
    subtitleResults[`subtitle_query_${index}`] = text
      ? text.replace(/\{(?:date|today)\}/gi, dayjs().format("DD-MM-YYYY"))
      : text;
  }

  return {
    ...queryResults,
    ...subtitleResults,
    _rawResults: rawQueryResults,
  };
};

const formatCellValue = (val, keyName = "") => {
  if (val === null || val === undefined || val === "") {
    return `<span style="color: #94a3b8;">-</span>`;
  }

  const strVal = String(val).trim();

  if (
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?)?Z?$/.test(strVal) &&
    dayjs(strVal).isValid()
  ) {
    return `<span style="color: #334155; font-size: 11px; white-space: nowrap;">${dayjs(strVal).format("DD MMM YYYY")}</span>`;
  }

  if (/overstay|delay|late|alert|fail|hazard|crit/i.test(strVal)) {
    return `<span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 10px; background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; white-space: nowrap;">● ${strVal}</span>`;
  }

  if (/^(active|approved|success|completed|paid|20ft)$/i.test(strVal)) {
    return `<span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10px; background-color: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; white-space: nowrap;">${strVal}</span>`;
  }
  if (/^(40ft|in transit|in progress)$/i.test(strVal)) {
    return `<span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10px; background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; white-space: nowrap;">${strVal}</span>`;
  }

  // Accent formatting for reference / ID columns
  if (
    /(^no\.?$|_no$|code$|^id$)/i.test(keyName) &&
    /^[A-Za-z0-9_-]+$/.test(strVal)
  ) {
    return `<span style="color: #2563eb; font-weight: 600; font-size: 11px;">${strVal}</span>`;
  }

  return strVal;
};

const replaceQueryPlaceholders = (text, data) => {
  if (!text || !data) return text || "";
  let result = text.replace(
    /\{(query_result_\d+|subtitle_query_\d+|customer_summary|grouped_data|clean_data)\}/g,
    (match, key) => {
      const value = data[key];
      if (value === undefined || value === null) return match;
      if (Array.isArray(value)) {
        if (value.length === 0) return "";
        const keys = Object.keys(value[0]);

        let tableHtml = `<div style="overflow-x: auto; margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); background-color: #ffffff;">`;

        tableHtml += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">`;
        tableHtml += `<tr>`;
        tableHtml += `<td align="left" style="padding: 10px 14px; vertical-align: middle;">`;
        tableHtml += `<span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #0f172a;">Details</span>`;
        tableHtml += `</td>`;
        tableHtml += `<td align="right" style="padding: 10px 14px; vertical-align: middle; text-align: right;">`;
        tableHtml += `<span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #64748b; font-weight: 500;">Showing ${value.length} ${value.length === 1 ? "record" : "records"}</span>`;
        tableHtml += `</td>`;
        tableHtml += `</tr>`;
        tableHtml += `</table>`;

        tableHtml += `<table style="width: 100%; border-collapse: collapse; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; font-size: 11px; text-align: left; background-color: #ffffff;">`;

        tableHtml += `<thead><tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">`;
        keys.forEach((k, idx) => {
          const isLast = idx === keys.length - 1;
          const label = k
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          tableHtml += `<th style="padding: 8px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.4px; text-transform: uppercase; color: #475569; text-align: left; ${!isLast ? "border-right: 1px solid #e2e8f0;" : ""} white-space: nowrap;">${label}</th>`;
        });
        tableHtml += `</tr></thead>`;

        tableHtml += `<tbody>`;
        value.forEach((row, index) => {
          const rowBg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
          tableHtml += `<tr style="background-color: ${rowBg};">`;
          keys.forEach((k, colIdx) => {
            const rawVal = row[k];
            const formattedVal = formatCellValue(rawVal, k);
            const isLast = colIdx === keys.length - 1;
            tableHtml += `<td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; ${!isLast ? "border-right: 1px solid #f1f5f9;" : ""} color: #334155; font-size: 11px; vertical-align: middle; text-align: left; white-space: nowrap;">${formattedVal}</td>`;
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table></div>`;
        return tableHtml;
      }
      return String(value);
    },
  );
  return result.replace(/\{(?:date|today)\}/gi, dayjs().format("DD-MM-YYYY"));
};

//new change

const resolveDotPlaceholders = async ({
  text,
  attachmentRecord,
  token,
  blApiUrl,
}) => {
  if (!text || !attachmentRecord) return text || "";

  const dotRegex = /\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = dotRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const relation = match[1];
    const field = match[2];
    if (!matches.some((m) => m.fullMatch === fullMatch)) {
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

    const isZero = (val) =>
      val !== undefined && val !== null && (val === 0 || val === "0");

    if (
      isZero(attachmentRecord[field]) ||
      isZero(attachmentRecord[`${field}_id`]) ||
      isZero(attachmentRecord[`${relation}_id`]) ||
      isZero(attachmentRecord[relation])
    ) {
      console.log(
        `[resolveDotPlaceholders] FK value for ${relation}.${field} is 0 (unset). Replacing ${fullMatch} with empty string.`,
      );
      const escapedMatch = fullMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const replRegex = new RegExp(escapedMatch, "gi");
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
      const strippedField =
        typeof field === "string" ? field.replace(/_no|_id/g, "") : "";
      const mappedField =
        typeof field === "string" ? field.replace(/_no/g, "_id") : "";
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
      console.warn(
        `[resolveDotPlaceholders] No ID found in attachment record for relation: ${relation}`,
      );
      continue;
    }

    const candidates = [
      relation,
      `m_${relation}_master`,
      relation.endsWith("s") ? relation : `${relation}s`,
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
          } catch {}
        }

        const rows =
          responseData?.tblData ||
          responseData?.data ||
          responseData?.result ||
          [];
        if (rows.length > 0) {
          const colName =
            rows[0].COLUMN_NAME ||
            rows[0].column_name ||
            rows[0].columN_NAME ||
            rows[0].ColumN_Name;
          if (colName) return colName;
        }
      } catch (err) {
        console.error(
          `[resolveDotPlaceholders] Error fetching PK for ${tableName}:`,
          err.message,
        );
      }
      return "id";
    };

    const runQuery = async (tableName) => {
      const pkColumn = await getPrimaryKeyColumn(tableName);
      const query = `select * from ${tableName} where ${pkColumn} = ${relationId}`;
      console.log(
        `[resolveDotPlaceholders] Trying table '${tableName}' on PK '${pkColumn}': ${query}`,
      );
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
        } catch {}
      }

      if (responseData && responseData.succeeded === false) {
        return null;
      }
      return (
        responseData?.tblData ||
        responseData?.data ||
        responseData?.result ||
        []
      );
    };

    for (const tableName of candidates) {
      try {
        const parsed = await runQuery(tableName);
        if (parsed && parsed.length > 0) {
          tblData = parsed;
          succeeded = true;
          break;
        }
      } catch (err) {}
    }

    if (!succeeded) {
      try {
        console.log(
          `[resolveDotPlaceholders] No candidate matched. Searching database schema for relation: ${relation}`,
        );
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
          } catch {}
        }

        const schemaRows =
          responseData?.tblData ||
          responseData?.data ||
          responseData?.result ||
          [];
        if (schemaRows.length > 0) {
          const matchedTable =
            schemaRows[0].TABLE_NAME ||
            schemaRows[0].table_name ||
            schemaRows[0].tablE_NAME;
          if (matchedTable) {
            console.log(
              `[resolveDotPlaceholders] Found fuzzy matched table: ${matchedTable}`,
            );
            const parsed = await runQuery(matchedTable);
            if (parsed && parsed.length > 0) {
              tblData = parsed;
              succeeded = true;
            }
          }
        }
      } catch (err) {
        console.error(
          `[resolveDotPlaceholders] Schema search error for ${relation}:`,
          err.message,
        );
      }
    }

    if (succeeded && tblData.length > 0) {
      const relRecord = tblData[0];
      const relKeys = Object.keys(relRecord);

      let fieldValue;
      const matchedFieldKey = relKeys.find(
        (k) => k.toLowerCase() === field.toLowerCase(),
      );

      if (
        matchedFieldKey &&
        relRecord[matchedFieldKey] !== undefined &&
        relRecord[matchedFieldKey] !== null
      ) {
        fieldValue = relRecord[matchedFieldKey];
      } else if (relRecord["name"] !== undefined && relRecord["name"] !== null) {
        fieldValue = relRecord["name"];
      } else if (relKeys.length >= 2) {
        const secondKey = relKeys[1];
        fieldValue =
          relRecord[secondKey] !== undefined && relRecord[secondKey] !== null
            ? relRecord[secondKey]
            : "";
      } else {
        fieldValue = "";
      }

      const escapedMatch = fullMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const replRegex = new RegExp(escapedMatch, "gi");
      resultText = resultText.replace(replRegex, fieldValue);

      console.log(
        `[resolveDotPlaceholders] Successfully replaced ${fullMatch} with: ${fieldValue}`,
      );
    } else {
      console.warn(
        `[resolveDotPlaceholders] Failed to resolve relation details for ${fullMatch}`,
      );
    }
  }

  return resultText;
};

module.exports = {
  fetchUdfData,
  replacePlaceholders,
  executeMultipleQueries,
  replaceQueryPlaceholders,
  resolveDotPlaceholders,
};
