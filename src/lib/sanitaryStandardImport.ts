import type { StandardImportRowRecord } from '../types/standardImport';
import { firstCommentDate } from './standardCommentDate.ts';

interface SourceComment { row: number; column: number; cell: string; author: string; text: string }
interface Merge { s: { r: number; c: number }; e: { r: number; c: number } }
const text = (value: unknown) => String(value ?? '').trim();
const columnFields: Record<number, string> = {
  1: 'customer_model', 3: 'lid_standard', 4: 'lid_torque', 5: 'lid_oil', 6: 'lid_fall_time',
  7: 'lid_step', 8: 'lid_length', 9: 'lid_marking', 11: 'seat_standard', 12: 'seat_torque',
  13: 'seat_oil', 14: 'seat_fall_time', 15: 'seat_step', 16: 'seat_length', 17: 'seat_marking', 18: 'remark',
};
const labels: Record<string, string> = {
  customer: '客户名', model: '产品型号', customer_model: '客户型号', lid_standard: '盖·标准',
  lid_torque: '盖·实际扭矩（kg，原表）', lid_oil: '盖·使用油号', lid_fall_time: '盖·下落时间',
  lid_step: '盖·下座台阶', lid_length: '盖·产品长度', lid_marking: '盖·印字',
  seat_standard: '座垫·标准', seat_torque: '座垫·实际扭矩（kg，原表）', seat_oil: '座垫·使用油号',
  seat_fall_time: '座垫·下落时间', seat_step: '座垫·下座台阶', seat_length: '座垫·产品长度',
  seat_marking: '座垫·印字', remark: '公共备注', import_note: '来源附加说明',
};
function mergedValue(rows: unknown[][], row: number, column: number, merges: Merge[]) {
  const direct = text(rows[row]?.[column]);
  if (direct) return direct;
  const merge = merges.find(m => m.s.c === column && m.e.c === column && m.s.r <= row && row <= m.e.r);
  return merge ? text(rows[merge.s.r]?.[column]) : '';
}
export function parseSanitaryImportRows(rows: unknown[][], options: { mergedRanges?: Merge[]; comments?: SourceComment[] } = {}) {
  const records: StandardImportRowRecord[] = [], errors: string[] = [];
  const warnings = ['实际扭矩按原表 kg 单位保留，未换算；正文与历史批注不一致时保留正文，请工程核查。'];
  let inData = false;
  for (const [r, row] of rows.entries()) {
    const first = text(row[0]);
    if (first === '客户名' && text(row[2]).replace(/\s/g, '') === '产品型号') { inData = true; continue; }
    if (/^(注[:：]|客户标准参数一览表)/.test(first)) { inData = false; continue; }
    if (!inData || !row.slice(3, 19).some(value => text(value))) continue;
    // Only data rows with a product identity (including a real vertical merge) are eligible.
    const customer = mergedValue(rows, r, 0, options.mergedRanges || []);
    const model = mergedValue(rows, r, 2, options.mergedRanges || []);
    if (!customer || !model) { errors.push(`卫浴第 ${r + 1} 行缺少客户或产品型号，请核查合并范围。`); continue; }
    const fields = Object.fromEntries(Object.values(columnFields).map(key => [key, '']));
    for (const [column, key] of Object.entries(columnFields)) fields[key] = text(row[Number(column)]);
    fields.customer_model = mergedValue(rows, r, 1, options.mergedRanges || []);
    const notes = row.flatMap((value, c) => c >= 3 && !columnFields[c] && text(value)
      ? [`${columnName(c)}${r + 1}：${text(value)}`] : []);
    fields.import_note = notes.join('\n');
    const comments = (options.comments || []).filter(c => c.row === r).map(c => {
      const key = c.column === 0 ? 'customer' : c.column === 2 ? 'model' : columnFields[c.column] || 'import_note';
      const body = c.text.split('\0')[0].trim();
      const changedAt = firstCommentDate(body);
      return { fieldKey: key, fieldLabel: labels[key], author: c.author, text: body, cell: c.cell, changedAt };
    }).filter(c => c.text);
    if (/共用|暂无/.test(fields.lid_standard + fields.seat_standard)) warnings.push(`卫浴第 ${r + 1} 行含“共用/暂无”，已按原文保留，不展开引用参数。`);
    for (const c of comments.filter(c => c.fieldKey.endsWith('_length'))) warnings.push(`${c.cell} 长度含历史批注，请核对正文“${fields[c.fieldKey]}”与原始批注。`);
    records.push({ sourceRow: r + 1, serialNo: '', customer, model, customerPartNo: '', categoryKey: 'sanitary_damper', standardType: 'formal', fields, comments });
  }
  if (!records.length) errors.push('未识别到马桶座盖数据，请核查工作表及表头。');
  return { records, errors, warnings };
}
function columnName(column: number): string {
  return column < 26 ? String.fromCharCode(65 + column) : columnName(Math.floor(column / 26) - 1) + String.fromCharCode(65 + column % 26);
}
