const { buildApiHeaders } = require("./apiAuthService");

const defaultSmtpConfigUrl =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailerSMTPAccount/2";

const getSmtpConfigUrl = () =>
  process.env.EMAILER_SMTP_ACCOUNT_URL || defaultSmtpConfigUrl;

const buildHeaders = ({ token } = {}) =>
  buildApiHeaders({
    bearerToken: token,
    bearerTokenEnv: "EMAILER_SMTP_ACCOUNT_BEARER_TOKEN",
    basicUsernameEnv: "EMAILER_SMTP_ACCOUNT_BASIC_USERNAME",
    basicPasswordEnv: "EMAILER_SMTP_ACCOUNT_BASIC_PASSWORD",
    apiKeyEnv: "EMAILER_SMTP_ACCOUNT_API_KEY",
  });

const unwrapSmtpConfig = (payload) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const candidateSources = [
    payload.tblData,
    payload.data,
    payload.result,
    payload.value,
  ];

  for (const source of candidateSources) {
    if (Array.isArray(source) && source.length > 0) {
      return source[0];
    }

    if (source && typeof source === "object" && !Array.isArray(source)) {
      if (Array.isArray(source.tblData) && source.tblData.length > 0) {
        return source.tblData[0];
      }

      return source;
    }
  }

  return payload;
};

// const fetchSmtpConfig = async () => {
//   const url = getSmtpConfigUrl();

//   console.log(" Ccalling smtp api:", url);

//   const response = await fetch(url, {
//     method: "GET",
//     headers: buildHeaders(),
//   });

//   console.log(" SMTP API status:", response.status);

//   const payload = await response.json();

//   console.log(" Raw smtp:");
//   console.dir(payload, { depth: null });

//   if (payload && typeof payload === "object" && Number(payload.status) >= 400) {
//     throw new Error(
//       `SMTP config request failed with API status ${payload.status}: ${payload.message || "Unknown API error"}`,
//     );
//   }

//   const unwrapped = unwrapSmtpConfig(payload);

//   console.log("Unwrappted smp config:");
//   console.dir(unwrapped, { depth: null });

//   return unwrapped;
// };

const fetchSmtpConfig = async ({ token } = {}) => {
  const url = getSmtpConfigUrl();

  console.log("Calling smtp api:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders({ token }),
  });

  console.log("SMTP API status:", response.status);

  // Guard: non-2xx responses (like 522) return HTML, not JSON
  if (!response.ok) {
    console.warn(
      `SMTP config request failed with status ${response.status}, skipping poll cycle.`,
    );
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    console.warn("SMTP API returned non-JSON:", text.slice(0, 200));
    return null;
  }

  const payload = await response.json();

  if (payload && typeof payload === "object" && Number(payload.status) >= 400) {
    throw new Error(
      `SMTP config request failed with API status ${payload.status}: ${payload.message || "Unknown API error"}`,
    );
  }

  const unwrapped = unwrapSmtpConfig(payload);
  return unwrapped;
};

module.exports = {
  buildHeaders,
  fetchSmtpConfig,
  getSmtpConfigUrl,
  unwrapSmtpConfig,
};
