import assert from 'node:assert/strict';
import { test } from 'node:test';
import XLSX from 'xlsx';

const audit = () => import('../server/scripts/audit-standard-excel.js');
const version = (overrides = {}) => ({ standard_id: 'one', serial_no: 'SP1', model: 'M', customer: '客户▲*', vehicle_model: 'A55', category_key: 'barrel_damper', standard_type: 'formal', customer_part_no: '', fields: { rib_return: '是' }, ...overrides });
function sheet() {
  return XLSX.utils.aoa_to_sheet([
    ['', '筒型阻尼器'],
    ['序号', '客户名', '型号', '客户料号', '扭矩标准', '测试范围', '打点颜色/喷码', '筋条是否归位', '', '备注'],
    ['SP1', '客户A55▲*', 'M', '', '', '', '', '是'],
  ]);
}

test('second-column barrel heading uses real header; only literal DB project is removed and flags compared', async () => {
  const { readMainSheet, reconcile } = await audit();
  const source = readMainSheet(sheet());
  assert.equal(source.records[0].categoryKey, 'barrel_damper');
  assert.equal(source.records[0].fields.rib_return, '是');
  assert.equal(reconcile(source, [version()], []).fieldDiffs.length, 0);
  const result = reconcile(source, [version({ customer: '客户', category_key: 'gear_damper', fields: { gear_spec: '是' } })], []);
  assert.ok(result.fieldDiffs.some(d => d.field === 'customer_flags'));
  assert.ok(result.fieldDiffs.some(d => d.field === 'category_key'));
  assert.equal(reconcile(source, [version({ vehicle_model: 'OTHER' })], []).missingRecords.length, 1);
});

test('same serial different customer stays independent; duplicate identities are reported, never arbitrarily matched', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet();
  XLSX.utils.sheet_add_aoa(s, [['SP1', '另一客户', 'M', '', '', '', '', '是']], { origin: 'A4' });
  const source = readMainSheet(s);
  const rows = [version(), version({ standard_id: 'two', customer: '另一客户', vehicle_model: '' })];
  assert.equal(reconcile(source, rows, []).summary.matchedRecords, 2);
  source.records.push({ ...source.records[0], row: 5 });
  const result = reconcile(source, rows, []);
  assert.equal(result.duplicateSourceIdentities.length, 1);
  assert.equal(result.summary.matchedRecords, 1);
});

test('NUL suffix is removed; dates missing or partial are distinct from exact dated matches; unmatched readable text retained', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet();
  s.H3.c = [{ a: 'Alice', t: 'Alice:\n2024.1.2 改为是\n无日期说明\n2024.2 月度调整\n丢失内容\0corrupt' }];
  const source = readMainSheet(s);
  const changes = ['改为是', '无日期说明', '月度调整'].map((description, i) => ({ id: String(i), standard_id: 'one', field_key: 'rib_return', description, changed_at: ['2024-01-02', '2020-01-01', '2024-02-05'][i] }));
  const result = reconcile(source, [version()], changes);
  assert.equal(result.comments.summary.exactDateLines, 1);
  assert.equal(result.comments.summary.missingSourceDateLines, 2);
  assert.equal(result.comments.summary.partialSourceDateLines, 1);
  assert.equal(result.comments.summary.matchedLines, 3);
  assert.equal(result.comments.unmatched[0].rawReadableText, s.H3.c[0].t.split('\0')[0]);
  assert.equal(result.comments.unmatched[0].lines[0].text, '丢失内容');
});

test('unmapped cells, blank mapped fields, and extra DB fields are checked; unmatched rows do not count comments as matched', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet(); s.I3 = { t: 's', v: '附注' }; s.I3.c = [{ a: 'a', t: '未导入批注' }];
  const source = readMainSheet(s);
  const result = reconcile(source, [version({ fields: { rib_return: '是', marking: '额外', stray: 'x' } })], []);
  assert.ok(result.fieldDiffs.some(d => d.field === 'import_note'));
  assert.ok(result.fieldDiffs.some(d => d.field === 'marking'));
  assert.ok(result.fieldDiffs.some(d => d.field === 'stray'));
  assert.equal(reconcile(source, [], []).comments.summary.matchedLines, 0);
});

test('history may join source lines within one dated block; a partial substring never proves a match', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet(); s.H3.c = [{ a: 'Alice', t: '2024.1.2 新增\n轴芯打绿点\n2024.2.3 改为红点' }];
  const source = readMainSheet(s);
  const changes = [{ standard_id: 'one', field_key: 'rib_return', description: '新增 轴芯打绿点', changed_at: '2024-01-02' }, { standard_id: 'one', field_key: 'rib_return', description: '改为红点并额外修改', changed_at: '2024-02-03' }];
  const result = reconcile(source, [version()], changes);
  assert.equal(result.comments.summary.matchedLines, 2);
  assert.equal(result.comments.summary.unmatchedLines, 1);
});

test('confirmed E115 and A02 identities match independently and missing explicit project is a direct diff', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet(); s.H3.v = ''; s.G3 = { t: 's', v: '型号E115' }; s.B3.v = '客户▲';
  XLSX.utils.sheet_add_aoa(s, [['SP1', '客户▲', 'M', '', '', '', 'A02']], { origin: 'A4' });
  const source = readMainSheet(s);
  const dbRows = [version({ customer: '客户▲', vehicle_model: 'E115', fields: { marking: '型号E115' } }), version({ standard_id: 'two', customer: '客户▲', vehicle_model: 'A02', fields: { marking: 'A02' } })];
  const result = reconcile(source, dbRows, []);
  assert.equal(result.duplicateSourceIdentities.length, 0);
  assert.equal(result.summary.matchedRecords, 2);
  assert.equal(result.fieldDiffs.length, 0);
  dbRows[0].vehicle_model = '';
  assert.ok(reconcile(source, dbRows, []).fieldDiffs.some(d => d.field === 'vehicle_model'));
});

test('readable author prefix can differ from Excel metadata author', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet(); s.H3.c = [{ a: 'asus', t: 'ta-05:\n2024.8.14 新增中生' }];
  const result = reconcile(readMainSheet(s), [version()], [{ standard_id: 'one', field_key: 'rib_return', description: '新增中生', changed_at: '2024-08-14' }]);
  assert.equal(result.comments.summary.unmatchedLines, 0);
  assert.equal(result.comments.summary.matchedLines, 1);
});

test('raw archive coverage requires standard, cell, author and exact readable text; normalized history stays separate', async () => {
  const { readMainSheet, reconcile } = await audit();
  const s = sheet(); s.H3.c = [{ a: 'Alice', t: '2024.1.2 新增\n第二行\n\0corrupt' }, { a: 'Bob', t: '2024.2.3' }, { a: 'Empty', t: '\0corrupt' }];
  const source = readMainSheet(s);
  const archive = [{ id: 'a', standard_id: 'one', source_cell: 'H3', author: 'Alice', text: '2024.1.2 新增\n第二行', field_key: 'rib_return' }, { id: 'b', standard_id: 'one', source_cell: 'H3', author: 'Bob', text: '2024.2.3', field_key: 'rib_return' }];
  const result = reconcile(source, [version()], [], archive);
  assert.equal(result.rawArchiveCoverage.summary.sourceReadableComments, 2);
  assert.equal(result.rawArchiveCoverage.summary.matchedComments, 2);
  assert.equal(result.rawArchiveCoverage.summary.skippedEmptyComments, 1);
  assert.equal(result.comments.summary.matchedLines, 0);
  for (const override of [{ standard_id: 'other' }, { source_cell: 'H4' }, { author: 'Other' }, { text: '2024.1.2 新增 第二行' }]) {
    const changed = [{ ...archive[0], ...override }, archive[1]];
    assert.equal(reconcile(source, [version()], [], changed).rawArchiveCoverage.summary.missingComments, 1);
  }
  assert.equal(reconcile(source, [version()], []).rawArchiveCoverage.available, false);
  assert.equal(reconcile(source, [version()], [], [...archive, { ...archive[0], id: 'duplicate' }]).rawArchiveCoverage.summary.duplicateArchiveEntries, 1);
});
