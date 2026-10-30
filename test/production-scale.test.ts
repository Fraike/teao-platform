import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../src/lib/api.ts';
import type { ProductionRecord, DailyGroup } from '../src/types/production.ts';

// Execute each page's actual save callback with isolated network/state dependencies.
async function saveOnPage(page: string, groups: DailyGroup[], record: ProductionRecord) {
  const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
  const start = source.indexOf('const cellSave = useCallback(');
  const end = source.indexOf('\n  },', start) + '\n  }'.length;
  const callback = source.slice(start + 'const cellSave = useCallback('.length, end);
  const compiled = ts.transpileModule(`const save = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const entry = await import('../src/lib/productionEntry.ts');
  const { createProductionSaveQueue } = await import('../src/lib/productionSaveQueue.ts');
  let result = groups;
  const dependencies: Record<string, unknown> = {
    saveQueue: createProductionSaveQueue(),
    setPendingWrites: () => {},
    api: { put: async () => ({ ok: true, data: record }) },
    historyCacheRef: { current: new Map() }, invalidateHistory: () => {},
    setGroups: (update: (current: DailyGroup[]) => DailyGroup[]) => { result = update(result); },
    message: { error: (error: string) => { throw Error(error); } }, ...entry,
  };
  Object.assign(dependencies, await import('../src/lib/productionGroups.ts'));
  const save = new Function(...Object.keys(dependencies), `${compiled}; return save;`)(...Object.values(dependencies));
  await save(groups[0].records[0], 'dailyQty', 60);
  return result;
}

test('assembly save keeps authoritative derived fields and recomputes only the owning group', async () => {
  const original = { id: 1, date: '2026-10-14', line: '1#', dailyQty: 10, planQty: 100, orderQty: 80, cumulativeQty: 10, defects: 1 } as ProductionRecord;
  const sibling = { ...original, id: 2, dailyQty: 20, defects: 2 };
  const groups = [{ date: original.date, records: [original, sibling], summary: {} }, { date: '2026-10-13', records: [{ ...original, id: 3 }], summary: {} }] as DailyGroup[];
  const response = { ...original, dailyQty: 60, cumulativeQty: 90, achievementRate: .6, qualifiedRate: 59 / 60, ppm: 11111, backorder: -10, updatedBy: 'server' };
  const next = await saveOnPage('ProductionEntryPage', groups, response);
  assert.strictEqual(next[0].records[0], response);
  assert.strictEqual(next[0].records[1], sibling);
  assert.strictEqual(next[1], groups[1]);
  assert.deepEqual(next[0].summary, { lines: 1, totalOrderQty: 160, totalPlanQty: 200, totalDailyQty: 80, totalCumulativeQty: 100, totalDefects: 3, achievementRate: .4, qualifiedRate: 77 / 80, totalBackorder: 60 });
});

test('history hook isolates stale success/finally/error, cached loading, close and unmount', async () => {
  const { useProductionHistory } = await import('../src/lib/productionHistory.ts');
  let history: ReturnType<typeof useProductionHistory<string>>;
  function Harness() { history = useProductionHistory<string>('/history'); return null; }
  const pending: { signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const originalGet = api.get;
  api.get = ((_url: string, options: RequestInit) => new Promise((resolve, reject) => pending.push({ signal: options.signal!, resolve, reject }))) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(() => root.render(createElement(Harness)));
    await act(() => { void history!.show(1); });
    await act(() => { void history!.show(2); });
    assert.equal(pending[0].signal.aborted, true);
    await act(async () => pending[0].resolve({ ok: true, data: ['old'] }));
    assert.deepEqual(history!.data, []); assert.equal(history!.loading, true);
    await act(async () => pending[1].resolve({ ok: true, data: ['two'] }));
    assert.deepEqual(history!.data, ['two']);
    await act(() => { void history!.show(3); });
    await act(() => history!.show(2));
    assert.equal(history!.loading, false); assert.deepEqual(history!.data, ['two']);
    assert.equal(pending[2].signal.aborted, true);
    await act(async () => pending[2].reject(Error('stale failure')));
    assert.deepEqual(history!.data, ['two']);
    await act(() => { void history!.show(4); });
    await act(() => history!.close());
    assert.equal(pending[3].signal.aborted, true); assert.equal(history!.open, false); assert.equal(history!.loading, false);
    await act(async () => pending[3].resolve({ ok: true, data: ['closed'] }));
    assert.deepEqual(history!.data, []);
    await act(() => { void history!.show(5); });
    await act(() => history!.invalidate());
    assert.equal(pending[4].signal.aborted, true);
    await act(async () => pending[4].resolve({ ok: true, data: ['invalidated'] }));
    assert.deepEqual(history!.data, []);
    await act(() => { void history!.show(5); });
    assert.equal(pending.length, 6, 'invalidated response must not repopulate cache');
    await act(() => root.unmount());
    assert.equal(pending[5].signal.aborted, true);
    await act(async () => pending[5].resolve({ ok: true, data: ['unmounted'] }));
  } finally { api.get = originalGet; }
});

test('history expires after five minutes, bounds cache at 100, invalidates writes/refresh', async () => {
  const { useProductionHistory } = await import('../src/lib/productionHistory.ts');
  let history: ReturnType<typeof useProductionHistory<number>>;
  function Harness() { history = useProductionHistory<number>('/history'); return null; }
  const originalGet = api.get, originalNow = Date.now;
  let now = 1000, calls = 0;
  Date.now = () => now;
  api.get = (async () => ({ ok: true, data: [++calls] })) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(() => root.render(createElement(Harness)));
    await act(() => history!.show(1));
    now += 299999;
    await act(() => history!.show(1)); assert.equal(calls, 1);
    now++;
    await act(() => history!.show(1)); assert.equal(calls, 2);
    await act(() => history!.invalidate(1));
    await act(() => history!.show(1)); assert.equal(calls, 3);
    await act(() => history!.invalidate());
    await act(() => history!.show(1)); assert.equal(calls, 4);
    for (let id = 2; id <= 101; id++) await act(() => history!.show(id));
    await act(() => history!.show(101)); assert.equal(calls, 104);
    await act(() => history!.show(1)); assert.equal(calls, 105, 'oldest entry must be evicted');
  } finally { await act(() => root.unmount()); api.get = originalGet; Date.now = originalNow; }
});


test('injection save preserves other groups and authoritative record', async () => {
  const original = { id: 1, date: '2026-10-14', machine: '1#', orderQty: 100, dailyQty: 10, cumulativeQty: 20, defects: 1 };
  const groups = [{ date: original.date, records: [original], summary: {} }, { date: '2026-10-13', records: [{ ...original, id: 2 }], summary: {} }];
  const response = { ...original, dailyQty: 60, cumulativeQty: 120, qualifiedRate: 59 / 60, backorder: -20, updatedBy: 'server' };
  const next = await saveOnPage('ProductionEntryInjectionPage', groups as unknown as DailyGroup[], response as unknown as ProductionRecord);
  assert.strictEqual(next[0].records[0], response);
  assert.strictEqual(next[1], groups[1]);
  assert.deepEqual(next[0].summary, { machines: 1, totalOrderQty: 100, totalDailyQty: 60, totalCumulativeQty: 120, totalDefects: 1, qualifiedRate: 59 / 60, totalBackorder: -20 });
});

test('summary keeps zero denominators null and negative backorder without changing math', async () => {
  const { buildAssemblySummary } = await import('../src/lib/productionGroups.ts');
  const summary = buildAssemblySummary([{ line: '1#', orderQty: 10, planQty: 0, dailyQty: 0, cumulativeQty: 20, defects: 2 } as ProductionRecord]);
  assert.equal(summary.achievementRate, null); assert.equal(summary.qualifiedRate, null); assert.equal(summary.totalBackorder, -10);
});

test('date table caches sorting, preserves record identities, id keys, pagination and sticky header', async () => {
  const { ProductionDateTable } = await import('../src/components/productionDateTable.tsx');
  const records = Array.from({ length: 55 }, (_, index) => ({ id: index + 1, orderQty: index + 1 }));
  let renders = 0, sortIterations = 0;
  const trackedRecords = new Proxy(records, { get(target, key, receiver) {
    if (key === Symbol.iterator) sortIterations++;
    return Reflect.get(target, key, receiver);
  } });
  const columns = [{ title: 'Quantity', dataIndex: 'orderQty', render: (value: number, record: typeof records[number]) => {
    renders++; assert.strictEqual(record, records[record.id - 1]); return String(value);
  } }];
  const sticky = { offsetHeader: 0, getContainer: () => document.getElementById('root')! };
  const root = createRoot(document.getElementById('root')!);
  const props = { records: trackedRecords, columns, orderQtySort: 'desc' as const, sticky, minWidth: 1000 };
  try {
    await act(async () => root.render(createElement(ProductionDateTable, props)));
    assert.equal(document.querySelector('tr[data-row-key]')?.getAttribute('data-row-key'), '55');
    assert.equal(document.querySelectorAll('tr[data-row-key]').length, 50);
    assert.ok(document.querySelector('.ant-table-pagination'));
    assert.ok(document.querySelector('.ant-table-sticky-holder'));
    assert.equal(document.querySelector('[role="scrollbar"]'), null);
    assert.equal(sortIterations, 1);
    const before = renders;
    await act(async () => root.render(createElement(ProductionDateTable, props)));
    assert.equal(renders, before, 'unrelated parent update must not render date table');
    await act(async () => root.render(createElement(ProductionDateTable, { ...props, sticky: { ...sticky } })));
    assert.equal(sortIterations, 1, 'table prop update must reuse sorted records');
    await act(async () => root.render(createElement(ProductionDateTable, { ...props, orderQtySort: 'asc' })));
    assert.equal(sortIterations, 2);
    assert.equal(document.querySelector('tr[data-row-key]')?.getAttribute('data-row-key'), '1');
    assert.deepEqual(records.map(r => r.id), Array.from({ length: 55 }, (_, i) => i + 1));
  } finally { await act(async () => root.unmount()); }
});
