const defaultSendEmailUrl = "https://microservices.dcctz.com/api/send_email";

const getSendEmailUrl = () =>
  process.env.SEND_EMAIL_API_URL || defaultSendEmailUrl;

const buildSendEmailHeaders = () => {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const authHeader = process.env.SEND_EMAIL_AUTH_HEADER || "Authorization";
  const authScheme =
    process.env.SEND_EMAIL_AUTH_SCHEME === undefined
      ? "Bearer"
      : process.env.SEND_EMAIL_AUTH_SCHEME;
  const token = (process.env.SEND_EMAIL_API_TOKEN || "").trim();
  const apiKey = (process.env.SEND_EMAIL_API_KEY || "").trim();
  const basicUsername = (process.env.SEND_EMAIL_BASIC_USERNAME || "").trim();
  const basicPassword = (process.env.SEND_EMAIL_BASIC_PASSWORD || "").trim();

  if (token) {
    const trimmedScheme = String(authScheme).trim();

    if (!trimmedScheme) {
      headers[authHeader] = token;
    } else if (
      token.toLowerCase().startsWith(`${trimmedScheme.toLowerCase()} `)
    ) {
      headers[authHeader] = token;
    } else {
      headers[authHeader] = `${trimmedScheme} ${token}`;
    }
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

const sendEmail = async (payload) => {
  const response = await fetch(getSendEmailUrl(), {
    method: "POST",
    headers: buildSendEmailHeaders(),
    body: JSON.stringify(payload),
  });

  let responsePayload = null;

  try {
    responsePayload = await response.json();
  } catch (error) {
    responsePayload = null;
  }

  if (!response.ok) {
    throw new Error(
      `Send email request failed with status ${response.status}: ${JSON.stringify(responsePayload)}`,
    );
  }

  return responsePayload;
};

module.exports = {
  buildSendEmailHeaders,
  getSendEmailUrl,
  sendEmail,
};
