import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { parseCustomerAccountWorkbook } from '../src/lib/customerAccountImport.ts';

test('Excel preview uses link targets, preserves credential text and flags rows for review', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['客户系统账号密码管理'],
    ['序号', '公司名称', '网址', '账号', '密码', '备注'],
    [1, ' 示例公司 ', '点击这里', '0004', ' secret ', '说明：secret'],
    [2, '示例公司', 'https://portal.example.test/', '0004', 'other'],
    [3, '示例公司', 'portal.example.test', 5, 'secret', '', '待处理'],
    [4],
    [5, '', '', 'only-account'],
  ]);
  sheet.C3.l = { Target: 'https://portal.example.test/' };
  sheet.D5.z = '0000';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '客户系统账号');
  const rows = await parseCustomerAccountWorkbook(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
  assert.deepEqual(rows.map(row => row.rowNumber), [3, 4, 5, 7]);
  assert.equal(rows[0].account.url, 'https://portal.example.test/');
  assert.equal(rows[0].account.company, '示例公司');
  assert.equal(rows[0].account.username, '0004');
  assert.equal(rows[0].account.password, ' secret ');
  assert.equal(rows[0].account.note, '');
  assert.deepEqual(rows[0].reviews, ['密码含首尾空白', '备注可能含凭据，已清空待核对']);
  assert.equal(rows[0].duplicate, true);
  assert.equal(rows[1].duplicate, true);
  assert.equal(rows[2].account.username, '0005');
  assert.deepEqual(rows[2].reviews, ['账号为数字格式', '额外列有内容']);
  assert.ok(rows[2].errors.some(error => error.includes('网址')));
  assert.ok(rows[3].errors.some(error => error.includes('公司名称')));
});
