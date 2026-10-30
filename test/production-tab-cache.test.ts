import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
// Exercise the real history hook through a cold unmount/remount using the same tab snapshot.
import './standard-frontend-dom.ts';
import { createElement, act, Activity } from 'react';
const { createRoot } = await import('react-dom/client');
const { TabPageContext } = await import('../src/lib/tabPageContext.tsx');
const { getTabPage, clearTabScope, guardTabClose } = await import('../src/lib/tabPageCache.ts');
const { useProductionHistory } = await import('../src/lib/productionHistory.ts');
const { api } = await import('../src/lib/api.ts');

for (const page of ['ProductionEntryPage', 'ProductionEntryInjectionPage', 'ProductionReportPage']) {
  test(`${page} preserves loaded state and guards activity initialization`, () => {
    const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /useTabPageAdapter\(\)/);
    assert.match(source, /useTabInitialEffect\(/);
    assert.match(source, /useTabBusy\(/);
    assert.match(source, /useTabState.*["']groups|useTabState.*["']report/);
  });
}

test('history survives cold reclamation without loading again', async () => {
  const record = getTabPage('production-test', '/production');
  let history: ReturnType<typeof useProductionHistory<{ id: number }>>;
  function Probe() { history = useProductionHistory<{ id: number }>('/api/production/entries'); return null; }
  const render = () => createElement(TabPageContext.Provider, { value: { record, active: true, restored: true, container: null } }, createElement(Probe));
  const originalGet = api.get;
  let calls = 0;
  api.get = (async () => { calls++; return { ok: true, data: [{ id: 7 }] }; }) as typeof api.get;
  let root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(render()));
    await act(async () => history!.show(7));
    assert.equal(history!.open, true);
    assert.deepEqual(history!.data, [{ id: 7 }]);
    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(render()));
    assert.equal(history!.open, true);
    assert.deepEqual(history!.data, [{ id: 7 }]);
    assert.equal(calls, 1);
  } finally {
    await act(async () => root.unmount());
    api.get = originalGet;
    clearTabScope('production-test');
  }
});

for (const name of ['ProductionEntryPage', 'ProductionEntryInjectionPage']) {
  test(`${name} cold restoration keeps submitted filters, rows and offset without querying`, async () => {
    const module = await import(`../src/pages/${name}.tsx`);
    const Page = module[name];
    const scope = `production-cold-${name}`;
    const record = getTabPage(scope, '/production');
    const originalGet = api.get;
    let queries = 0;
    api.get = (async (url: string) => {
      if (/entries\?/.test(url)) { queries++; return { ok: true, data: { groups: [], total: 0, hasMore: false } }; }
      return { ok: true, data: [] };
    }) as typeof api.get;
    let root = createRoot(document.getElementById('root')!);
    const render = () => createElement(TabPageContext.Provider, { value: { record, active: true, restored: true, container: document.getElementById('root') } }, createElement(Page));
    try {
      await act(async () => root.render(render()));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
      assert.equal(queries, 1);
      assert.equal(record.snapshot.get('loadedQuery') !== null, true);
      assert.equal((record.snapshot.get('offsetBox') as { current: number }).current > 0, true);
      await act(async () => root.unmount());
      root = createRoot(document.getElementById('root')!);
      await act(async () => root.render(render()));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.equal(queries, 1, 'restoration must not reissue the submitted search');
    } finally {
      await act(async () => root.unmount());
      api.get = originalGet;
      clearTabScope(scope);
    }
  });
}

test('assembly entry form keeps unsaved remark after cold restoration', async () => {
  const { EntryDrawer } = await import('../src/components/production/EntryDrawer.tsx');
  const scope = 'production-draft-test';
  const record = getTabPage(scope, '/production');
  const originalGet = api.get;
  api.get = (async () => ({ ok: true, data: [] })) as typeof api.get;
  let root = createRoot(document.getElementById('root')!);
  const render = () => createElement(TabPageContext.Provider, { value: { record, active: true, restored: true, container: document.getElementById('root') } }, createElement(EntryDrawer, { open: true, record: null, copyFrom: null, defaultDate: '2026-10-27', onClose: () => {} }));
  try {
    await act(async () => root.render(render()));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    const remark = document.querySelector<HTMLTextAreaElement>('textarea#remark')!;
    assert.ok(remark);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(remark, '尚未保存的备注');
      remark.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.equal((record.snapshot.get('form:assembly.entry') as { remark: string }).remark, '尚未保存的备注');
    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(render()));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.equal(document.querySelector<HTMLTextAreaElement>('textarea#remark')!.value, '尚未保存的备注');
  } finally {
    await act(async () => root.unmount());
    api.get = originalGet;
    clearTabScope(scope);
  }
});



for (const name of ['ProductionEntryPage', 'ProductionEntryInjectionPage']) {
  test(`${name} Activity hide lets load-more finish and releases busy guard`, async () => {
    const module = await import(`../src/pages/${name}.tsx`);
    const Page = module[name];
    const scope = `production-warm-${name}`;
    const record = getTabPage(scope, '/production');
    const originalGet = api.get;
    const summary = { lines: 0, machines: 0, totalOrderQty: 0, totalPlanQty: 0, totalDailyQty: 0, totalCumulativeQty: 0, totalDefects: 0, achievementRate: null, qualifiedRate: null, totalBackorder: 0 };
    const group = { date: '2026-10-27', records: [], summary };
    let requests = 0;
    let pending: { signal?: AbortSignal | null; resolve: (value: unknown) => void } | undefined;
    api.get = (async (url: string, options?: RequestInit) => {
      if (!/entries\?/.test(url)) return { ok: true, data: [] };
      requests++;
      if (requests === 1) return { ok: true, data: { groups: [group], total: 100, hasMore: true } };
      return new Promise(resolve => { pending = { signal: options?.signal, resolve }; });
    }) as typeof api.get;
    const root = createRoot(document.getElementById('root')!);
    const render = async (active: boolean) => {
      record.active = active;
      await act(async () => root.render(createElement(TabPageContext.Provider, { value: { record, instance: record.instance, active, restored: false, container: document.getElementById('root') } }, createElement(Activity, { mode: active ? 'visible' : 'hidden' }, createElement(Page)))));
    };
    try {
      await render(true);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      const more = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('加载更多'))!;
      assert.ok(more);
      await act(async () => more.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
      assert.equal(await guardTabClose(scope, ['/production'], () => true), false);
      await render(false);
      assert.equal(pending!.signal?.aborted, false, 'Activity hide must preserve the in-flight read');
      await act(async () => pending!.resolve({ ok: true, data: { groups: [{ ...group, date: '2026-10-26' }], total: 100, hasMore: false } }));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      assert.equal(record.snapshot.get('loading'), false);
      assert.equal(await guardTabClose(scope, ['/production'], () => true), true, 'hidden completion must release busy');
      await render(true);
      assert.equal(requests, 2, 'returning to the page must not reload');
      assert.equal((record.snapshot.get('groups') as unknown[]).length, 2);
    } finally {
      await act(async () => root.unmount());
      api.get = originalGet;
      clearTabScope(scope);
    }
  });
}
after(() => window.close());
