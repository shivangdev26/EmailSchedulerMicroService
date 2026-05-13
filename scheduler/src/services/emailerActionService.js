const { buildApiHeaders } = require("./apiAuthService");

const defaultSchedulerActionsUrl =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/Common/GetEmailerActions?pageSize=1000";
const defaultEventConfigurationsUrl =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerEventConfiguration/GetAll";
const defaultSchedulerActionsMethod = "GET";
const defaultEventConfigurationsMethod = "GET";

const getSchedulerActionsUrl = () =>
  process.env.EMAILER_ACTIONS_URL || defaultSchedulerActionsUrl;

const getEventConfigurationsUrl = () =>
  process.env.EMAILER_EVENT_CONFIG_URL || defaultEventConfigurationsUrl;

const getSchedulerActionsMethod = () =>
  (
    process.env.EMAILER_ACTIONS_METHOD || defaultSchedulerActionsMethod
  ).toUpperCase();

const getEventConfigurationsMethod = () =>
  (
    process.env.EMAILER_EVENT_CONFIG_METHOD || defaultEventConfigurationsMethod
  ).toUpperCase();

const parseRequestBody = (rawBody) => {
  if (!rawBody || !rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error(
      `Invalid JSON body configured for action API request: ${error.message}`,
    );
  }
};

const getSchedulerActionsBody = () =>
  parseRequestBody(process.env.EMAILER_ACTIONS_BODY || "");

const getEventConfigurationsBody = () =>
  parseRequestBody(process.env.EMAILER_EVENT_CONFIG_BODY || "");

const buildActionApiHeaders = (customToken) => {
  const headers = buildApiHeaders({
    bearerTokenEnv: "EMAILER_ACTIONS_BEARER_TOKEN",
    basicUsernameEnv: "EMAILER_ACTIONS_BASIC_USERNAME",
    basicPasswordEnv: "EMAILER_ACTIONS_BASIC_PASSWORD",
    apiKeyEnv: "EMAILER_ACTIONS_API_KEY",
    bearerTokenFallbackEnvs: [
      "EMAILER_API_BEARER_TOKEN",
      "EMAILER_SMTP_ACCOUNT_BEARER_TOKEN",
    ],
    basicUsernameFallbackEnvs: [
      "EMAILER_API_BASIC_USERNAME",
      "EMAILER_SMTP_ACCOUNT_BASIC_USERNAME",
    ],
    basicPasswordFallbackEnvs: [
      "EMAILER_API_BASIC_PASSWORD",
      "EMAILER_SMTP_ACCOUNT_BASIC_PASSWORD",
    ],
    apiKeyFallbackEnvs: ["EMAILER_API_KEY", "EMAILER_SMTP_ACCOUNT_API_KEY"],
  });

  if (customToken) {
    headers.Authorization = customToken.startsWith("Bearer ")
      ? customToken
      : `Bearer ${customToken}`;
  }

  return headers;
};

const executeRequest = async (url, method, body, customToken) => {
  const headers = buildActionApiHeaders(customToken);
  const requestOptions = {
    method,
    headers,
  };

  if (method === "POST") {
    requestOptions.headers = {
      ...headers,
      "Content-Type": "application/json",
    };
    requestOptions.body = JSON.stringify(body || {});
  }

  return fetch(url, requestOptions);
};

const fetchJson = async (url, method, body, customToken) => {
  const normalizedMethod = (method || "GET").toUpperCase();
  let response = await executeRequest(url, normalizedMethod, body, customToken);
  let finalMethod = normalizedMethod;

  if (
    (response.status === 400 || response.status === 405) &&
    normalizedMethod === "GET"
  ) {
    console.log(
      `Received ${response.status} for ${url} with GET. Retrying with POST.`,
    );
    response = await executeRequest(url, "POST", body, customToken);
    finalMethod = "POST";
  }

  if (!response.ok) {
    throw new Error(
      `Request failed for ${url} with method ${finalMethod} and status ${response.status}`,
    );
  }

  const payload = await response.json();

  if (payload && typeof payload === "object" && Number(payload.status) >= 400) {
    throw new Error(
      `Request failed for ${url} with method ${finalMethod} and API status ${payload.status}: ${payload.message || "Unknown API error"}`,
    );
  }

  return {
    payload,
    method: finalMethod,
  };
};

const tryParseJsonString = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  const looksJson =
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"));

  if (!looksJson) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
};

const normalizePayload = (payload) => {
  const parsedPayload = tryParseJsonString(payload);

  if (
    Array.isArray(parsedPayload) ||
    !parsedPayload ||
    typeof parsedPayload !== "object"
  ) {
    return parsedPayload;
  }

  const normalized = {};

  for (const [key, value] of Object.entries(parsedPayload)) {
    normalized[key] = tryParseJsonString(value);
  }

  return normalized;
};

const knownCollectionKeys = [
  "tblData",
  "data",
  "items",
  "result",
  "results",
  "value",
  "rows",
  "records",
  "list",
];

const extractCollection = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const key of knownCollectionKeys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object") {
      const nestedItems = extractCollection(value);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }

    if (value && typeof value === "object") {
      const nestedItems = extractCollection(value);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }
  }

  return [];
};

// const fetchSchedulerActions = async (customUrl) => {
//   const url = customUrl || getSchedulerActionsUrl();

//   const { payload, method } = await fetchJson(
//     url,
//     getSchedulerActionsMethod(),
//     getSchedulerActionsBody(),
//   );

//   const normalizedPayload = normalizePayload(payload);
//   const extractedItems = extractCollection(normalizedPayload);

//   return {
//     method,
//     raw: normalizedPayload,
//     items: extractedItems,
//   };
// };

const fetchSchedulerActions = async (customUrl, customToken) => {
  const url = customUrl || getSchedulerActionsUrl();

  try {
    const { payload, method } = await fetchJson(
      url,
      getSchedulerActionsMethod(),
      getSchedulerActionsBody(),
      customToken,
    );

    const normalizedPayload = normalizePayload(payload);
    const extractedItems = extractCollection(normalizedPayload);

    return {
      method,
      raw: normalizedPayload,
      items: extractedItems,
    };
  } catch (err) {
    console.warn(
      "fetchSchedulerActions failed, skipping poll cycle:",
      err.message,
    );
    return { method: null, raw: { tblData: [] }, items: [] };
  }
};
// const fetchEventConfigurations = async () => {
//   const { payload, method } = await fetchJson(
//     getEventConfigurationsUrl(),
//     getEventConfigurationsMethod(),
//     getEventConfigurationsBody(),
//   );
//   const normalizedPayload = normalizePayload(payload);
//   const extractedItems = extractCollection(normalizedPayload);
//   const fallbackItems = Array.isArray(normalizedPayload?.tblData)
//     ? normalizedPayload.tblData
//     : [];

//   return {
//     method,
//     raw: normalizedPayload,
//     items: extractedItems.length > 0 ? extractedItems : fallbackItems,
//   };
// };

const fetchEventConfigurations = async (customUrl, customToken) => {
  const url = customUrl || getEventConfigurationsUrl();

  const { payload, method } = await fetchJson(
    url,
    getEventConfigurationsMethod(),
    getEventConfigurationsBody(),
    customToken,
  );

  const normalizedPayload = normalizePayload(payload);
  const extractedItems = extractCollection(normalizedPayload);

  return {
    method,
    raw: normalizedPayload,
    items: extractedItems,
  };
};

module.exports = {
  fetchEventConfigurations,
  fetchSchedulerActions,
  getEventConfigurationsUrl,
  getEventConfigurationsMethod,
  getSchedulerActionsUrl,
  getSchedulerActionsMethod,
  getEventConfigurationsBody,
  getSchedulerActionsBody,
};
