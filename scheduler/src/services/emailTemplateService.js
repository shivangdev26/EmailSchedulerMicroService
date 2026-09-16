const dayjs = require("dayjs");

const calculateKpiMetrics = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      card1: { value: 0, label: "Total Records", sub: "In selected period" },
      card2: { value: 0, label: "Total Items", sub: "Active items" },
      card3: { value: 0, label: "Total Fleet", sub: "Operational" },
      card4: { value: 0, label: "Alerts & Status", sub: "Monitored" },
    };
  }

  const sample = rows[0] || {};
  const keys = Object.keys(sample);

  // Find relevant columns dynamically
  const shipmentKey = keys.find((k) => /shipment/i.test(k));
  const containerKey = keys.find((k) => /container/i.test(k));
  const sizeKey = keys.find((k) => /(container.*size|^size$)/i.test(k));
  const truckKey = keys.find((k) => /truck/i.test(k));
  const statusKey = keys.find((k) => /status|overstay/i.test(k));

  // 1. Total Shipments / Records
  let totalShipments = rows.length;
  let uniqueShipmentsCount = 0;
  if (shipmentKey) {
    const uniqueShipments = new Set(
      rows.map((r) => r[shipmentKey]).filter(Boolean),
    );
    uniqueShipmentsCount = uniqueShipments.size;
    totalShipments = uniqueShipmentsCount || rows.length;
  }
  const card1Sub = shipmentKey
    ? `${uniqueShipmentsCount} unique in ${rows.length} records`
    : `Total ${rows.length} entries processed`;

  let totalContainers = rows.length;
  let count20 = 0;
  let count40 = 0;
  if (containerKey) {
    const uniqueContainers = new Set(
      rows.map((r) => r[containerKey]).filter(Boolean),
    );
    totalContainers = uniqueContainers.size || rows.length;
  }
  if (sizeKey) {
    rows.forEach((r) => {
      const s = String(r[sizeKey] || "").toUpperCase();
      if (s.includes("20")) count20++;
      if (s.includes("40")) count40++;
    });
  }
  let containerSub = "";
  if (count20 > 0 || count40 > 0) {
    const pct20 = Math.round((count20 / rows.length) * 100);
    const pct40 = Math.round((count40 / rows.length) * 100);
    containerSub = `20FT: ${count20} (${pct20}%) | 40FT: ${count40} (${pct40}%)`;
  } else {
    containerSub = `${totalContainers} units tracked`;
  }

  let totalTrucks = rows.length;
  if (truckKey) {
    const uniqueTrucks = new Set(rows.map((r) => r[truckKey]).filter(Boolean));
    totalTrucks = uniqueTrucks.size || rows.length;
  }
  const card3Sub = truckKey
    ? `${totalTrucks} distinct vehicles`
    : `${totalTrucks} active entities`;

  let overstayHoursTotal = 0;
  let overstayCount = 0;
  let maxOverstayHrs = 0;
  rows.forEach((r) => {
    const statusVal = String(r[statusKey] || "");
    const match = statusVal.match(/(\d+)\s*(?:hour|hrs)/i);
    if (match) {
      const hrs = parseInt(match[1], 10);
      overstayHoursTotal += hrs;
      overstayCount++;
      if (hrs > maxOverstayHrs) maxOverstayHrs = hrs;
    }
  });

  let card4Value = "0 hrs";
  let card4Label = "Avg. Offloading Time";
  let card4Sub = "Across all records";

  if (overstayCount > 0) {
    const avgHrs = Math.round(overstayHoursTotal / overstayCount);
    card4Value = `${avgHrs.toLocaleString()} hrs`;
    card4Label = "Avg. Overstay Duration";
    card4Sub = `Max: ${maxOverstayHrs.toLocaleString()} hrs (${overstayCount} alerts)`;
  } else {
    card4Value = `${rows.length}`;
    card4Label = "Status Monitored";
    card4Sub = "100% normal";
  }

  return {
    card1: {
      value: totalShipments,
      label: shipmentKey ? "Total Shipments" : "Total Records",
      sub: card1Sub,
    },
    card2: {
      value: totalContainers,
      label: containerKey ? "Total Containers" : "Total Items",
      sub: containerSub,
    },
    card3: {
      value: totalTrucks,
      label: truckKey ? "Total Trucks" : "Active Entities",
      sub: card3Sub,
    },
    card4: {
      value: card4Value,
      label: card4Label,
      sub: card4Sub,
    },
  };
};

const formatDatabaseDisplayName = (dbName) => {
  if (!dbName || typeof dbName !== "string") {
    return "DCC LOGISTICS SUITE";
  }

  let cleaned = dbName.trim();
  // Strip common technical prefixes like DCCBusinessSuite_, DCCLogisticsSuite_, DCC_
  cleaned = cleaned.replace(/^DCC(?:Business|Logistics)?Suite[_\s]*/i, "");
  cleaned = cleaned.replace(/^DCC[_\s]+/i, "");
  // Replace underscores and multiple dashes with spaces
  cleaned = cleaned.replace(/[_-]+/g, " ").trim().toUpperCase();

  return cleaned ? `DCC ${cleaned}` : "DCC LOGISTICS SUITE";
};

const buildCorporateEmailHtml = ({
  title = "Shipment Status Report",
  subtitle = "Container movements at a glance",
  tableHtml = "",
  rows = [],
  currentDateStr = dayjs().format("DD MMMM YYYY"),
  dbName = "",
}) => {
  const kpis = calculateKpiMetrics(rows);
  const brandName = formatDatabaseDisplayName(dbName);

  const displayTitle = title
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayTitle}</title>
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">

  <!-- Outer Email Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <!-- Main Content Container (Max 860px) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 860px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">

          <!-- 1. Top Header: Brand Text & Date -->
          <tr>
            <td style="padding: 24px 32px 18px 32px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <div style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1;">
                      ${brandName}
                    </div>
                  </td>
                  <td align="right" style="vertical-align: middle; text-align: right;">
                    <div style="font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                      ${displayTitle}
                    </div>
                    <div style="font-size: 11px; color: #64748b; font-weight: 500; margin-top: 2px;">
                      ${currentDateStr}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 2. Hero Banner: Brand Theme -->
          <tr>
            <td style="padding: 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #091e3a 0%, #0d284f 50%, #1e293b 100%); background-color: #0d284f; color: #ffffff;">
                <tr>
                  <td style="padding: 32px 32px 28px 32px;">
                    <!-- Banner Title -->
                    <div style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; line-height: 1.2;">
                      ${displayTitle}
                    </div>
                    <div style="font-size: 13px; color: #cbd5e1; font-weight: 500; margin-top: 6px;">
                      ${brandName} &nbsp;|&nbsp; Enterprise Logistics Operations
                    </div>
                    <!-- Accent Line -->
                    <div style="width: 44px; height: 3px; background-color: #3b82f6; border-radius: 2px; margin: 16px 0 20px 0;"></div>
                    
                    <!-- Banner Bottom Sub-bar -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" style="font-size: 11px; color: #94a3b8; font-weight: 500; letter-spacing: 0.2px;">
                          Automate operations. Gain predictive insights. Scale with efficiency.
                        </td>
                        <td align="right" style="font-size: 10px; color: #cbd5e1; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                          ${brandName}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 3. Greeting & Intro Card -->
          <tr>
            <td style="padding: 28px 32px 14px 32px; background-color: #ffffff;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
                Hello Valued Customer,
              </div>
              <div style="font-size: 13px; color: #475569; line-height: 1.6;">
                Please find below the latest <strong>${displayTitle}</strong> generated from <strong>${brandName}</strong>. This report provides an overview of operations, tracking details and status alerts.
              </div>
            </td>
          </tr>

          <!-- 4. Dynamic KPI Summary Stat Cards (Row of 4 Cards) -->
          <tr>
            <td style="padding: 10px 32px 20px 32px; background-color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Card 1: Total Shipments -->
                  <td width="23.5%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 12px; vertical-align: top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <div style="width: 28px; height: 28px; background-color: #dbeafe; border-radius: 6px; text-align: center; line-height: 28px; font-size: 14px; display: inline-block;">
                            📦
                          </div>
                        </td>
                        <td align="right" style="font-size: 20px; font-weight: 800; color: #0f172a;">
                          ${kpis.card1.value}
                        </td>
                      </tr>
                    </table>
                    <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 8px;">
                      ${kpis.card1.label}
                    </div>
                    <div style="font-size: 10px; font-weight: 600; color: #16a34a; margin-top: 4px;">
                      ${kpis.card1.sub}
                    </div>
                  </td>

                  <td width="2%"></td>

                  <!-- Card 2: Total Containers -->
                  <td width="23.5%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 12px; vertical-align: top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <div style="width: 28px; height: 28px; background-color: #ede9fe; border-radius: 6px; text-align: center; line-height: 28px; font-size: 14px; display: inline-block;">
                            💼
                          </div>
                        </td>
                        <td align="right" style="font-size: 20px; font-weight: 800; color: #0f172a;">
                          ${kpis.card2.value}
                        </td>
                      </tr>
                    </table>
                    <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 8px;">
                      ${kpis.card2.label}
                    </div>
                    <div style="font-size: 10px; font-weight: 600; color: #6d28d9; margin-top: 4px;">
                      ${kpis.card2.sub}
                    </div>
                  </td>

                  <td width="2%"></td>

                  <!-- Card 3: Total Trucks -->
                  <td width="23.5%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 12px; vertical-align: top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <div style="width: 28px; height: 28px; background-color: #dcfce7; border-radius: 6px; text-align: center; line-height: 28px; font-size: 14px; display: inline-block;">
                            🚚
                          </div>
                        </td>
                        <td align="right" style="font-size: 20px; font-weight: 800; color: #0f172a;">
                          ${kpis.card3.value}
                        </td>
                      </tr>
                    </table>
                    <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 8px;">
                      ${kpis.card3.label}
                    </div>
                    <div style="font-size: 10px; font-weight: 600; color: #059669; margin-top: 4px;">
                      ${kpis.card3.sub}
                    </div>
                  </td>

                  <td width="2%"></td>

                  <!-- Card 4: Avg. Offloading Time -->
                  <td width="23.5%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 12px; vertical-align: top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <div style="width: 28px; height: 28px; background-color: #ffedd5; border-radius: 6px; text-align: center; line-height: 28px; font-size: 14px; display: inline-block;">
                            ⏱️
                          </div>
                        </td>
                        <td align="right" style="font-size: 16px; font-weight: 800; color: #0f172a;">
                          ${kpis.card4.value}
                        </td>
                      </tr>
                    </table>
                    <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 8px;">
                      ${kpis.card4.label}
                    </div>
                    <div style="font-size: 10px; font-weight: 600; color: #ea580c; margin-top: 4px;">
                      ${kpis.card4.sub}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 5. Data Table Section -->
          <tr>
            <td style="padding: 6px 32px 20px 32px; background-color: #ffffff;">
              ${tableHtml}
            </td>
          </tr>



          <!-- 7. Partnership & Contact Card -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Partnership Note (Left) -->
                  <td width="55%" style="vertical-align: top; padding-right: 24px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: top; padding-right: 12px;">
                          <div style="width: 36px; height: 36px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 50%; text-align: center; line-height: 36px; font-size: 18px;">
                            🤝
                          </div>
                        </td>
                        <td style="vertical-align: top;">
                          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                            Thank you for your continued partnership.
                          </div>
                          <div style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 12px;">
                            We remain committed to delivering state-of-the-art enterprise logistics solutions.
                          </div>
                          <div style="font-size: 11px; color: #475569; line-height: 1.4;">
                            Best regards,<br>
                            <strong>${brandName} Support</strong><br>
                            <strong>DCC SAP Business One Operations</strong>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Contact Details (Right) -->
                  <td width="45%" style="vertical-align: top; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 6px; font-size: 11px; color: #334155;">
                          📞 &nbsp; <strong>+255 759 112 161</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 6px; font-size: 11px; color: #334155;">
                          ✉️ &nbsp; <a href="mailto:support@doubleclick.co.tz" style="color: #2563eb; text-decoration: none;">support@doubleclick.co.tz</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 6px; font-size: 11px; color: #334155;">
                          🌐 &nbsp; <a href="https://www.doubleclick.co.tz" style="color: #2563eb; text-decoration: none;">www.doubleclick.co.tz</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 11px; color: #64748b;">
                          📍 &nbsp; Dar es Salaam, Tanzania
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 8. Footer: Brand Text & Tagline -->
          <tr>
            <td style="padding: 20px 32px; background-color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <span style="font-size: 14px; font-weight: 900; color: #0f172a; letter-spacing: -0.3px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      ${brandName}
                    </span>
                  </td>
                  <td align="right" style="vertical-align: middle; font-size: 10px; color: #94a3b8; font-weight: 700; letter-spacing: 1px;">
                    ENTERPRISE LOGISTICS SUITE &nbsp;|&nbsp; AUTOMATE &nbsp;|&nbsp; SCALE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();
};

module.exports = {
  calculateKpiMetrics,
  formatDatabaseDisplayName,
  buildCorporateEmailHtml,
};
