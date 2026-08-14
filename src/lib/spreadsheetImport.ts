export const MAX_SPREADSHEET_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 10001;
export const MAX_SPREADSHEET_COLUMNS = 100;

export function validateSpreadsheetFileSize(size: number): string | null {
  return size <= MAX_SPREADSHEET_FILE_BYTES ? null : "文件不能超过10MB";
}

export function validateSpreadsheetShape(rowCount: number, columnCount: number): string | null {
  if (rowCount > MAX_SPREADSHEET_ROWS) return `工作表不能超过${MAX_SPREADSHEET_ROWS}行`;
  if (columnCount > MAX_SPREADSHEET_COLUMNS) return `工作表不能超过${MAX_SPREADSHEET_COLUMNS}列`;
  return null;
}
