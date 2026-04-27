// const { Worker } = require("bullmq");
// const { connection, emailQueueName } = require("../bullmq");
// const { sendEmail } = require("../services/emailSenderService");

// const dayjs = require("dayjs");
// const utc = require("dayjs/plugin/utc");

// dayjs.extend(utc);

// const normalizeRecipients = (value) => {
//   if (!value) return [];

//   if (Array.isArray(value)) {
//     return value.map((v) => String(v).trim()).filter(Boolean);
//   }

//   if (typeof value === "string") {
//     return value
//       .split(/[;,]/)
//       .map((v) => v.trim())
//       .filter(Boolean);
//   }

//   return [];
// };

// // const buildEmailPayload = (payload) => {
// //   const { action, smtp } = payload;

// //   if (!smtp) throw new Error("Missing SMTP");

// //   return {
// //     smtp: {
// //       server: smtp.server || smtp.server_name,
// //       email: smtp.email || smtp.user_name,
// //       password: smtp.password,
// //       port: smtp.port || smtp.port_number,
// //     },
// //     from: smtp.email_address || smtp.user_name,
// //     to: normalizeRecipients(action.to),
// //     cc: normalizeRecipients(action.cc),
// //     bcc: normalizeRecipients(action.bcc),
// //     subject: action.subject || "No Subject",
// //     text: action.display_name || "No text",
// //     html: `<h3>${action.display_name || "No content"}</h3>`,
// //   };
// // };

// const buildEmailPayload = (payload) => {
//   const { action, event, smtp } = payload;

//   if (!smtp) throw new Error("Missing SMTP");

//   // EVENT FLOW
//   if (event) {
//     return {
//       smtp: {
//         server: smtp.server || smtp.server_name,
//         email: smtp.email || smtp.user_name,
//         password: smtp.password,
//         port: smtp.port || smtp.port_number,
//       },
//       from: smtp.email_address || smtp.user_name,
//       to: normalizeRecipients(event.to),
//       cc: normalizeRecipients(event.cc),
//       bcc: normalizeRecipients(event.bcc),
//       subject: event.subject || "Event",
//       text: event.message || "Event triggered",
//       html: `<h3>${event.message || "Event triggered"}</h3>`,
//     };
//   }

//   if (action) {
//     return {
//       smtp: {
//         server: smtp.server || smtp.server_name,
//         email: smtp.email || smtp.user_name,
//         password: smtp.password,
//         port: smtp.port || smtp.port_number,
//       },
//       from: smtp.email_address || smtp.user_name,
//       to: normalizeRecipients(action.to),
//       cc: normalizeRecipients(action.cc),
//       bcc: normalizeRecipients(action.bcc),
//       subject: action.subject || "No Subject",
//       text: action.display_name || "No text",
//       html: `<h3>${action.display_name || "No content"}</h3>`,
//     };
//   }

//   throw new Error("Invalid payload: missing action/event");
// };
// const startEmailWorker = () => {
//   console.log(" Worker started");

//   new Worker(
//     emailQueueName,
//     async (job) => {
//       console.log(" JOB:", job.id);

//       const payload = job.data.payload || job.data;
//       const adv = job.data.advanced;

//       const now = dayjs.utc();

//       /* =========================
//          ADVANCED LOGIC (FIX)
//       ========================= */
//       if (adv) {
//         const currentMinutes = now.hour() * 60 + now.minute();
//         const start = adv.startH * 60 + adv.startM;
//         const end = adv.endH * 60 + adv.endM;

//         const inWindow =
//           start <= end
//             ? currentMinutes >= start && currentMinutes <= end
//             : currentMinutes >= start || currentMinutes <= end;

//         const diffDays = now
//           .startOf("day")
//           .diff(dayjs(adv.startDate).startOf("day"), "day");

//         if (diffDays < 0 || diffDays % adv.everyDays !== 0 || !inWindow) {
//           console.log(" SKIP ADV:", payload.action?.id);
//           return;
//         }
//       }

//       try {
//         const email = buildEmailPayload(payload);

//         if (!email.to || !email.to.length) {
//           throw new Error("No recipients");
//         }
//         console.log(" Sending to:", email.to);

//         await sendEmail(email);

//         console.log(" Email sent");
//       } catch (err) {
//         console.error(" Email failed:", err.message);
//         throw err;
//       }
//     },
//     { connection },
//   );
// };

// module.exports = { startEmailWorker };

const { Worker } = require("bullmq");
const { connection, emailQueueName } = require("../bullmq");
const { sendEmail } = require("../services/emailSenderService");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

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

// const buildEmailPayload = (payload) => {
//   const { action, smtp } = payload;

//   if (!smtp) throw new Error("Missing SMTP");

//   return {
//     smtp: {
//       server: smtp.server || smtp.server_name,
//       email: smtp.email || smtp.user_name,
//       password: smtp.password,
//       port: smtp.port || smtp.port_number,
//     },
//     from: smtp.email_address || smtp.user_name,
//     to: normalizeRecipients(action.to),
//     cc: normalizeRecipients(action.cc),
//     bcc: normalizeRecipients(action.bcc),
//     subject: action.subject || "No Subject",
//     text: action.display_name || "No text",
//     html: `<h3>${action.display_name || "No content"}</h3>`,
//   };
// };

const buildEmailPayload = (payload) => {
  const { action, event, smtp } = payload;

  if (!smtp) throw new Error("Missing SMTP");

  //  Event flow triger the api for my reference
  if (event) {
    return {
      smtp: {
        server: smtp.server || smtp.server_name,
        email: smtp.email || smtp.user_name,
        password: smtp.password,
        port: smtp.port || smtp.port_number,
      },
      from: smtp.email_address || smtp.user_name,
      to: normalizeRecipients(event.to),
      cc: normalizeRecipients(event.cc),
      bcc: normalizeRecipients(event.bcc),
      subject: event.subject || "Event",
      text: event.message || "Event triggered",
      html: `<h3>${event.message || "Event triggered"}</h3>`,
    };
  }

  // action flow
  if (action) {
    return {
      smtp: {
        server: smtp.server || smtp.server_name,
        email: smtp.email || smtp.user_name,
        password: smtp.password,
        port: smtp.port || smtp.port_number,
      },
      from: smtp.email_address || smtp.user_name,
      to: normalizeRecipients(action.to),
      cc: normalizeRecipients(action.cc),
      bcc: normalizeRecipients(action.bcc),
      subject: action.subject || "No Subject",
      text: action.display_name || "No text",
      html: `<h3>${action.display_name || "No content"}</h3>`,
    };
  }

  throw new Error("Invalid payload: missing action/event");
};
const startEmailWorker = () => {
  console.log(" Worker started");

  new Worker(
    emailQueueName,
    async (job) => {
      console.log(" JOB:", job.id);

      const payload = job.data.payload || job.data;
      const adv = job.data.advanced;

      const now = dayjs.utc();

      if (adv) {
        const currentMinutes = now.hour() * 60 + now.minute();
        const start = adv.startH * 60 + adv.startM;
        const end = adv.endH * 60 + adv.endM;

        const inWindow =
          start <= end
            ? currentMinutes >= start && currentMinutes <= end
            : currentMinutes >= start || currentMinutes <= end;

        const diffDays = now
          .startOf("day")
          .diff(dayjs(adv.startDate).startOf("day"), "day");

        if (diffDays < 0 || diffDays % adv.everyDays !== 0 || !inWindow) {
          console.log("SKIP ADV:", payload.action?.id);
          return;
        }
      }

      try {
        const email = buildEmailPayload(payload);

        if (!email.to || !email.to.length) {
          throw new Error("No recipients");
        }
        console.log(" Sending to:", email.to);

        await sendEmail(email);

        console.log(" Email sent");
      } catch (err) {
        console.error(" Email failed:", err.message);
        throw err;
      }
    },
    { connection },
  );
};

module.exports = { startEmailWorker };
