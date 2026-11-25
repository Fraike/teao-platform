import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessmentSubmission, blankAllocation } from '../src/lib/engineeringChange.ts';
import { materialDefaultWarehouse, workInProgressScope } from '../server/shared/engineering-change-content.ts';

test('assessment sends one shared manual time and retains the individual Kingdee time and location', () => {
  const manual = '2026-11-24T01:00:00.000Z';
  const kingdee = '2026-11-24T02:00:00.000Z';
  const result = assessmentSubmission({ materials: [], noImpact: false, note: '', manualCheckedAt: manual, lines: [
    { ...blankAllocation('m1'), warehouseScope: workInProgressScope, stock: '8', wip: '3', scrap: '9' },
    { ...blankAllocation('m2'), warehouseScope: '半成品仓', warehouse: '二仓 / A01', checkedAt: kingdee, stock: '10', wip: '4' },
    { ...blankAllocation('m3'), warehouseScope: '成品仓', batch: 'A', originalWarehouse: '三仓',
      warehouse: '三仓', legacyMixed: true, stock: '5', wip: '2', needsScrap: true, scrap: '3' },
  ] });
  assert.deepEqual(result.lines.map(row => [row.stock, row.wip, row.scrap, row.checkedAt]), [
    ['0', '3', '0', manual], ['10', '0', '0', kingdee], ['5', '2', '3', manual],
  ]);
  assert.equal(result.lines[1].warehouse, '二仓 / A01');
  assert.equal(result.lines[2].warehouse, '三仓');
  assert.equal(result.lines[2].batch, 'A');
});

test('only product and semi-finished default warehouse names label material search results', () => {
  assert.equal(materialDefaultWarehouse('成品仓'), '成品仓');
  assert.equal(materialDefaultWarehouse(' 半成品仓 '), '半成品仓');
  assert.equal(materialDefaultWarehouse('原料仓'), undefined);
  assert.equal(materialDefaultWarehouse(''), undefined);
});
