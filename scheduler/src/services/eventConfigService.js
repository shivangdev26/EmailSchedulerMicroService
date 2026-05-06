const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");

const fetchEventConfigs = async ({ token } = {}) => {
  try {
    const url = process.env.EMAILER_EVENT_CONFIG_URL;
    if (!url) {
      throw new Error(
        "EMAILER_EVENT_CONFIG_URL environment variable is not defined",
      );
    }
    const res = await axios({
      method: process.env.EMAILER_EVENT_CONFIG_METHOD || "GET",
      url: url,
      headers: {
        ...buildApiHeaders({
          bearerToken: token,
          bearerTokenEnv: "EMAILER_EVENT_CONFIG_BEARER_TOKEN",
          bearerTokenFallbackEnvs: ["EMAILER_SMTP_ACCOUNT_BEARER_TOKEN"],
        }),
        "Content-Type": "application/json",
      },
      data: process.env.EMAILER_EVENT_CONFIG_BODY
        ? JSON.parse(process.env.EMAILER_EVENT_CONFIG_BODY)
        : {},
    });

    console.log(" Event config API status:", res.status);

    return res.data?.data || [];
  } catch (err) {
    console.error(
      " Failed to fetch event configs:",
      err.response?.status,
      err.message,
    );
    return [];
  }
};

const fetchEventConfigById = async ({ id, token } = {}) => {
  try {
    const baseUrl = process.env.EMAILER_EVENT_CONFIG_BY_ID_URL;
    if (!baseUrl) {
      throw new Error(
        "EMAILER_EVENT_CONFIG_BY_ID_URL environment variable is not defined",
      );
    }
    const res = await axios({
      method: "GET",
      url: `${baseUrl}${id}`,
      headers: {
        ...buildApiHeaders({
          bearerToken: token,
        }),
        "Content-Type": "application/json",
      },
    });

    console.log(` Event config API (ID: ${id}) status:`, res.status);

    return res.data?.data?.[0] || res.data?.data || null;
  } catch (err) {
    console.error(
      ` Failed to fetch event config (ID: ${id}):`,
      err.response?.status,
      err.message,
    );
    return null;
  }
};

module.exports = { fetchEventConfigs, fetchEventConfigById };
