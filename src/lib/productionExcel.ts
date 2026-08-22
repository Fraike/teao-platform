import type { WorkSheet } from "xlsx";

export interface ExportColumn {
  key: string;
  title: string;
  format?: string;
}

export interface ProductionExportGroup {
  date: string;
  records: object[];
  summary: object;
}

function pickRow(source: Record<string, unknown>, columns: ExportColumn[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((column) => [column.title, source[column.key] ?? ""]));
}

function applyFormats(sheet: WorkSheet, columns: ExportColumn[], rowCount: number, encodeCell: (cell: { r: number; c: number }) => string) {
  columns.forEach((column, columnIndex) => {
    if (!column.format) return;
    for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
      const cell = sheet[encodeCell({ r: rowIndex, c: columnIndex })];
      if (cell) cell.z = column.format;
    }
  });
}

export function buildProductionExportRows(groups: ProductionExportGroup[], detailColumns: ExportColumn[], summaryColumns: ExportColumn[]) {
  return {
    detail: groups.flatMap((group) => group.records.map((record) => pickRow({ ...(record as Record<string, unknown>), date: group.date }, detailColumns))),
    summary: groups.map((group) => pickRow({ ...(group.summary as Record<string, unknown>), date: group.date }, summaryColumns)),
  };
}

export async function exportProductionExcel(filename: string, groups: ProductionExportGroup[], detailColumns: ExportColumn[], summaryColumns: ExportColumn[]) {
  const XLSX = await import("xlsx");
  const rows = buildProductionExportRows(groups, detailColumns, summaryColumns);
  const workbook = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet(rows.detail, { header: detailColumns.map((column) => column.title) });
  const summarySheet = XLSX.utils.json_to_sheet(rows.summary, { header: summaryColumns.map((column) => column.title) });
  applyFormats(detailSheet, detailColumns, rows.detail.length, XLSX.utils.encode_cell);
  applyFormats(summarySheet, summaryColumns, rows.summary.length, XLSX.utils.encode_cell);
  detailSheet["!cols"] = detailColumns.map((column) => ({ wch: Math.max(10, Math.min(22, column.title.length * 2 + 8)) }));
  summarySheet["!cols"] = summaryColumns.map((column) => ({ wch: Math.max(10, column.title.length * 2 + 8) }));
  XLSX.utils.book_append_sheet(workbook, detailSheet, "日报明细");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "每日汇总");
  XLSX.writeFile(workbook, filename, { compression: true });
}
