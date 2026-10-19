import { isSanitaryComponentSheet, parseSanitaryComponentRows } from "./sanitaryComponentImport";
import { sanitaryModelDecision } from "../data/sanitarySourceDecisions";
import * as XLSX from "xlsx";
import { validateStandardZip } from "./standardZipLimits";
import { sha256Hex } from "./sha256";
import { parseSanitaryImportRows } from "./sanitaryStandardImport";
import { parseStandardImportRows } from "./standardImport";
import type { StandardImportFileResult, StandardImportSource, StandardImportScope } from "../types/standardImport";

export const STANDARD_IMPORT_LIMITS = {
  bytes: 10 * 1024 * 1024, records: 10000, rows: 10001, columns: 100, cells: 500000,
} as const;

function sheetSource(sheet: XLSX.WorkSheet, sheetName: string): StandardImportSource {
  const range = sheet["!fullref"] || sheet["!ref"] || "A1";
  const decoded = XLSX.utils.decode_range(range);
  // 从 A1 开始计数，不能按非空区域偏移压缩绝对行号。
  const rowCount = decoded.e.r + 1;
  const columnCount = decoded.e.c + 1;
  if (!Number.isSafeInteger(rowCount) || !Number.isSafeInteger(columnCount)
    || decoded.s.r < 0 || decoded.s.c < 0 || rowCount < 1 || columnCount < 1
    || rowCount > STANDARD_IMPORT_LIMITS.rows || columnCount > STANDARD_IMPORT_LIMITS.columns
    || rowCount * columnCount > STANDARD_IMPORT_LIMITS.cells) {
    throw new Error("工作表范围超出上限：10001 行、100 列、500000 个范围单元格。");
  }
  // !ref 可能被错误的 dimension 缩小，实际单元格也需要校验。
  let count = 0;
  for (const cell of Object.keys(sheet)) {
    if (cell.startsWith("!")) continue;
    const position = XLSX.utils.decode_cell(cell);
    if (position.r >= rowCount || position.c >= columnCount || ++count > STANDARD_IMPORT_LIMITS.cells) {
      throw new Error("实际单元格范围超出工作表范围或导入上限。");
    }
  }
  return { sheetName, range, rowCount, columnCount };
}

export async function parseStandardImportFile(buffer: ArrayBuffer, scope: StandardImportScope = "main"): Promise<StandardImportFileResult> {
  if (!buffer.byteLength || buffer.byteLength > STANDARD_IMPORT_LIMITS.bytes) {
    throw new Error("请选择非空文件，大小不超过 10MB。");
  }
  await validateStandardZip(buffer);
  const fileHash = await sha256Hex(new Uint8Array(buffer));
  const names = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames;
  const sheetName = names.find(name => scope === "sanitary" ? name.includes("智能卫浴") : !name.includes("智能卫浴"));
  if (!sheetName) throw new Error(scope === "sanitary" ? "未找到智能卫浴工作表。" : "未找到常规标准工作表。");
  // 先用一行读取取得原始 dimension / !fullref，拒绝异常宽表后才读取数据行。
  const preflight = XLSX.read(buffer, {
    type: "array", sheets: [sheetName], sheetRows: 1,
    cellHTML: false, cellFormula: false, cellStyles: false,
  }).Sheets[sheetName];
  if (!preflight) throw new Error("无法读取标准工作表。");
  sheetSource(preflight, sheetName);
  const workbook = XLSX.read(buffer, {
    type: "array", sheets: [sheetName],
    cellHTML: false, cellFormula: false, cellStyles: false,
  });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("无法读取标准工作表。");
  const source = sheetSource(sheet, sheetName);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, defval: "", blankrows: true,
    range: { s: { r: 0, c: 0 }, e: { r: source.rowCount - 1, c: source.columnCount - 1 } },
  });
  const comments = Object.entries(sheet).filter(([cell]) => !cell.startsWith("!")).flatMap(([cell, value]) => {
    const position = XLSX.utils.decode_cell(cell);
    return (value.c ?? []).map((comment: XLSX.Comment) => ({
      row: position.r, column: position.c, cell, author: comment.a || "Excel", text: comment.t || "",
    }));
  });
  const components = scope === "sanitary" && isSanitaryComponentSheet(rows);
  const parsed = (scope === "sanitary" ? (components ? parseSanitaryComponentRows : parseSanitaryImportRows) : parseStandardImportRows)(rows, { mergedRanges: sheet["!merges"], comments });
  if (parsed.records.length > STANDARD_IMPORT_LIMITS.records) throw new Error("一次最多导入 10000 条标准。");
  if (components && fileHash === sanitaryModelDecision.sourceHash) {
    for (const record of parsed.records) {
      if (!record.model && sanitaryModelDecision.serialNos.includes(record.serialNo)) {
        record.model = sanitaryModelDecision.model;
        record.fields.import_note = [record.fields.import_note, sanitaryModelDecision.note].filter(Boolean).join("\n");
        parsed.warnings = parsed.warnings.filter(warning => !warning.startsWith(`${record.serialNo}原表产品型号为空`));
        parsed.warnings.push(`${record.serialNo}：${sanitaryModelDecision.note}`);
      }
    }
  }
  if (scope === "sanitary" && !components) {
    const identities = new Set<string>();
    for (const record of parsed.records) {
      const identity = JSON.stringify([record.customer, record.fields.customer_model, record.model, record.fields.lid_standard, record.fields.seat_standard]);
      if (identities.has(identity)) parsed.errors.push(`卫浴第 ${record.sourceRow} 行业务身份重复，请核查后为不同项目提供区分字段。`);
      identities.add(identity);
      record.serialNo = `WY-${(await sha256Hex(new TextEncoder().encode(identity))).slice(0, 16)}`;
    }
  }
  return { ...parsed, records: parsed.records.map(record => ({ ...record, sourceHash: fileHash, sourceSheet: sheetName })), fileHash, source };
}
