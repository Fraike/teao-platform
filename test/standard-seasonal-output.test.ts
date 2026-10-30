import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { activeStandardFields } from '../src/lib/standardFieldGroups.ts';
import { standardSpecificationFields } from '../src/lib/standardOutputFields.ts';
import { buildStandardPrintHtml } from '../src/lib/standardPrint.ts';
import { buildStandardWorkbook } from '../src/lib/standardExcel.ts';
import { parseStandardImportRows } from '../src/lib/standardImport.ts';
import { standardVersionDiff } from '../src/lib/standardVersionDiff.ts';
import type { StandardCategory } from '../src/types/standard.ts';
import type { StandardPrintProduct } from '../src/types/standardPrint.ts';

const category: StandardCategory = { key: 'gear_damper', name: '齿形阻尼器', fields: [
  { key: 'test_standard', label: '测试标准gf.cm' }, { key: 'marking', label: '打码' },
] };
const product = { standard: { serialNo: 'SP0006-C', sourceComments: [] }, version: {
  id: 'v', versionNo: 1, categoryKey: category.key, status: 'published', standardType: 'formal',
  fields: { test_standard: '120-160', winter_test_standard: '100-140\n完整冬季要求', extra: '原样保留' },
} } as StandardPrintProduct;

test('review comparison includes winter changes with an older category template', () => {
  const before={...product.version,fields:{test_standard:'120-160',winter_test_standard:'90-130'}};
  const after={...product.version,fields:{test_standard:'120-160',winter_test_standard:'100-140'}};
  const diff=standardVersionDiff(before,after,[category]);
  assert.deepEqual(diff.map(row=>[row.key,row.label,row.before,row.after]),[['winter_test_standard','冬季测试标准','90-130','100-140']]);
});

test('forms augment old categories without mutation, retain units and offer combined-column opt-out', () => {
  const original = structuredClone(category);
  const fields = activeStandardFields(category);
  assert.deepEqual(fields.map(f => f.key), ['test_standard', 'winter_test_standard', 'marking']);
  assert.equal(fields[0].label, '夏季／常规测试标准gf.cm');
  assert.equal(fields[1].label, '冬季测试标准');
  assert.equal(activeStandardFields(category, {}).length, 3);
  assert.deepEqual(activeStandardFields(category, {}, { includeWinter: false }).map(f => f.key), ['test_standard', 'marking']);
  assert.deepEqual(activeStandardFields({ ...category, fields }, {}), fields);
  assert.deepEqual(category, original);
  assert.deepEqual(activeStandardFields({ ...category, fields: [{ key: 'product_standard', label: '产品标准' }] }).map(f => f.key), ['product_standard']);
});

test('Excel has distinct seasonal columns, complete winter values and no duplicate raw field', async () => {
  const definitions = standardSpecificationFields([product], category);
  assert.equal(definitions.filter(f => f.key === 'winter_test_standard').length, 1);
  assert.equal(definitions.find(f => f.key === 'winter_test_standard')?.label, '冬季测试标准');
  const book = await buildStandardWorkbook([product], [category], '2026-10-19');
  const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['齿轮阻尼器'], { header: 1 });
  assert.equal(rows[1][rows[0].indexOf('冬季测试标准')], product.version.fields.winter_test_standard);
  assert(!rows[0].includes('winter_test_standard'));
  assert(rows[1].includes('原样保留'));
  const summerOnly = { ...product, version: { ...product.version, fields: { test_standard: '120-160' } } };
  assert(standardSpecificationFields([summerOnly], category).some(f => f.key === 'winter_test_standard'));
});

for (const winterHeader of ['冬季测试标准', '冬季测试范围']) {
  test(`import explicit ${winterHeader} with moved summer and marking columns and comments`, () => {
    const { records } = parseStandardImportRows([
      ['齿形阻尼器'],
      ['序号', '客户名', '型号', '客户料号', '扭矩标准', winterHeader, '打码', '夏季测试标准', '齿轮规格', '备注'],
      ['SP0006-C', '客户', '型号', '料号', '扭矩', '100-140', '喷码', '120-160', '齿轮', '备注'],
    ], { comments: [{ row: 2, column: 5, cell: 'F3', author: '工程', text: '2025-11-01 冬季100-140' },
      { row: 2, column: 7, cell: 'H3', author: '工程', text: '夏季120-160' }] });
    assert.deepEqual(records[0].fields, { torque_standard: '扭矩', winter_test_standard: '100-140', marking: '喷码', test_standard: '120-160', gear_spec: '齿轮', remark: '备注' });
    assert.deepEqual(records[0].comments?.map(c => [c.fieldKey, c.fieldLabel]), [
      ['winter_test_standard', '冬季测试标准'], ['test_standard', '测试范围'],
    ]);
  });
}

test('moved explicit summer header removes fallback duplicate so later columns cannot overwrite it', () => {
  const { records } = parseStandardImportRows([
    ['齿形阻尼器'], ['序号', '客户名', '型号', '客户料号', '夏季／常规测试标准gf.cm', '冬季测试标准', '打码', '齿轮规格', '', '备注'],
    ['SP-A', '客户', '型号', '', '120-160', '100-140', '喷码', '齿轮', '', '备注'],
    ['筒型阻尼器'], ['SP-B', '客户', '型号', '', '扭矩', '常规', '喷码', '归位'],
  ]);
  assert.equal(records[0].fields.test_standard, '120-160');
  assert.equal(records[0].fields.torque_standard, undefined);
  assert.equal(records[1].fields.test_standard, '常规');
  assert.equal(records[1].fields.winter_test_standard, undefined);
});

test('dated winter candidates and cancellation comments remain provenance without applying values', () => {
  const { records } = parseStandardImportRows([
    ['齿条阻尼器'], ['SP0006-C', '客户', '型号', '', '', '120-160'], ['SP0008-E', '客户', '型号', '', '', '120-160'],
  ], { comments: [{ row: 1, column: 5, cell: 'F2', author: '', text: '2025-11-01 冬季100-140' },
    { row: 2, column: 5, cell: 'F3', author: '', text: '2026-02-04 取消冬季扭矩' }] });
  for (const record of records) {
    assert.equal(record.fields.test_standard, '120-160');
    assert.equal(record.fields.winter_test_standard, undefined);
    assert.equal(record.comments?.length, 1);
  }
  assert.match(records[1].comments![0].text, /取消冬季/);
});

test('print displays complete winter only when supplied and never borrows it for summer-only snapshots', () => {
  const options = { generatedAt: '2026-10-19', styleUrl: '/print.css' };
  const html = buildStandardPrintHtml([product], [category], options);
  assert(html.includes('夏季／常规测试标准gf.cm'));
  assert(html.includes('冬季测试标准'));
  assert(html.includes('100-140\n完整冬季要求'));
  const snapshot = { ...product, version: { ...product.version, fields: { test_standard: '120-160' } } };
  const summer = buildStandardPrintHtml([snapshot], [category], options);
  assert(!summer.includes('冬季测试标准'));
  assert(!summer.includes('100-140'));
});
