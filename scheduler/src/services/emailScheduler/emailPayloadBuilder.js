const truthyValues = new Set([
  "true",
  "1",
  "yes",
  "y",
  "active",
  "enabled",
  "enable",
  "on",
]);
const falsyValues = new Set([
  "false",
  "0",
  "no",
  "n",
  "inactive",
  "disabled",
  "disable",
  "off",
]);

const isLikelyEmail = (value) =>
  typeof value === "string" && value.includes("@");

const shouldIgnoreEnabledFlag = () =>
  ["true", "1", "yes", "y"].includes(
    String(process.env.IGNORE_EVENT_ENABLE_FLAG || "")
      .trim()
      .toLowerCase(),
  );

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toHtmlBody = (value) =>
  String(value)
    .split(/\r?\n/)
    .map((line) => escapeHtml(line))
    .join("<br>");

const normalizeToArray = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeToArray(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    const directEmail = firstDefined(
      value.email,
      value.Email,
      value.emailAddress,
      value.EmailAddress,
      value.address,
      value.Address,
      value.email_address,
      value.Email_Address,
      value.user_name,
      value.User_Name,
      value.name,
      value.Name,
    );

    if (typeof directEmail === "string" && directEmail.includes("@")) {
      return [directEmail.trim()];
    }

    const nestedValues = [
      value.recipients,
      value.Recipients,
      value.members,
      value.Members,
      value.users,
      value.Users,
      value.emails,
      value.Emails,
      value.items,
      value.Items,
      value.value,
      value.Value,
      value.data,
      value.Data,
      value.email_group,
      value.Email_Group,
      ...Object.values(value),
    ];

    return nestedValues
      .flatMap((entry) => normalizeToArray(entry))
      .filter(Boolean);
  }

  return [];
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const isEnabled = (record) => {
  if (shouldIgnoreEnabledFlag()) {
    return true;
  }

  const candidate = firstDefined(
    record?.isActive,
    record?.IsActive,
    record?.active,
    record?.Active,
    record?.is_enabled,
    record?.Is_Enabled,
    record?.enabled,
    record?.Enabled,
    record?.status,
    record?.Status,
  );

  if (candidate === undefined) {
    return true;
  }

  if (typeof candidate === "boolean") {
    return candidate;
  }

  if (typeof candidate === "number") {
    return candidate === 1;
  }

  const normalized = String(candidate).trim().toLowerCase();

  if (truthyValues.has(normalized)) {
    return true;
  }

  if (falsyValues.has(normalized)) {
    return false;
  }

  return Boolean(normalized);
};

const buildEventMap = (eventConfigurations) => {
  const eventMap = new Map();

  for (const eventConfig of eventConfigurations) {
    const keys = [
      eventConfig?.id,
      eventConfig?.Id,
      eventConfig?.eventId,
      eventConfig?.EventId,
      eventConfig?.configurationId,
      eventConfig?.ConfigurationId,
      eventConfig?.code,
      eventConfig?.Code,
      eventConfig?.name,
      eventConfig?.Name,
    ].filter(Boolean);

    for (const key of keys) {
      eventMap.set(String(key), eventConfig);
    }
  }

  return eventMap;
};

const resolveEventConfiguration = (action, eventMap) => {
  const lookupKeys = [
    action?.eventConfigurationId,
    action?.EventConfigurationId,
    action?.emailerEventConfigurationId,
    action?.EmailerEventConfigurationId,
    action?.eventId,
    action?.EventId,
    action?.eventCode,
    action?.EventCode,
    action?.eventName,
    action?.EventName,
  ].filter(Boolean);

  for (const key of lookupKeys) {
    const match = eventMap.get(String(key));
    if (match) {
      return match;
    }
  }

  return null;
};

const buildEmailPayloads = ({
  smtpConfig,
  schedulerActions,
  eventConfigurations,
  jobData = {},
}) => {
  const eventMap = buildEventMap(eventConfigurations);
  const smtpServer = firstDefined(
    smtpConfig?.server,
    smtpConfig?.Server,
    smtpConfig?.host,
    smtpConfig?.Host,
    smtpConfig?.server_name,
    smtpConfig?.Server_Name,
    smtpConfig?.smtpServer,
    smtpConfig?.SmtpServer,
  );
  const smtpEmail = firstDefined(
    smtpConfig?.email,
    smtpConfig?.Email,
    smtpConfig?.email_address,
    smtpConfig?.Email_Address,
    smtpConfig?.username,
    smtpConfig?.Username,
    smtpConfig?.user_name,
    smtpConfig?.User_Name,
    smtpConfig?.smtpEmail,
    smtpConfig?.SmtpEmail,
  );
  const smtpPassword = firstDefined(
    smtpConfig?.password,
    smtpConfig?.Password,
    smtpConfig?.smtpPassword,
    smtpConfig?.SmtpPassword,
  );
  const defaultTo = normalizeToArray(process.env.DEFAULT_EMAIL_TO);
  const defaultCc = normalizeToArray(process.env.DEFAULT_EMAIL_CC);
  const defaultBcc = normalizeToArray(process.env.DEFAULT_EMAIL_BCC);
  const defaultFrom = process.env.DEFAULT_EMAIL_FROM;
  const defaultSubject = process.env.DEFAULT_EMAIL_SUBJECT || "Scheduled Email";
  const defaultBody =
    process.env.DEFAULT_EMAIL_BODY || "Triggered by scheduler service.";
  const sourceActions =
    schedulerActions.length > 0 ? schedulerActions : eventConfigurations;

  return sourceActions
    .filter(isEnabled)
    .map((action) => {
      const eventConfiguration = resolveEventConfiguration(action, eventMap);

      const to = normalizeToArray(
        firstDefined(
          action.to,
          action.To,
          action.emailTo,
          action.EmailTo,
          action.recipients,
          action.Recipients,
          eventConfiguration?.to,
          eventConfiguration?.To,
          eventConfiguration?.emailTo,
          eventConfiguration?.EmailTo,
          eventConfiguration?.recipients,
          eventConfiguration?.Recipients,
          defaultTo,
        ),
      );

      if (to.length === 0) {
        return null;
      }

      const subject = firstDefined(
        action.display_name,
        action.Display_Name,
        action.title,
        action.Title,
        action.subject,
        action.Subject,
        action.emailSubject,
        action.EmailSubject,
        action.event_name,
        action.Event_Name,
        action.triggered_on,
        action.Triggered_On,
        eventConfiguration?.display_name,
        eventConfiguration?.Display_Name,
        eventConfiguration?.title,
        eventConfiguration?.Title,
        eventConfiguration?.subject,
        eventConfiguration?.Subject,
        eventConfiguration?.emailSubject,
        eventConfiguration?.EmailSubject,
        eventConfiguration?.event_name,
        eventConfiguration?.Event_Name,
        defaultSubject,
      );

      const body = firstDefined(
        action.body,
        action.Body,
        action.message,
        action.Message,
        action.emailBody,
        action.EmailBody,
        action.description,
        action.Description,
        eventConfiguration?.body,
        eventConfiguration?.Body,
        eventConfiguration?.message,
        eventConfiguration?.Message,
        eventConfiguration?.emailBody,
        eventConfiguration?.EmailBody,
        eventConfiguration?.description,
        eventConfiguration?.Description,
        defaultBody,
      );
      const text = String(body);
      const html = toHtmlBody(body);

      const from = firstDefined(
        action.from,
        action.From,
        action.emailFrom,
        action.EmailFrom,
        isLikelyEmail(action.email_account) ? action.email_account : undefined,
        action.Email_Account,
        eventConfiguration?.from,
        eventConfiguration?.From,
        eventConfiguration?.emailFrom,
        eventConfiguration?.EmailFrom,
        isLikelyEmail(eventConfiguration?.email_account)
          ? eventConfiguration.email_account
          : undefined,
        eventConfiguration?.Email_Account,
        smtpEmail,
        defaultFrom,
      );

      if (!from) {
        return null;
      }

      return {
        smtp: {
          server: smtpServer,
          email: smtpConfig.user_name,
          password: smtpPassword,
        },
        from,
        to,
        cc: normalizeToArray(
          firstDefined(
            action.cc,
            action.Cc,
            action.emailCc,
            action.EmailCc,
            action.CC,
            eventConfiguration?.cc,
            eventConfiguration?.Cc,
            eventConfiguration?.emailCc,
            eventConfiguration?.EmailCc,
            eventConfiguration?.CC,
            defaultCc,
          ),
        ),
        bcc: normalizeToArray(
          firstDefined(
            action.bcc,
            action.Bcc,
            action.emailBcc,
            action.EmailBcc,
            action.BCC,
            eventConfiguration?.bcc,
            eventConfiguration?.Bcc,
            eventConfiguration?.emailBcc,
            eventConfiguration?.EmailBcc,
            eventConfiguration?.BCC,
            defaultBcc,
          ),
        ),
        subject,
        text,
        html,
        body,
        meta: {
          source: firstDefined(
            action.source,
            action.Source,
            jobData.source,
            "bullmq",
          ),
          actionId: firstDefined(action.id, action.Id),
          eventConfigurationId: firstDefined(
            eventConfiguration?.id,
            eventConfiguration?.Id,
          ),
        },
      };
    })
    .filter(Boolean);
};

module.exports = {
  buildEmailPayloads,
};
