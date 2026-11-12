import * as XLSX from 'xlsx';
import { validateStandardZip } from './standardZipLimits.ts';
import {
  CUSTOMER_ACCOUNT_IMPORT_LIMIT, customerAccountContainsPassword, customerAccountDetails, customerAccountIdentity,
  customerAccountImportIssues, customerAccountUrl,
} from './customerSystemAccount.ts';
import type { CustomerAccountImportRow } from '../types/customerSystemAccount.ts';

export interface CustomerAccountPreviewRow extends CustomerAccountImportRow {
  errors: string[];
  reviews: string[];
  duplicate: boolean;
}

const heading = ['公司名称', '网址', '账号', '密码', '备注'];
const maxRows = 2000;
const maxColumns = 30;

function cellAt(sheet: XLSX.WorkSheet, r: number, c: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r, c })];
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.f) return '';
  if (cell.t === 'n') return cell.w ?? XLSX.utils.format_cell(cell);
  return typeof cell.v === 'string' ? cell.v : '';
}

function hasContent(cell: XLSX.CellObject | undefined): boolean {
  return Boolean(cell && (cell.f || cell.l?.Target || String(cell.v ?? '').trim()));
}

function parseRow(sheet: XLSX.WorkSheet, r: number, width: number): CustomerAccountPreviewRow | null {
  const cells = Array.from({ length: width }, (_, c) => cellAt(sheet, r, c));
  if (!cells.slice(1).some(hasContent)) return null;
  const [, company, url, username, password, note] = cells;
  const details = customerAccountDetails({
    company: cellText(company),
    url: url?.f ? '' : url?.l?.Target || cellText(url),
    username: cellText(username),
    note: cellText(note),
  });
  const account = { ...details, url: customerAccountUrl(details.url) || details.url, password: cellText(password) };
  const reviews: string[] = [];
  if (username?.t === 'n') reviews.push('账号为数字格式');
  if (password?.t === 'n') reviews.push('密码为数字格式');
  if (account.password !== account.password.trim()) reviews.push('密码含首尾空白');
  if (cells.slice(6).some(hasContent)) reviews.push('额外列有内容');
  if (note?.f || note?.t === 'e') reviews.push('备注含公式或错误值');
  if (/密码|口令|密钥|password|passcode|token/i.test(account.note) ||
    customerAccountContainsPassword(account.note, account.password)) {
    account.note = '';
    reviews.push('备注可能含凭据，已清空待核对');
  }
  return { rowNumber: r + 1, account, reviews, errors: customerAccountImportIssues(account), duplicate: false };
}

export async function parseCustomerAccountWorkbook(buffer: ArrayBuffer): Promise<CustomerAccountPreviewRow[]> {
  if (buffer.byteLength < 4 || buffer.byteLength > 5 * 1024 * 1024 ||
    new DataView(buffer).getUint32(0, true) !== 0x04034b50) {
    throw new Error('请选择不超过 5 MB 的 .xlsx 文件');
  }
  await validateStandardZip(buffer);
  const book = XLSX.read(buffer, { type: 'array', sheetRows: maxRows + 1, cellHTML: false });
  const matches = book.SheetNames.flatMap(name => {
    const sheet = book.Sheets[name];
    const header = Array.from({ length: 10 }, (_, r) => r).find(r =>
      heading.every((label, index) => cellText(cellAt(sheet, r, index + 1)).trim() === label));
    return header === undefined ? [] : [{ sheet, header }];
  });
  if (matches.length !== 1) throw new Error('需要一个包含「公司名称、网址、账号、密码、备注」表头的工作表');
  const { sheet, header } = matches[0];
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
  if (range.e.r >= maxRows || range.e.c >= maxColumns) throw new Error('工作表最多 2000 行、30 列');
  const rows: CustomerAccountPreviewRow[] = [];
  const seen = new Map<string, CustomerAccountPreviewRow>();
  for (let r = header + 1; r <= range.e.r; r++) {
    const row = parseRow(sheet, r, Math.max(range.e.c + 1, 6));
    if (!row) continue;
    rows.push(row);
    if (rows.length > CUSTOMER_ACCOUNT_IMPORT_LIMIT) throw new Error('一次最多导入 500 条账号');
    if (row.errors.length) continue;
    const key = customerAccountIdentity(row.account);
    const previous = seen.get(key);
    if (previous) {
      previous.duplicate = true;
      row.duplicate = true;
    } else seen.set(key, row);
  }
  if (!rows.length) throw new Error('工作表中没有可预览的账号');
  return rows;
}
