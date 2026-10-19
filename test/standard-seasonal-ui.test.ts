import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../src/lib/api.ts';
import { clearStandardQueryCache } from '../src/lib/standardQueryCache.ts';
import { StandardFormModal } from '../src/components/standard/StandardFormModal.tsx';
import { StandardDetailDrawer } from '../src/components/standard/StandardDetailDrawer.tsx';
import { StandardHistoryDrawer } from '../src/components/standard/StandardHistoryDrawer.tsx';
import { SeasonalTestStandard } from '../src/components/standard/SeasonalTestStandard.tsx';
import { StandardTestHistory } from '../src/components/standard/StandardTestHistory.tsx';
import { ProductStandardPage } from '../src/pages/ProductStandardPage.tsx';
import type { StandardCategory, StandardDetail, StandardVersion } from '../src/types/standard.ts';
const { createRoot } = await import('react-dom/client');
Object.assign(globalThis, { HTMLBodyElement: window.HTMLBodyElement });
const categories: StandardCategory[] = [{ key: 'gear_damper', name: '齿轮阻尼器', fields: [
  { key: 'test_standard', label: '测试标准' },
] }];
const version: StandardVersion = {
  id: 'v2', revision: 2, versionNo: 2, serialNo: 'SP0006-C', categoryKey: 'gear_damper', categoryName: '齿轮阻尼器',
  customer: '客户', model: 'RD', customerPartNo: '2010.0431.0805', vehicleModel: '', standardType: 'formal', status: 'published',
  fields: { test_standard: '120-160', winter_test_standard: '100-140' },
  assignedReviewerId: '', assignedReviewerName: '', createdById: '', updatedById: '', submittedById: '', submittedBy: '',
  submittedAt: '', reviewedById: '', reviewComment: '', createdBy: 'Mike', createdAt: '', updatedAt: '', updatedBy: '', reviewedBy: '', reviewedAt: '', publishedAt: '',
};
const detail: StandardDetail = { id: 's1', serialNo: 'SP0006-C', categoryKey: 'gear_damper', categoryName: '齿轮阻尼器', standardType: 'formal', versions: [version], changes: [] };
const wait = (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const click = (element: Element) => act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const findText = (selector: string, text: string) => [...document.querySelectorAll(selector)].find(node => node.textContent?.includes(text));
const setText = (input: HTMLTextAreaElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

test('main table keeps both seasons in one column and does not prefetch history', async () => {
  clearStandardQueryCache();
  const originalGet = api.get;
  const requests: string[] = [];
  api.get = (async (url: string) => {
    requests.push(url);
    return url.endsWith('categories') ? { ok: true, data: categories } : {
      ok: true, data: [{ ...version, id: 's1', hasPending: false }], total: 1, version: 'r1', page: 1, pageSize: null,
    };
  }) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(ProductStandardPage))));
    await wait(60);
    const row = document.querySelector('.ant-table-row')!;
    const cell = [...row.querySelectorAll('td')].find(node => node.textContent?.includes('120-160'))!;
    assert.match(cell.textContent!, /^120-160/);
    assert.match(cell.textContent!, /冬季.*100-140/);
    assert.equal(cell.querySelector('[aria-label="夏季"]'), null);
    assert.equal(cell.textContent?.includes('夏季'), false);
    assert.ok(cell.querySelector('[aria-label="冬季"] svg'));
    assert.equal([...document.querySelectorAll('th')].some(node => node.textContent?.includes('冬季')), false);
    assert.equal(requests.some(url => url.includes('/history')), false);
  } finally { await act(() => root.unmount()); api.get = originalGet; clearStandardQueryCache(); }
});

test('form defaults to summer and supports copying and clearing optional winter without changing summer', async () => {
  const originalPost = api.post;
  const saved: { fields: Record<string, string> }[] = [];
  api.post = (async (_url: string, payload: { fields: Record<string, string> }) => { saved.push(payload); return { ok: true, data: detail }; }) as typeof api.post;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(StandardFormModal, { open: true, categories, initial: null, copySource: detail, onClose() {}, onSaved() {} })));
    const summerLabel = findText('label', '夏季／常规测试标准');
    const winterLabel = findText('label', '冬季测试标准（选填）');
    assert.ok(summerLabel, 'summer must remain the ordinary default input');
    assert.ok(winterLabel, 'winter is optional without a season selector');
    const winter = document.getElementById(winterLabel.getAttribute('for')!) as HTMLTextAreaElement;
    assert.equal(winter.value, '100-140');
    await setText(winter, '');
    await click(findText('button', '保存')!); await wait(60);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].fields.test_standard, '120-160');
    assert.equal(saved[0].fields.winter_test_standard, '');
  } finally { await act(() => root.unmount()); api.post = originalPost; }
});

test('detail combines seasons and lazily pages complete filtered test changes and source originals independently', async () => {
  const originalGet = api.get;
  const requests: string[] = [];
  api.get = (async (url: string) => {
    requests.push(url);
    if (url.includes('/history')) {
      const params = new URL(url, 'http://localhost').searchParams;
      assert.equal(params.get('fieldKey'), 'test_standard');
      const page = Number(params.get('page'));
      const pageSize = Number(params.get('pageSize'));
      return { total: 41, page, pageSize, data: params.get('section') === 'changes'
        ? [{ id: `c${page}`, fieldKey: 'winter_test_standard', fieldLabel: '冬季测试标准', description: `冬季变更第${page}页\n保留正文`, changedAt: '', author: '工程' }]
        : [{ id: 'source', fieldKey: 'test_standard', fieldLabel: '测试范围', sourceCell: 'F487', author: '原作者', text: '原始批注\n2010.0431.0805', sourceHash: 'hash' }] };
    }
    return url.endsWith('reviewers') ? { ok: true, data: [] } : { ok: true, data: detail };
  }) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(StandardDetailDrawer, { open: true, standardId: 's1', categories, canEdit: false, canReview: false, onClose() {}, onChanged() {}, onEdit() {} })));
    await wait();
    assert.equal(requests.filter(url => url.includes('/history')).length, 0);
    assert.match(document.body.textContent!, /冬季.*100-140/);
    await click(findText('.ant-collapse-header', '测试标准变更')!); await wait();
    assert.match(document.body.textContent!, /冬季变更第1页/);
    assert.equal(requests.filter(url => url.includes('section=comments')).length, 0);
    await click(document.querySelector('.ant-pagination-next button')!); await wait();
    assert.match(document.body.textContent!, /冬季变更第2页/);
    await click(findText('.ant-collapse-header', '测试标准原始批注')!); await wait();
    assert.match(document.body.textContent!, /F487/);
    assert.match(document.body.textContent!, /原始批注\s*2010.0431.0805/);
    assert.ok(requests.some(url => url.includes('section=comments') && url.includes('page=1')));
  } finally { await act(() => root.unmount()); api.get = originalGet; }
});

test('historical versions combine seasons once and never borrow winter from the current version', async () => {
  clearStandardQueryCache();
  const originalGet = api.get;
  api.get = (async (url: string) => {
    if (url.endsWith('categories')) return { ok: true, data: categories };
    if (!url.includes('/history')) return { ok: true, data: detail };
    const params = new URL(url, 'http://localhost').searchParams;
    return { page: 1, pageSize: 20, total: params.get('section') === 'versions' ? 2 : 0, data: params.get('section') === 'versions'
      ? [version, { ...version, id: 'v1', versionNo: 1, fields: { test_standard: '110-150' } }] : [] };
  }) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(StandardHistoryDrawer, { open: true, standardId: 's1', onClose() {} })));
    await wait();
    await click(findText('.ant-collapse-header', '查看 V2 完整参数')!);
    await click(findText('.ant-collapse-header', '查看 V1 完整参数')!);
    const panels = [...document.querySelectorAll('.ant-collapse-content')];
    const current = panels.find(node => node.textContent?.includes('120-160'))!;
    const historical = panels.find(node => node.textContent?.includes('110-150'))!;
    assert.match(current.textContent!, /120-160.*冬季.*100-140/);
    assert.equal(current.querySelectorAll('[aria-label="冬季"]').length, 1);
    assert.match(historical.textContent!, /110-150/);
    assert.equal(historical.textContent?.includes('夏季'), false);
    assert.equal(historical.textContent?.includes('冬季'), false);
  } finally { await act(() => root.unmount()); api.get = originalGet; clearStandardQueryCache(); }
});

test('season display preserves missing summer, hides empty winter and never invents a winter requirement', async () => {
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(() => root.render(createElement(SeasonalTestStandard, { summer: '', winter: '100-140' })));
    assert.match(document.body.textContent!, /^—冬季 100-140/);
    await act(() => root.render(createElement(SeasonalTestStandard, { summer: '120-160', winter: '  ' })));
    assert.equal(document.body.textContent, '120-160');
    assert.equal(document.querySelector('[aria-label="冬季"]'), null);
  } finally { await act(() => root.unmount()); }
});

test('switching a copied product to a category without seasonal tests drops the copied test fields', async () => {
  const originalPost = api.post;
  const saved: { fields: Record<string, string> }[] = [];
  api.post = (async (_url: string, payload: { fields: Record<string, string> }) => { saved.push(payload); return { ok: true, data: detail }; }) as typeof api.post;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(StandardFormModal, { open: true, categories: [...categories,
      { key: 'dedicated', name: '专用测试', fields: [{ key: 'dedicated_test', label: '专用测试参数' }] }], initial: null, copySource: detail, onClose() {}, onSaved() {} })));
    await act(async () => document.querySelector('.ant-select-selector')!.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
    await click(findText('.ant-select-item-option', '专用测试')!);
    assert.equal(findText('label', '冬季'), undefined);
    await click(findText('button', '保存')!); await wait(60);
    assert.equal(saved.length, 1);
    assert.equal(Object.hasOwn(saved[0].fields, 'test_standard'), false);
    assert.equal(Object.hasOwn(saved[0].fields, 'winter_test_standard'), false);
  } finally { await act(() => root.unmount()); api.post = originalPost; }
});

test('test history retries visible errors, cancels old product requests and keeps source pagination independent', async () => {
  const originalGet = api.get;
  const pending: { url: string; signal?: AbortSignal | null; resolve: (value: unknown) => void; reject: (reason: Error) => void }[] = [];
  api.get = (<T>(url: string, options?: RequestInit) => new Promise<T>((resolve, reject) => pending.push({ url, signal: options?.signal, resolve: resolve as (value: unknown) => void, reject }))) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  const render = (standardId: string) => act(async () => root.render(createElement(StandardTestHistory, { standardId })));
  try {
    await render('s1');
    assert.equal(pending.length, 0);
    await click(findText('.ant-collapse-header', '测试标准变更')!);
    assert.equal(pending.length, 1);
    await act(async () => pending[0].reject(new Error('历史暂不可用')));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /历史暂不可用/);
    await click(findText('.ant-collapse-header', '测试标准变更')!);
    await click(findText('.ant-collapse-header', '测试标准变更')!);
    assert.equal(pending.length, 2, 'reopening the section retries the failed request');
    await render('s2');
    assert.equal(pending[1].signal?.aborted, true);
    assert.equal(document.querySelector('[role="alert"]'), null);
    await click(findText('.ant-collapse-header', '测试标准原始批注')!);
    assert.match(pending[2].url, /\/s2\/history\?/);
    await act(async () => pending[2].resolve({ page: 1, pageSize: 10, total: 11, data: [{ id: 'c', sourceCell: 'F487', text: '原文第一页' }] }));
    await click(document.querySelector('.ant-pagination-next button')!);
    const query = new URL(pending[3].url, 'http://localhost').searchParams;
    assert.equal(query.get('section'), 'comments');
    assert.equal(query.get('fieldKey'), 'test_standard');
    assert.equal(query.get('page'), '2');
    assert.equal(query.get('pageSize'), '10');
    await act(async () => pending[3].resolve({ page: 2, pageSize: 10, total: 11, data: [{ id: 'd', sourceCell: 'F488', text: '原文第二页' }] }));
    await act(async () => pending[1].resolve({ page: 1, pageSize: 20, total: 1, data: [{ id: 'stale', description: '旧产品数据' }] }));
    assert.match(document.body.textContent!, /原文第二页/);
    assert.equal(document.body.textContent?.includes('旧产品数据'), false);
    await click(findText('.ant-collapse-header', '测试标准变更')!);
    assert.equal(new URL(pending[4].url, 'http://localhost').searchParams.get('page'), '1');
    await act(async () => pending[4].resolve({ page: 1, pageSize: 20, total: 0, data: [] }));
    assert.match(document.body.textContent!, /无测试标准变更/);
  } finally { await act(() => root.unmount()); api.get = originalGet; }
});
