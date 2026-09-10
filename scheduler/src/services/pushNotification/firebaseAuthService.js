const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const logger = require("../../utils/logger");

let cachedToken = null;
let tokenExpiry = 0;
let serviceAccountConfig = null;

const getServiceAccount = () => {
  if (serviceAccountConfig) {
    return serviceAccountConfig;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccountConfig = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      );
      return serviceAccountConfig;
    } catch (e) {
      logger.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON from env", {
        error: e.message,
      });
    }
  }

  const configuredPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, "../../config/firebase-service-account.json");

  if (fs.existsSync(configuredPath)) {
    try {
      serviceAccountConfig = JSON.parse(
        fs.readFileSync(configuredPath, "utf8"),
      );
      return serviceAccountConfig;
    } catch (e) {
      logger.error("Failed to read Firebase service account JSON file", {
        path: configuredPath,
        error: e.message,
      });
    }
  }

  return null;
};

const base64url = (str) =>
  Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const getFirebaseAccessToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 300) {
    return cachedToken;
  }

  const sa = getServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error("Firebase Service Account credentials not available");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer
    .sign(sa.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signInput}.${signature}`;

  const res = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    },
  );

  cachedToken = res.data.access_token;
  tokenExpiry = now + (res.data.expires_in || 3600);
  return cachedToken;
};

const sendDirectFcmV1 = async ({
  deviceToken,
  title,
  body,
  screen,
  dataPayload,
}) => {
  try {
    const sa = getServiceAccount();
    if (!sa) {
      throw new Error("Firebase Service Account configuration is missing");
    }

    const accessToken = await getFirebaseAccessToken();
    const projectId = sa.project_id;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const message = {
      token: deviceToken,
      notification: {
        title: title || "",
        body: body || "",
      },
      data: {
        screen: String(screen || ""),
        data:
          typeof dataPayload === "string"
            ? dataPayload
            : JSON.stringify(dataPayload || {}),
      },
      android: {
        priority: "HIGH",
        notification: {
          channel_id: "high_importance_channel",
          sound: "custom_sound",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "custom_sound",
            contentAvailable: 1,
            mutableContent: 1,
          },
        },
      },
    };

    const res = await axios.post(
      url,
      { message },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    const messageName = res.data?.name || "";
    return {
      success: true,
      messageId: messageName,
      rawResponse: res.data,
    };
  } catch (err) {
    const status = err.response?.status;
    const errData = err.response?.data?.error || err.response?.data;
    const errMsg = errData?.message || err.message;

    logger.error("Direct FCM v1 dispatch failed", {
      status,
      error: errMsg,
      details: errData?.details,
    });

    return {
      success: false,
      messageId: "",
      error: errMsg,
    };
  }
};

module.exports = {
  getServiceAccount,
  getFirebaseAccessToken,
  sendDirectFcmV1,
};
