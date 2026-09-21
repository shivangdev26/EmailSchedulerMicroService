const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { Readable } = require("stream");

const generateExcelBuffer = async (
  queryResults,
  filename = "report",
  worksheetType = "S",
) => {
  const workbook = new ExcelJS.Workbook();

  if (
    queryResults &&
    typeof queryResults === "object" &&
    !Array.isArray(queryResults)
  ) {
    const rawResults = queryResults;
    const queryKeys = Object.keys(rawResults).filter(
      (k) =>
        rawResults[k] &&
        Array.isArray(rawResults[k]) &&
        rawResults[k].length > 0,
    );

    if (worksheetType === "M") {
      for (let i = 0; i < queryKeys.length; i++) {
        const queryKey = queryKeys[i];
        const data = rawResults[queryKey];
        const sheetName = `Sheet ${i + 1}`;

        const worksheet = workbook.addWorksheet(sheetName);

        const headers = Object.keys(data[0]);
        worksheet.columns = headers.map((header) => ({
          header: header.toUpperCase(),
          key: header,
          width: 20,
        }));
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF3B82F6" },
          };
          cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        data.forEach((row, idx) => {
          const excelRow = worksheet.addRow(row);
          const fillColor = idx % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
          excelRow.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fillColor },
            };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        });
      }
    } else {
      const worksheet = workbook.addWorksheet("Data");
      let currentRow = 1;

      for (let i = 0; i < queryKeys.length; i++) {
        const queryKey = queryKeys[i];
        const data = rawResults[queryKey];

        if (queryKeys.length > 1) {
          worksheet.getCell(`A${currentRow}`).value =
            `Query ${i + 1} (${queryKey})`;
          worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
          currentRow += 2;
        }

        const headers = Object.keys(data[0]);
        const headerRow = worksheet.getRow(currentRow);
        headers.forEach((header, index) => {
          const cell = headerRow.getCell(index + 1);
          cell.value = header.toUpperCase();
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF3B82F6" },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
        currentRow++;

        data.forEach((row, idx) => {
          const dataRow = worksheet.getRow(currentRow);
          headers.forEach((header, index) => {
            dataRow.getCell(index + 1).value = row[header];
          });
          const fillColor = idx % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
          dataRow.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fillColor },
            };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
          currentRow++;
        });

        if (i < queryKeys.length - 1) {
          currentRow += 2;
        }
      }
    }
  } else {
    const worksheet = workbook.addWorksheet("Data");

    if (queryResults && queryResults.length > 0) {
      const headers = Object.keys(queryResults[0]);
      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: 20,
      }));

      queryResults.forEach((row) => {
        worksheet.addRow(row);
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    filename: `${filename}.xlsx`,
    mimetype:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
};

const generatePdfBuffer = (queryResults, filename = "report") => {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({
      margin: 15,
      bufferPages: true,
      layout: "landscape",
      size: "TABLOID",
    });

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const buffer = Buffer.concat(buffers);
      resolve({
        buffer,
        filename: `${filename}.pdf`,
        mimetype: "application/pdf",
      });
    });
    doc.on("error", reject);

    doc.fontSize(14).text("Report", { align: "center" });
    doc.moveDown(0.5);

    if (queryResults && queryResults.length > 0) {
      const headers = Object.keys(queryResults[0]);
      const margin = 15;
      const startX = margin;
      let tableY = doc.y;
      const cellPadding = 2;
      const headerFontSize = 7;
      const dataFontSize = 5;

      const colWidths = headers.map(() => 0);
      const minColWidth = 35;

      headers.forEach((header, colIndex) => {
        const headerWidth = doc.widthOfString(header, {
          fontSize: headerFontSize,
        });
        colWidths[colIndex] = Math.max(
          minColWidth,
          headerWidth + cellPadding * 2,
        );
        queryResults.forEach((row) => {
          const value =
            row[header] !== null && row[header] !== undefined
              ? String(row[header])
              : "";
          const valueWidth = doc.widthOfString(value, {
            fontSize: dataFontSize,
          });
          colWidths[colIndex] = Math.max(
            colWidths[colIndex],
            Math.min(valueWidth + cellPadding * 2, 120),
          );
        });
      });

      const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
      const maxTableWidth = doc.page.width - margin * 2;
      if (totalWidth > maxTableWidth) {
        const scaleFactor = maxTableWidth / totalWidth;
        for (let i = 0; i < colWidths.length; i++) {
          colWidths[i] = Math.max(
            minColWidth,
            Math.floor(colWidths[i] * scaleFactor),
          );
        }
      }

      const getTextHeight = (text, width, fontSize) => {
        if (!text) return fontSize + 3;
        const lines = doc.heightOfString(text, {
          width: width - cellPadding * 2,
          fontSize,
        });
        return Math.max(fontSize + 6, lines + 6);
      };

      const drawHeaderRow = (y) => {
        doc.fontSize(headerFontSize).font("Helvetica-Bold");
        let currentX = startX;
        const headerRowHeight = 14;

        headers.forEach((header, colIndex) => {
          const width = colWidths[colIndex];
          doc
            .rect(currentX, y, width, headerRowHeight)
            .fillAndStroke("#3b82f6", "black");
          doc.fillColor("white");
          doc.text(
            header.toUpperCase(),
            currentX + cellPadding,
            y + cellPadding,
            {
              width: width - cellPadding * 2,
              align: "left",
              baseline: "top",
            },
          );
          doc.fillColor("black");
          currentX += width;
        });
        return headerRowHeight;
      };

      const drawDataRow = (row, y, rowIdx = 0) => {
        doc.fontSize(dataFontSize).font("Helvetica");

        let maxRowHeight = 15;
        headers.forEach((header, colIndex) => {
          const width = colWidths[colIndex];
          const value =
            row[header] !== null && row[header] !== undefined
              ? String(row[header])
              : "";
          const textHeight = getTextHeight(value, width, dataFontSize);
          maxRowHeight = Math.max(maxRowHeight, textHeight);
        });

        const rowBg = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";

        let currentX = startX;
        headers.forEach((header, colIndex) => {
          const width = colWidths[colIndex];
          const value =
            row[header] !== null && row[header] !== undefined
              ? String(row[header])
              : "";

          doc
            .rect(currentX, y, width, maxRowHeight)
            .fillAndStroke(rowBg, "black");
          doc.fillColor("black");
          doc.text(value, currentX + cellPadding, y + cellPadding, {
            width: width - cellPadding * 2,
            align: "left",
            baseline: "top",
          });
          currentX += width;
        });

        return maxRowHeight;
      };

      tableY += drawHeaderRow(tableY);

      queryResults.forEach((row, rowIdx) => {
        let estimatedHeight = 15;
        headers.forEach((header, colIndex) => {
          const width = colWidths[colIndex];
          const value =
            row[header] !== null && row[header] !== undefined
              ? String(row[header])
              : "";
          estimatedHeight = Math.max(
            estimatedHeight,
            getTextHeight(value, width, dataFontSize),
          );
        });

        if (tableY + estimatedHeight > doc.page.height - margin) {
          doc.addPage();
          tableY = doc.y;
          tableY += drawHeaderRow(tableY);
        }

        tableY += drawDataRow(row, tableY, rowIdx);
      });
    } else {
      doc.fontSize(12).text("No data to display", { align: "center" });
    }

    doc.end();
  });
};

const archiver = require("archiver");

const createZipBuffer = (files) => {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];

    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", (err) => reject(err));

    for (const file of files) {
      if (!file || !file.filename) continue;
      let buf;
      if (Buffer.isBuffer(file.content)) {
        buf = file.content;
      } else if (typeof file.content === "string") {
        const enc = file.encoding === "base64" ? "base64" : "utf-8";
        buf = Buffer.from(file.content, enc);
      } else {
        continue;
      }
      archive.append(buf, { name: file.filename });
    }

    archive.finalize();
  });
};

const formatCdnLinksHtml = (filesWithCdn) => {
  if (!filesWithCdn || !filesWithCdn.length) return "";
  const listItems = filesWithCdn
    .map(
      (f) =>
        `<li style="margin-bottom: 8px;">` +
        `<a href="${f.cdn_url}" style="color: #2563eb; text-decoration: underline; font-weight: 500;" target="_blank" rel="noopener noreferrer">${f.filename || "Attachment"}</a>` +
        `</li>`,
    )
    .join("");

  return (
    `<div style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: Arial, sans-serif;">` +
    `<p style="margin: 0 0 12px 0; font-weight: bold; color: #1e293b; font-size: 14px;">📎 Attachments (Download via direct link):</p>` +
    `<ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 13px;">${listItems}</ul>` +
    `<p style="margin: 12px 0 0 0; font-size: 11px; color: #64748b;">Note: To ensure fast and reliable email delivery, these files are provided as secure download links.</p>` +
    `</div>`
  );
};

const formatCdnLinksText = (filesWithCdn) => {
  if (!filesWithCdn || !filesWithCdn.length) return "";
  const lines = filesWithCdn
    .map((f) => `- ${f.filename}: ${f.cdn_url}`)
    .join("\n");
  return `\n\nAttachments (Download Links):\n${lines}\n(Note: Files provided via secure download links due to message size limits)\n`;
};

const processSmartAttachments = async ({
  attachments = [],
  entityId = "",
  currentBody = "",
  maxCount = 6,
  maxRawBytes = 15 * 1024 * 1024,
  maxZipBytes = 15 * 1024 * 1024,
}) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { attachments: [], updatedBody: currentBody, mode: "DIRECT" };
  }

  let totalRawBytes = 0;
  for (const att of attachments) {
    if (att.sizeBytes && typeof att.sizeBytes === "number") {
      totalRawBytes += att.sizeBytes;
    } else if (Buffer.isBuffer(att.content)) {
      totalRawBytes += att.content.length;
    } else if (typeof att.content === "string") {
      const enc = att.encoding === "base64" ? "base64" : "utf-8";
      totalRawBytes += Buffer.byteLength(att.content, enc);
    }
  }

  const shouldCompress =
    attachments.length > maxCount || totalRawBytes > maxRawBytes;

  if (!shouldCompress) {
    return {
      attachments,
      updatedBody: currentBody,
      mode: "DIRECT",
      rawSize: totalRawBytes,
    };
  }

  try {
    const zipBuffer = await createZipBuffer(attachments);
    const zipSize = zipBuffer.length;

    if (zipSize <= maxZipBytes) {
      const zipFilename = `Attachments_${entityId || "Bundle"}.zip`;
      return {
        attachments: [
          {
            filename: zipFilename,
            content: zipBuffer.toString("base64"),
            encoding: "base64",
            contentType: "application/zip",
            sizeBytes: zipSize,
          },
        ],
        updatedBody: currentBody,
        mode: "ZIP",
        rawSize: totalRawBytes,
        zipSize,
      };
    }
  } catch (zipErr) {}

  const filesWithCdn = attachments.filter((a) => a.cdn_url);
  const filesWithoutCdn = attachments.filter((a) => !a.cdn_url);

  let updatedBody = currentBody || "";
  if (filesWithCdn.length > 0) {
    const isHtml =
      /<[a-z][\s\S]*>/i.test(updatedBody) ||
      updatedBody.includes("<div") ||
      updatedBody.includes("<p");
    if (isHtml) {
      updatedBody += formatCdnLinksHtml(filesWithCdn);
    } else {
      updatedBody += formatCdnLinksText(filesWithCdn);
    }
  }

  let remainingAttachments = [];
  const filesWithoutCdnSize = filesWithoutCdn.reduce((sum, f) => {
    return (
      sum +
      (f.sizeBytes ||
        (f.content ? Buffer.byteLength(f.content, f.encoding || "base64") : 0))
    );
  }, 0);

  if (filesWithoutCdn.length > 0 && filesWithoutCdnSize < 5 * 1024 * 1024) {
    remainingAttachments = filesWithoutCdn;
  }

  return {
    attachments: remainingAttachments,
    updatedBody,
    mode: "CDN_LINKS",
    rawSize: totalRawBytes,
    filesWithCdnCount: filesWithCdn.length,
  };
};

module.exports = {
  generateExcelBuffer,
  generatePdfBuffer,
  createZipBuffer,
  formatCdnLinksHtml,
  formatCdnLinksText,
  processSmartAttachments,
};
