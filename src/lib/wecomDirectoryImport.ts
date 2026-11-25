import type { WecomDirectoryMember } from '../types/wecomDirectory';

const trim = (value: unknown) => String(value ?? '').trim();

export async function readWecomDirectoryExcel(bytes: ArrayBuffer | Uint8Array): Promise<WecomDirectoryMember[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(bytes, { type: 'array' });
  const worksheet = workbook.Sheets['成员列表'] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error('通讯录工作表为空');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, blankrows: false });
  const headerRow = rows.findIndex(row => row.some(value => trim(value) === '姓名') &&
    row.some(value => ['账号', '帐号', 'UserID'].includes(trim(value))));
  if (headerRow < 0) throw new Error('通讯录缺少姓名和账号列');
  const header = rows[headerRow];
  const nameIndex = header.findIndex(value => trim(value) === '姓名');
  const departmentIndex = header.findIndex(value => trim(value) === '部门');
  const idIndex = header.findIndex(value => ['账号', '帐号', 'UserID'].includes(trim(value)));
  return rows.slice(headerRow + 1).flatMap(row => {
    const name = trim(row[nameIndex]);
    const userId = trim(row[idIndex]);
    const departments = trim(row[departmentIndex]).split(/[；;]/).map(trim).filter(Boolean);
    return name || userId ? [{ name, userId, departments }] : [];
  });
}
