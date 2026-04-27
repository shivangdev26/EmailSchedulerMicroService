// const { Worker } = require("bullmq");
// const { connection, emailQueueName } = require("../bullmq");
// const {
//   fetchSmtpConfig,
//   getSmtpConfigUrl,
// } = require("../services/emailerSmtpAccountService");
// const {
//   fetchSchedulerActions,
//   fetchEventConfigurations,
//   getSchedulerActionsUrl,
//   getEventConfigurationsUrl,
// } = require("../services/emailerActionService");
// const { buildEmailPayloads } = require("../services/emailPayloadBuilder");
// const {
//   sendEmail,
//   getSendEmailUrl,
// } = require("../services/emailSenderService");

// let emailWorker;

// const getObjectKeys = (value) => {
//   if (!value || typeof value !== "object" || Array.isArray(value)) {
//     return [];
//   }

//   return Object.keys(value);
// };

// const getPayloadSummary = (value) => {
//   if (!value || typeof value !== "object" || Array.isArray(value)) {
//     return value;
//   }

//   return {
//     succeeded: value.succeeded,
//     status: value.status,
//     message: value.message,
//     count: value.count,
//     errors: value.errors,
//     isDataTable: value.isDataTable,
//     tblDataLength: Array.isArray(value.tblData)
//       ? value.tblData.length
//       : undefined,
//     dataKeys: getObjectKeys(value.data),
//   };
// };

// const getRecipientDebug = (value) => {
//   if (value === null || value === undefined) {
//     return value;
//   }

//   if (Array.isArray(value)) {
//     return value.slice(0, 2);
//   }

//   if (typeof value === "object") {
//     return {
//       keys: getObjectKeys(value),
//       sample: Object.fromEntries(Object.entries(value).slice(0, 5)),
//     };
//   }

//   return value;
// };

// const resolveItems = (response) => {
//   if (Array.isArray(response?.items) && response.items.length > 0) {
//     return response.items;
//   }

//   if (
//     Array.isArray(response?.raw?.tblData) &&
//     response.raw.tblData.length > 0
//   ) {
//     return response.raw.tblData;
//   }

//   return [];
// };

// const initializeEmailSchedulerWorker = () => {
//   if (emailWorker) {
//     return emailWorker;
//   }

//   emailWorker = new Worker(
//     emailQueueName,
//     async (job) => {
//       const jobData = job.data;
//       console.log(`Processing BullMQ job: ${job.name}`);
//       console.log("Job payload:", job.data);

//       if (job.name === "send-daily-email") {
//         console.log(
//           "Fetching SMTP config, scheduler actions, and event configurations...",
//         );
//         console.log("SMTP config endpoint:", getSmtpConfigUrl());
//         console.log("Scheduler actions endpoint:", getSchedulerActionsUrl());
//         console.log(
//           "Event configurations endpoint:",
//           getEventConfigurationsUrl(),
//         );
//         console.log("Send email endpoint:", getSendEmailUrl());

//         const [
//           smtpConfig,
//           schedulerActionsResponse,
//           eventConfigurationsResponse,
//         ] = await Promise.all([
//           fetchSmtpConfig(),
//           // fetchSchedulerActions(),
//           // fetchEventConfigurations(),
//           fetchSchedulerActions(jobData.actionsUrl),
//           fetchEventConfigurations(jobData.eventConfigUrl),
//         ]);
//         const schedulerActionItems = resolveItems(schedulerActionsResponse);
//         const eventConfigurationItems = resolveItems(
//           eventConfigurationsResponse,
//         );
//         console.log("checkin g schduled timing");

//         schedulerActionItems.forEach((item, index) => {
//           console.log(` Action ${index}:`, {
//             id: item.id || item.Id,
//             event: item.event_name || item.Event_Name,

//             schedule_time: item.schedule_time,

//             fullKeys: Object.keys(item),
//           });
//         });

//         console.log(" sample obj data:");
//         console.dir(schedulerActionItems[0], { depth: null });
//         console.log("Scheduler action resolution:", {
//           responseItemsLength: Array.isArray(schedulerActionsResponse.items)
//             ? schedulerActionsResponse.items.length
//             : "not-array",
//           rawTblDataIsArray: Array.isArray(
//             schedulerActionsResponse.raw?.tblData,
//           ),
//           rawTblDataLength: Array.isArray(schedulerActionsResponse.raw?.tblData)
//             ? schedulerActionsResponse.raw.tblData.length
//             : "not-array",
//           resolvedLength: schedulerActionItems.length,
//         });

//         console.log("Fetched SMTP config keys:", getObjectKeys(smtpConfig));
//         // console.log("SMTP username:", smtpConfig?.user_name || smtpConfig?.username || smtpConfig?.email_address || smtpConfig?.email);
//         // console.log("SMTP password:", smtpConfig?.password);
//         const smtpUser = smtpConfig?.user_name;
//         const smtpPass = smtpConfig?.password;

//         console.log(" FINAL SMTP USED:");
//         console.log({
//           smtpUser,
//           smtpPass,
//           server: smtpConfig?.server_name,
//           port: smtpConfig?.port_number,
//           isSSL: smtpConfig?.is_ssl,
//         });
//         console.log(
//           "Scheduler actions raw summary:",
//           getPayloadSummary(schedulerActionsResponse.raw),
//         );
//         console.log(
//           "Event configurations raw summary:",
//           getPayloadSummary(eventConfigurationsResponse.raw),
//         );
//         console.log(
//           `Scheduler actions fetched: ${schedulerActionItems.length} via ${schedulerActionsResponse.method}`,
//         );
//         console.log(
//           `Event configurations fetched: ${eventConfigurationItems.length} via ${eventConfigurationsResponse.method}`,
//         );

//         const emailPayloads = buildEmailPayloads({
//           smtpConfig,
//           schedulerActions: schedulerActionItems,
//           eventConfigurations: eventConfigurationItems,
//           jobData: job.data,
//         });

//         const payloadSource =
//           schedulerActionItems.length > 0
//             ? "scheduler actions"
//             : "event configurations";

//         if (emailPayloads.length === 0) {
//           console.log(
//             `No email payloads were generated from ${payloadSource}.`,
//           );
//           console.log(
//             "Reason hint: records may be disabled or missing recipient/sender fields.",
//           );
//           console.log(
//             "Sample scheduler action keys:",
//             getObjectKeys(schedulerActionItems[0]),
//           );
//           console.log(
//             "Sample event configuration keys:",
//             getObjectKeys(eventConfigurationItems[0]),
//           );
//           console.log(
//             "Sample event configuration recipients:",
//             getRecipientDebug(eventConfigurationItems[0]?.recipients),
//           );
//           console.log(
//             "Sample event configuration is_enabled:",
//             eventConfigurationItems[0]?.is_enabled,
//           );
//           console.log(
//             "Sample event configuration cc:",
//             getRecipientDebug(eventConfigurationItems[0]?.cc),
//           );
//           console.log(
//             "Sample event configuration bcc:",
//             getRecipientDebug(eventConfigurationItems[0]?.bcc),
//           );
//           console.log(
//             "Sample event configuration email_group:",
//             getRecipientDebug(eventConfigurationItems[0]?.email_group),
//           );
//           return {
//             processedActions: schedulerActionItems.length,
//             processedEvents: eventConfigurationItems.length,
//             emailsSent: 0,
//           };
//         }

//         // for (let i = 0; i < emailPayloads.length; i++) {
//         //   const payload = emailPayloads[i];

//         //   console.log(" EMAIL PAYLOAD:", {
//         //     index: i,
//         //     from: payload.from,
//         //     to: payload.to,
//         //     cc: payload.cc,
//         //     bcc: payload.bcc,
//         //     subject: payload.subject,
//         //     smtp: payload.smtp,
//         //   });

//         //   try {
//         //     const res = await sendEmail(payload);

//         //     console.log("EMAIL SENT SUCCESS:", {
//         //       index: i,
//         //       response: res,
//         //     });
//         //   } catch (error) {
//         //     console.error(" EMAIL FAILED:", {
//         //       index: i,
//         //       error: error.message,
//         //       payload,
//         //     });
//         //   }
//         // }
//         const results = await Promise.allSettled(
//           emailPayloads.map((payload) => sendEmail(payload)),
//         );

//         const failed = results.filter((result) => result.status === "rejected");

//         if (failed.length > 0) {
//           failed.forEach((result, index) => {
//             console.error(
//               `Email send failed for payload index ${index}:`,
//               result.reason,
//             );
//           });

//           throw new Error(
//             `Failed to send ${failed.length} out of ${emailPayloads.length} emails`,
//           );
//         }

//         console.log(
//           `Successfully sent ${emailPayloads.length} email(s) using ${payloadSource}.`,
//         );
//         return {
//           processedActions: schedulerActionItems.length,
//           processedEvents: eventConfigurationItems.length,
//           emailsSent: emailPayloads.length,
//         };
//       }

//       return null;
//     },
//     { connection },
//   );

//   emailWorker.on("completed", (job) => {
//     console.log(`BullMQ job completed: ${job.id}`);
//   });

//   emailWorker.on("failed", (job, error) => {
//     console.error(`BullMQ job failed: ${job?.id}`, error);
//   });

//   return emailWorker;
// };

// const closeEmailSchedulerWorker = async () => {
//   if (!emailWorker) {
//     return;
//   }

//   await emailWorker.close();
//   emailWorker = null;
// };

// module.exports = {
//   initializeEmailSchedulerWorker,
//   closeEmailSchedulerWorker,
// };
const { Worker } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { sendEmail } = require("../services/emailSenderService");

const initializeEmailWorker = () => {
  return new Worker(
    emailQueueName,
    async (job) => {
      if (job.name !== "send-email") return;

      console.log(" Action ID:", job.data.actionId);

      console.log(" TO:", job.data.to);
      console.log(" CC:", job.data.cc);
      console.log(" BCC:", job.data.bcc);

      console.log(" SUBJECT:", job.data.subject);

      console.log(" BODY:", job.data.html);

      console.log(" SMTP:", {
        host: job.data.smtp?.host,
        port: job.data.smtp?.port,
        user: job.data.smtp?.user,
      });

      try {
        const res = await sendEmail(job.data);

        console.log(" EMAIL SENT SUCCESS:", res);
      } catch (error) {
        console.error(" EMAIL FAILED:", error.message);
      }

      console.log(" EMAIL JOB END\n");
    },
    { connection },
  );
};

module.exports = { initializeEmailWorker };
