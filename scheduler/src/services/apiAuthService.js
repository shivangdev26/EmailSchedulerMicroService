const axios = require("axios");

const buildApiHeaders = (options = {}) => {
  const {
    bearerToken,
    includeBearerPrefix = true,
    bearerTokenEnv = "EMAILER_API_BEARER_TOKEN",
    basicUsernameEnv = "EMAILER_API_BASIC_USERNAME",
    basicPasswordEnv = "EMAILER_API_BASIC_PASSWORD",
    apiKeyEnv = "EMAILER_API_KEY",
    bearerTokenFallbackEnvs = [],
    basicUsernameFallbackEnvs = [],
    basicPasswordFallbackEnvs = [],
    apiKeyFallbackEnvs = [],
    extraHeaders = {},
  } = options;

  const headers = {
    Accept: "application/json",
    ...extraHeaders,
  };

  const readEnv = (primaryEnv, fallbackEnvs = []) => {
    const envNames = [primaryEnv, ...fallbackEnvs].filter(Boolean);

    for (const envName of envNames) {
      if (process.env[envName]) {
        return process.env[envName];
      }
    }

    return "";
  };

  const resolvedBearerToken =
    typeof bearerToken === "string" && bearerToken.trim()
      ? bearerToken.trim()
      : readEnv(bearerTokenEnv, bearerTokenFallbackEnvs);
  const basicUsername = readEnv(basicUsernameEnv, basicUsernameFallbackEnvs);
  const basicPassword = readEnv(basicPasswordEnv, basicPasswordFallbackEnvs);
  const apiKey = readEnv(apiKeyEnv, apiKeyFallbackEnvs);

  if (resolvedBearerToken) {
    headers.Authorization = includeBearerPrefix
      ? `Bearer ${resolvedBearerToken}`
      : resolvedBearerToken;
  } else if (basicUsername && basicPassword) {
    const credentials = Buffer.from(
      `${basicUsername}:${basicPassword}`,
    ).toString("base64");

    headers.Authorization = `Basic ${credentials}`;
  }

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
};

const extractBearerToken = (authorizationHeader = "") => {
  if (typeof authorizationHeader !== "string") {
    return "";
  }

  const trimmed = authorizationHeader.trim();

  if (!trimmed) {
    return "";
  }

  if (/^Bearer\s+/i.test(trimmed)) {
    return trimmed.replace(/^Bearer\s+/i, "").trim();
  }

  return trimmed;
};

const decodeJwtPayload = (token = "") => {
  try {
    const [, payloadSegment] = String(token).split(".");

    if (!payloadSegment) {
      return null;
    }

    const normalized = payloadSegment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");

    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch (error) {
    return null;
  }
};

const getAuthToken = async (connection, dbName = "", forceRefresh = false) => {
  const cacheKey = dbName ? `api_auth_token_${dbName}` : "api_auth_token";

  try {
    // Check Redis for cached token
    if (!forceRefresh) {
      let token = await connection.get(cacheKey);

      if (token) {
        console.log(` Using cached auth token ${dbName ? `for ${dbName}` : ""}`);
        return token;
      }
    } else {
      console.log(` Force refreshing auth token ${dbName ? `for ${dbName}` : ""}`);
    }

    console.log(
      ` Fetching new auth token from Login API ${dbName ? `for ${dbName}` : ""}`,
    );

    // Try multiple login approaches
    let response;

    // First try with database name
    try {
      const loginPayload = {
        username: process.env.LOGIN_USERNAME,
        password: process.env.LOGIN_PASSWORD,
      };

      if (dbName) {
        loginPayload.dbName = dbName;
      }

      console.log(
        `Trying login with payload:`,
        JSON.stringify(loginPayload, null, 2),
      );
      response = await axios.post(process.env.LOGIN_API_URL, loginPayload);
    } catch (error) {
      console.log(`Login with dbName failed: ${error.message}`);

      // Try without database name
      try {
        const loginPayload = {
          username: process.env.LOGIN_USERNAME,
          password: process.env.LOGIN_PASSWORD,
        };

        console.log(
          `Trying login without dbName:`,
          JSON.stringify(loginPayload, null, 2),
        );
        response = await axios.post(process.env.LOGIN_API_URL, loginPayload);
      } catch (error2) {
        console.log(`Login without dbName also failed: ${error2.message}`);
        throw error2;
      }
    }

    token =
      response.data?.access_token ||
      response.data?.token ||
      response.data?.data?.token;

    if (token) {
      // Store in Redis for 24 hours (86400 seconds)
      await connection.set(cacheKey, token, "EX", 86400);
      return token;
    }

    throw new Error(
      `Failed to get token from Login API: ${JSON.stringify(response.data)}`,
    );
  } catch (error) {
    console.error(
      " Error in getAuthToken:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

module.exports = {
  buildApiHeaders,
  decodeJwtPayload,
  extractBearerToken,
  getAuthToken,
};
