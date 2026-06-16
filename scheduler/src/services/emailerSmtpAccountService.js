const { buildApiHeaders, getAuthToken } = require("./apiAuthService");
const { replaceApiUrlPrefix } = require("./urlService");

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

const fetchSmtpConfig = async ({
  token,
  connection,
  dbName,
  blApiUrl,
} = {}) => {
  const baseUrl = getSmtpConfigUrl();
  const url = replaceApiUrlPrefix(baseUrl, blApiUrl);

  const tryFetch = async (authToken, retries = 3) => {
    let lastError = null;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: buildHeaders({ token: authToken }),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          return { success: false, response };
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          return { success: false, response };
        }

        const payload = await response.json();

        if (
          payload &&
          typeof payload === "object" &&
          Number(payload.status) >= 400
        ) {
          if (payload.status === 401 || payload.status === 419) {
            return { success: false, needsRefresh: true, error: payload };
          }
          throw new Error(
            `SMTP config request failed with API status ${payload.status}: ${payload.message || "Unknown API error"}`,
          );
        }

        const unwrapped = unwrapSmtpConfig(payload);
        return { success: true, data: unwrapped };
      } catch (error) {
        lastError = error;
        console.warn(
          `SMTP fetch attempt ${i + 1}/${retries} failed:`,
          error.message,
        );

        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("SMTP fetch failed after retries");
  };

  let result = await tryFetch(token);

  if (!result.success && result.needsRefresh && connection && dbName) {
    const newToken = await getAuthToken(connection, dbName, true);
    result = await tryFetch(newToken);
  }

  if (result.success) {
    return result.data;
  }

  return null;
};

module.exports = {
  buildHeaders,
  fetchSmtpConfig,
  getSmtpConfigUrl,
  unwrapSmtpConfig,
};
