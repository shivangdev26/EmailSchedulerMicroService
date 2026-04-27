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

module.exports = {
  buildApiHeaders,
  decodeJwtPayload,
  extractBearerToken,
};
