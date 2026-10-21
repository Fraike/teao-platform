import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
Object.assign(globalThis, { HTMLBodyElement: window.HTMLBodyElement, HTMLHtmlElement: window.HTMLHtmlElement });
import { createElement, act, useEffect } from 'react';
import type { StandardPendingReviewItem, StandardPendingReviewPage } from '../src/types/standard.ts';
const { createRoot } = await import('react-dom/client');
const { StandardPendingOverview } = await import('../src/components/standard/StandardPendingOverview.tsx');
const { StandardPendingReviewDrawer } = await import('../src/components/standard/StandardPendingReviewDrawer.tsx');
const { api } = await import('../src/lib/api.ts');
const { usePendingReviewOverview } = await import('../src/lib/standardPendingReviews.ts');
const wait = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const click = async (element: Element) => act(() => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const item = (i: number): StandardPendingReviewItem => ({ taskId: `review:${i}`, id: `id-${i}`, serialNo: `SP-${i}`,
  categoryKey: 'rack_damper', categoryName: '齿条阻尼器', kind: i === 0 ? 'retirement' : 'standard',
  customer: '客户', model: `RD-${i}`, reviewerId: 'reviewer', reviewerName: '审核人乙', submittedAt: '2026-10-21T00:00:00Z' });
const page = (current = 1): StandardPendingReviewPage => ({ ok: true, data: Array.from({ length: current === 1 ? 20 : 5 }, (_, i) => item((current - 1) * 20 + i)),
  total: 25, overallTotal: 25, page: current, pageSize: 20, version: 'v1',
  categories: [{ categoryKey: 'rack_damper', categoryName: '齿条阻尼器', total: 25, standardCount: 24, retirementCount: 1 }] });

test('overview scope changes discard old requests and switching back does not reuse a missing snapshot', async () => {
  const originalGet = api.get, root = createRoot(document.getElementById('root')!);
  const pending: { signal?: AbortSignal | null; resolve: (value: unknown) => void }[] = [];
  api.get = (<T>(_url: string, options?: RequestInit) => new Promise<T>(resolve => pending.push({ signal: options?.signal, resolve: resolve as (value: unknown) => void }))) as typeof api.get;
  function Harness({ scope }: { scope: string }) {
    const state = usePendingReviewOverview(scope);
    const refresh = state.refresh;
    useEffect(() => { void refresh('v1'); }, [refresh]);
    return createElement('p', null, state.loading ? 'loading' : `${scope}:${state.data?.overallTotal}`);
  }
  try {
    await act(() => root.render(createElement(Harness, { scope: 'A' })));
    await act(() => pending[0].resolve({ ...page(), version: 'v1' }));
    assert(document.body.textContent?.includes('A:25'));
    await act(() => root.render(createElement(Harness, { scope: 'B' })));
    assert.equal(document.body.textContent, 'loading');
    await act(() => root.render(createElement(Harness, { scope: 'A' })));
    assert.equal(pending.length, 3, 'returning to A needs a new snapshot');
    assert.equal(pending[1].signal?.aborted, true);
    await act(() => pending[2].resolve({ ...page(), overallTotal: 7, version: 'v1' }));
    await act(() => pending[1].resolve({ ...page(), overallTotal: 99, version: 'v1' }));
    assert.equal(document.body.textContent, 'A:7');
  } finally { await act(() => root.unmount()); api.get = originalGet; }
});

test('compact overview identifies cross-category products and opens full list, with truthful empty/error states', async () => {
  const root = createRoot(document.getElementById('root')!);
  const opened: string[] = [], categories: (string | undefined)[] = [];
  const props = { data: { ...page(), data: page().data.slice(0, 3) }, loading: false, error: '', admin: true,
    onRetry() {}, onOpen(value: StandardPendingReviewItem) { opened.push(value.id); }, onViewAll(category?: string) { categories.push(category); } };
  try {
    await act(() => root.render(createElement(StandardPendingOverview, props)));
    const trigger = document.querySelector('button[aria-label="全部待审25项"]')!;
    assert(trigger);
    assert(!document.body.textContent?.includes('SP-0'), 'preview does not take a separate row');
    await act(() => { trigger.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); });
    await wait();
    assert(document.body.textContent?.includes('共 25 项'));
    assert(document.body.textContent?.includes('齿条阻尼器'));
    assert(document.body.textContent?.includes('审核人乙'));
    assert.equal(document.querySelectorAll('section[aria-label="跨分类待审概览"] button').length, 5);
    await click(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('SP-0'))!);
    assert.deepEqual(opened, ['id-0']);
    await click(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('齿条阻尼器') && button.textContent?.includes('25'))!);
    assert.deepEqual(categories, ['rack_damper']);
    await click(Array.from(document.querySelectorAll('button')).find(button => button.textContent === '查看全部')!);
    assert.equal(categories.length, 2);
    await act(() => root.render(createElement(StandardPendingOverview, { ...props, data: { ...page(), overallTotal: 0, total: 0, data: [], categories: [] } })));
    assert.equal(document.querySelector('button'), null, 'empty overview leaves no placeholder'); assert(!document.body.textContent?.includes('SP-0'));
    await act(() => root.render(createElement(StandardPendingOverview, { ...props, error: 'offline' })));
    assert(document.body.textContent?.includes('待审加载失败')); assert(!document.body.textContent?.includes('SP-0'));
  } finally { await act(() => root.unmount()); }
});

test('full list paginates beyond notification limit and immediately clears old-account tasks', async () => {
  const originalGet = api.get, root = createRoot(document.getElementById('root')!);
  const requests: string[] = [], opened: string[] = [];
  api.get = (async (url: string) => { requests.push(url); return page(Number(new URL(url, 'http://local').searchParams.get('page') || 1)); }) as typeof api.get;
  const props = { open: true, category: '', scope: 'first', version: 'v1', admin: true, onClose() {}, onOpen(value: StandardPendingReviewItem) { opened.push(value.id); } };
  try {
    await act(() => root.render(createElement(StandardPendingReviewDrawer, props))); await wait();
    assert.equal(document.querySelectorAll('.ant-list-item').length, 20);
    assert(document.body.textContent?.includes('全部 25 项'));
    await click(document.querySelector('.ant-pagination-next button')!); await wait();
    assert.equal(document.querySelectorAll('.ant-list-item').length, 5);
    assert(requests.some(url => new URL(url, 'http://local').searchParams.get('page') === '2'));
    await click(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('查看 / 处理'))!);
    assert.deepEqual(opened, ['id-20']);
    api.get = (() => new Promise(() => {})) as typeof api.get;
    await act(() => root.render(createElement(StandardPendingReviewDrawer, { ...props, scope: 'second' })));
    assert.equal(document.querySelectorAll('.ant-list-item').length, 0);
    assert(!document.body.textContent?.includes('SP-20'));
  } finally { await act(() => root.unmount()); api.get = originalGet; }
});
