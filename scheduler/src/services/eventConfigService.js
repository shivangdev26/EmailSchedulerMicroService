const axios = require("axios");
const { buildApiHeaders } = require("./apiAuthService");

const fetchEventConfigs = async ({ token } = {}) => {
  try {
    const res = await axios({
      method: process.env.EMAILER_EVENT_CONFIG_METHOD || "GET",
      url: process.env.EMAILER_EVENT_CONFIG_URL,
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

module.exports = { fetchEventConfigs };
