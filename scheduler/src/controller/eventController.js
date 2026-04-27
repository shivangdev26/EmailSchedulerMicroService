const { sendEventEmail } = require("../services/eventEmailProducer");
const { fetchSmtpConfig } = require("../services/emailerSmtpAccountService");
const { fetchEventConfigs } = require("../services/eventConfigService.js");
const {
  decodeJwtPayload,
  extractBearerToken,
} = require("../services/apiAuthService");

const readDbName = (record) =>
  record?.dbname ||
  record?.db_name ||
  record?.dbName ||
  record?.DBName ||
  record?.DB_NAME ||
  record?.database_name ||
  record?.Database_Name ||
  "";

const triggerEvent = async (req, res) => {
  try {
    const { event_name, triggered_on } = req.body;
    const token = extractBearerToken(req.headers.authorization);
    const tokenPayload = decodeJwtPayload(token);
    const requestDbName = tokenPayload?.dbname || tokenPayload?.db_name || "";

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const configs = await fetchEventConfigs({ token });

    const scopedConfigs = requestDbName
      ? configs.filter((config) => {
          const configDbName = readDbName(config);

          if (!configDbName) {
            return true;
          }

          return (
            String(configDbName).trim().toLowerCase() ===
            String(requestDbName).trim().toLowerCase()
          );
        })
      : configs;

    const matched = scopedConfigs.filter(
      (e) => e.event_name === event_name && e.triggered_on === triggered_on,
      e.is_enabled === "Y",
    );

    if (!matched.length) {
      return res.status(404).json({
        success: false,
        message: "No matching event config found",
      });
    }

    const smtp = await fetchSmtpConfig({ token });

    if (!smtp) {
      return res.status(503).json({
        success: false,
        message: "SMTP config unavailable",
      });
    }
    const normalizeRecipients = (value) => {
      if (!value) return [];

      if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter(Boolean);
      }

      if (typeof value === "string") {
        return value
          .split(/[;,]/)
          .map((v) => v.trim())
          .filter(Boolean);
      }

      return [];
    };
    for (const event of matched) {
      await sendEventEmail({
        smtp,
        event: {
          to: normalizeRecipients(event.recipients),
          cc: normalizeRecipients(event.cc),
          bcc: normalizeRecipients(event.bcc),
          subject: event.event_name,
          message: `Triggered on ${event.triggered_on}`,
        },
      });
    }

    return res.json({
      success: true,
      message: "Event processed & emails queued ",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error triggering event" });
  }
};

module.exports = { triggerEvent };
