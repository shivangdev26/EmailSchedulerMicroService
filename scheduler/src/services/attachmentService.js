const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { Readable } = require("stream");

/**
 * Generates an Excel buffer from query results
 * @param {Array|Object} queryResults - Single query data array or rawResults object with multiple queries
 * @param {string} filename - Name of the file (without extension)
 * @param {string} worksheetType - "S" for single sheet, "M" for multiple sheets
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
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
          header,
          key: header,
          width: 20,
        }));

        data.forEach((row) => {
          worksheet.addRow(row);
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
          cell.value = header;
          cell.font = { bold: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD3D3D3" },
          };
        });
        currentRow++;

        data.forEach((row) => {
          const dataRow = worksheet.getRow(currentRow);
          headers.forEach((header, index) => {
            dataRow.getCell(index + 1).value = row[header];
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

/**
 * Generates a PDF buffer from query results
 * @param {Array} queryResults - Array of query result data
 * @param {string} filename - Name of the file (without extension)
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
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
      const cellPadding = 3;
      const headerFontSize = 7;
      const dataFontSize = 6;

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
        const headerRowHeight = 18;

        headers.forEach((header, colIndex) => {
          const width = colWidths[colIndex];
          doc.rect(currentX, y, width, headerRowHeight).stroke();
          doc.text(header, currentX + cellPadding, y + cellPadding, {
            width: width - cellPadding * 2,
            align: "left",
            baseline: "top",
          });
          currentX += width;
        });
        return headerRowHeight;
      };

      const drawDataRow = (row, y) => {
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

        let currentX = startX;
        headers.forEach((header, colIndex) => {
          const width = colWidths[colIndex];
          const value =
            row[header] !== null && row[header] !== undefined
              ? String(row[header])
              : "";

          doc.rect(currentX, y, width, maxRowHeight).stroke();
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

      queryResults.forEach((row) => {
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

        tableY += drawDataRow(row, tableY);
      });
    } else {
      doc.fontSize(12).text("No data to display", { align: "center" });
    }

    doc.end();
  });
};

module.exports = {
  generateExcelBuffer,
  generatePdfBuffer,
};
