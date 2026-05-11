const axios = require("axios");
const { getAuthToken, buildApiHeaders } = require("./apiAuthService");
const { connection } = require("../bullmq");

const DB_LIST_URL =
  "https://logsuitedomainverify.dcctz.com/api/get-databases?access_token=46|dBslX9hktLYr3XfeD0uaoh3hd5ejfz6sPbQ6Midra9f22742";
const STATUS_CHECK_URL =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2/api/Common/GetEmailQueueStatustoCron?pageSize=100";
const UPDATE_PARTIAL_URL =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailQueueStatus/UpdatePartial";
const CONFIRMATION_ADD_URL =
  "https://logsuiteblapi_dev.dcctz.com/DCCLogisticsSuite/BLv2_demo/api/EmailQueueConfirmation/Add";

const processEmailQueueStatus = async () => {
  try {
    console.log("Starting email queue status check cron job");

    let databases = [];

    try {
      console.log("Fetching all databases...");
      const dbListResponse = await axios.get(DB_LIST_URL);
      console.log(
        "Database list API response:",
        JSON.stringify(dbListResponse.data, null, 2),
      );

      const dbData = dbListResponse.data?.data || dbListResponse.data;
      if (Array.isArray(dbData)) {
        databases = dbData;
      }
    } catch (dbError) {
      console.warn(
        "Failed to fetch databases from API, using test database:",
        dbError.message,
      );
    }

    if (!Array.isArray(databases) || databases.length === 0) {
      console.log("No databases from API, using hardcoded test database");
      databases = [{ DBName: "DCCBusinessSuite_mowara_test" }];
    }

    console.log(`Found ${databases.length} databases to process.`);

    for (const db of databases) {
      const dbName = db.DBName || db.db_name || db.database_name || db.name;
      if (!dbName) {
        console.warn(
          "Database object missing name property:",
          JSON.stringify(db),
        );
        continue;
      }

      console.log(`--- Processing database: ${dbName} ---`);

      try {
        const token = await getAuthToken(connection, dbName);
        if (!token) {
          console.error(`Failed to get auth token for database: ${dbName}`);
          continue;
        }

        let statusResponse;
        try {
          statusResponse = await axios.get(STATUS_CHECK_URL, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (getError) {
          if (
            getError.response?.status === 405 ||
            getError.response?.status === 400
          ) {
            console.log(
              `GET failed with ${getError.response.status}, retrying with POST`,
            );
            statusResponse = await axios.post(
              STATUS_CHECK_URL,
              { pageSize: 100 },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
            );
          } else {
            throw getError;
          }
        }

        console.log(
          "Status check API response:",
          JSON.stringify(statusResponse.data, null, 2),
        );
        const triggers =
          statusResponse.data?.tblData ||
          statusResponse.data?.data ||
          statusResponse.data ||
          [];

        if (!Array.isArray(triggers) || triggers.length === 0) {
          console.log(`No data for database: ${dbName}`);
          continue;
        }

        console.log(
          `Found ${triggers.length} items to process for database: ${dbName}`,
        );

        for (const trigger of triggers) {
          const id = trigger.id || trigger.event_config_id;
          const event_queue_id =
            trigger.email_queue_id || trigger.event_queue_id;
          const log_inst = trigger.log_inst;

          if (!id) {
            console.warn(
              `Item missing id for DB: ${dbName}`,
              JSON.stringify(trigger),
            );
            continue;
          }

          try {
            console.log(
              `[STATUS UPDATE] Sending PATCH to: ${UPDATE_PARTIAL_URL}/${id}`,
            );
            const patchPayload = [
              {
                op: "replace",
                path: "/cron_run",
                value: "Y",
              },
              {
                op: "replace",
                path: "/log_inst",
                value: log_inst,
              },
            ];
            console.log(
              `[STATUS UPDATE] Payload:`,
              JSON.stringify(patchPayload, null, 2),
            );

            const patchRes = await axios.patch(
              `${UPDATE_PARTIAL_URL}/${id}`,
              patchPayload,
              {
                headers: {
                  ...buildApiHeaders({ bearerToken: token }),
                  "Content-Type": "application/json-patch+json",
                },
              },
            );

            console.log(`[STATUS UPDATE] Response Status: ${patchRes.status}`);
            console.log(
              `[STATUS UPDATE] Response Data:`,
              JSON.stringify(patchRes.data, null, 2),
            );
            console.log(
              `Updated cron_run to Y for id: ${id} in DB: ${dbName}. Status: ${patchRes.status}`,
            );
          } catch (patchError) {
            console.error(
              `Failed to update status for id: ${id} in DB: ${dbName}`,
              patchError.response?.data || patchError.message,
            );
          }

          try {
            console.log(
              `[CONFIRMATION] Sending request to: ${CONFIRMATION_ADD_URL}`,
            );
            const confirmPayload = {
              id: 0,
              email_queue_id: event_queue_id,
              confirm: "Y",
              location: "Email Scheduler Service",
              pc_name: "SERVER-01",
              ip_address: "127.0.0.1",
              log_inst: log_inst,
            };
            console.log(
              `[CONFIRMATION] Payload:`,
              JSON.stringify(confirmPayload, null, 2),
            );

            const postRes = await axios.post(
              CONFIRMATION_ADD_URL,
              confirmPayload,
              {
                headers: {
                  ...buildApiHeaders({ bearerToken: token }),
                  "Content-Type": "application/json",
                },
              },
            );

            console.log(`[CONFIRMATION] Response Status: ${postRes.status}`);
            console.log(
              `[CONFIRMATION] Response Data:`,
              JSON.stringify(postRes.data, null, 2),
            );
            console.log(
              `Added confirmation for event_queue_id: ${event_queue_id} in DB: ${dbName}. Status: ${postRes.status}`,
            );
          } catch (postError) {
            console.error(
              `Failed to add confirmation for event_queue_id: ${event_queue_id} in DB: ${dbName}`,
              postError.response?.data || postError.message,
            );
          }
        }
      } catch (dbError) {
        console.error(
          `Error processing database ${dbName}:`,
          dbError.response?.data || dbError.message,
        );
      }
    }
    console.log("Email queue status check cron job completed");
  } catch (error) {
    console.error(
      "Error in processEmailQueueStatus cron job:",
      error.response?.data || error.message,
    );
  }
};

module.exports = { processEmailQueueStatus };
