import * as XLSX from "xlsx";
import { parseCsv, type ParsedTable } from "../../shared/emailMarketing/importContacts";

export function parseTabularUpload(input: { text?: string; base64?: string; filename?: string }): ParsedTable {
  const name = (input.filename || "").toLowerCase();
  const isWorkbook = name.endsWith(".xlsx") || name.endsWith(".xls") || Boolean(input.base64 && !input.text);
  if (isWorkbook) {
    if (!input.base64) throw new Error("The spreadsheet file was empty.");
    const workbook = XLSX.read(Buffer.from(input.base64, "base64"), { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const lines = matrix.map((row) => row.map((cell) => String(cell ?? "").trim()));
    const filled = lines.filter((row) => row.some((cell) => cell.length > 0));
    if (!filled.length) return { headers: [], rows: [] };
    const width = filled.reduce((max, row) => Math.max(max, row.length), 0);
    const headers = filled[0].concat(Array(Math.max(0, width - filled[0].length)).fill("")).map((header, index) => header || `Column ${index + 1}`);
    const rows = filled.slice(1).map((row) => {
      const next = row.slice(0, headers.length);
      while (next.length < headers.length) next.push("");
      return next;
    });
    return { headers, rows };
  }
  return parseCsv(input.text || "");
}
