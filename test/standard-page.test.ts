import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
Object.assign(globalThis, { HTMLBodyElement: window.HTMLBodyElement, HTMLHtmlElement: window.HTMLHtmlElement });
import { createElement, act } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { StandardListItem } from '../src/types/standard.ts';
const { createRoot } = await import('react-dom/client');
const { ProductStandardPage } = await import('../src/pages/ProductStandardPage.tsx');
const { api } = await import('../src/lib/api.ts');
const { useAuthStore } = await import('../src/lib/authStore.ts');
const { message } = await import('antd');
const { clearStandardQueryCache } = await import('../src/lib/standardQueryCache.ts');
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const categories = [{ key: 'gear_damper', name: '齿轮阻尼器', fields: [{ key: 'torque', label: '扭矩' }] }];
const item = (id: string, customer: string): StandardListItem => ({
  id, serialNo: `SN-${id}`, categoryKey: 'gear_damper', categoryName: '齿轮阻尼器', standardType: 'formal',
  status: 'published', versionNo: 1, customer, model: 'M1', customerPartNo: 'CP1', vehicleModel: 'V1',
  fields: { torque: '2N' }, hasPending: false, updatedAt: '2026-10-13T00:00:00Z', updatedBy: 'Mike', reviewComment: '',
});
const setInput = async (input: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const click = async (element: Element) => act(() => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const rows = () => Array.from(document.querySelectorAll('.ant-table-row')).map(row => row.textContent);

test('server filters preserve IME/focus, cancel old requests and skip fresh background downloads', async () => {
  clearStandardQueryCache();
  const originalGet = api.get, originalError = message.error, originalNow = Date.now;
  const errors: unknown[] = [];
  message.error = ((error: unknown) => { errors.push(error); }) as typeof message.error;
  const pending: { url: string; signal?: AbortSignal | null; resolve: (data: unknown) => void }[] = [];
  api.get = (<T>(url: string, options?: RequestInit) => new Promise<T>(resolve => pending.push({ url, signal: options?.signal, resolve: resolve as (data: unknown) => void }))) as typeof api.get;
  const resolveList = async (offset: number, data: StandardListItem[]) => act(async () => {
    pending[offset].resolve({ ok: true, data, total: data.length, page: 1, pageSize: 50, version: "v1", updatedAt: '2026-10-13T00:00:00Z' });
  });
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(ProductStandardPage))));
    await wait(10);
    assert.equal(pending[0].url, '/api/standards/categories');
    const query = new URL(pending[1].url, 'http://local').searchParams;
    assert.equal(query.get('all'), 'true'); assert.equal(query.has('pageSize'), false); assert.equal(query.get('category'), 'gear_damper');
    await act(async () => pending[0].resolve({ ok: true, data: categories }));
    await resolveList(1, [item('1', 'Alpha'), item('2', 'Beta')]);
    await click(document.querySelector('.ant-table-filter-trigger')!); await wait(30);
    const input = document.querySelector<HTMLInputElement>('input[placeholder="筛选客户名"]')!;
    assert.equal(document.activeElement === input, true, 'opening the column filter must focus its input'); await setInput(input, 'no match');
    assert.equal(rows().length, 2); await wait(220); await wait(10);
    assert.equal(new URL(pending[2].url, 'http://local').searchParams.get('customer'), 'no match');
    await resolveList(2, []);
    assert.equal(rows().length, 0); assert.equal(document.querySelector('input[placeholder="筛选客户名"]'), input);
    await act(() => input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })));
    await setInput(input, 'Alpha'); await wait(220); assert.equal(pending.length, 3);
    await act(() => input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true, data: 'Alpha' })));
    await wait(220); await wait(10); await resolveList(3, [item('alpha', 'Alpha')]); assert.equal(document.activeElement, input);
    const refresh = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('刷新'))!;
    await click(refresh); await setInput(input, "Alpha latest"); await wait(220); await wait(10);
    assert.equal(pending.length, 7, 'concurrent category reloads must coalesce');
    assert.equal(pending[5].signal?.aborted, true, 'superseded list request must cancel');
    await act(async () => pending[4].resolve({ ok: true, data: [...categories] }));
    await resolveList(6, [item('new', 'Alpha latest')]); await resolveList(5, [item('old', 'Alpha old')]);
    assert.ok(rows()[0]?.includes('SN-new')); assert.equal(document.activeElement, input);
    await act(() => { window.dispatchEvent(new window.Event('focus')); document.dispatchEvent(new window.Event('visibilitychange')); });
    await wait(70); assert.equal(pending.length, 7, 'fresh list must not download on focus');
    Date.now = () => originalNow() + 31_000;
    await act(() => window.dispatchEvent(new window.Event('focus'))); await wait(70);
    assert.equal(pending[7].url, '/api/standards/version');
    await act(async () => pending[7].resolve({ ok: true, version: 'v1' }));
    assert.equal(pending.length, 8, 'unchanged collection must not reload full list');
    assert.deepEqual(errors, []);
    await act(() => root.unmount());
    await act(() => window.dispatchEvent(new window.Event('focus'))); await wait(70); assert.equal(pending.length, 8);
  } finally {
    await act(() => root.unmount()); api.get = originalGet; message.error = originalError; Date.now = originalNow; clearStandardQueryCache();
  }
});

test('import entry is removed and retirement is restricted to reviewers and admins', async () => {
  clearStandardQueryCache();
  const originalGet = api.get;
  api.get = (async (url: string) => ({ ok: true, data: url.endsWith('categories') ? categories : [item('retire', '客户')] })) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    for (const [role, permissions, allowed] of [['user', ['engineering_submit'], false], ['user', ['engineering_review'], false], ['admin', [], true]] as const) {
      await act(() => useAuthStore.setState({ user: { id: role + permissions.join(''), name: '测试', role, permissions: [...permissions] } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']> }));
      await act(async () => root.render(createElement(MemoryRouter, null, createElement(ProductStandardPage))));
      await wait(10);
      assert.equal(document.body.textContent?.includes('初始化导入'), false);
      assert.equal(Boolean(document.querySelector('button[aria-label="停用标准 SN-retire"]')), allowed);
    }
  } finally {
    await act(() => root.unmount()); api.get = originalGet; await act(() => useAuthStore.setState({ user: null }));
  }
});


test('URL status/category changes select the latest route without stale parameter writes', async () => {
  clearStandardQueryCache();
  const originalGet = api.get;
  const routeCategories = [...categories, { key: 'air_pull_cord', name: '拉绳阻尼器', fields: [] }];
  const routeItems: StandardListItem[] = [item('gear-published', 'Alpha'),
    { ...item('gear-draft', 'Alpha'), status: 'draft' },
    { ...item('air-draft', 'Alpha'), categoryKey: 'air_pull_cord', categoryName: '拉绳阻尼器', status: 'draft' }];
  api.get = (async (url: string) => {
    if (url.endsWith('categories')) return { ok: true, data: routeCategories };
    const params = new URL(url, 'http://local').searchParams;
    const data = routeItems.filter(item => item.categoryKey === params.get('category') && (!params.has('status') || item.status === params.get('status')));
    return { ok: true, data, total: data.length, version: 'v1' };
  }) as typeof api.get;
  let navigate: ReturnType<typeof useNavigate>;
  function RouteControl() { navigate = useNavigate(); return null; }
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/?status=draft&category=air_pull_cord'] },
      createElement(RouteControl), createElement(ProductStandardPage))));
    await wait(80);
    assert.equal(rows().length, 1);
    assert.ok(rows()[0]?.includes('SN-air-draft'));
    await act(async () => { await navigate!('/?status=published&category=gear_damper'); });
    await wait(80);
    assert.equal(rows().length, 1);
    assert.ok(rows()[0]?.includes('SN-gear-published'));
    await act(async () => {
      void navigate!('/?status=draft&category=air_pull_cord');
      await navigate!('/?status=draft&category=gear_damper');
    });
    await wait(80);
    assert.equal(rows().length, 1);
    assert.ok(rows()[0]?.includes('SN-gear-draft'), 'rapid routing must retain the newest URL values');
  } finally {
    await act(() => root.unmount()); api.get = originalGet;
  }
});


test('page exposes notes, uses native scrolling and toggles a single highlighted row', async () => {
  clearStandardQueryCache();
  const originalGet = api.get;
  api.get = (async (url: string) => ({ ok: true, data: url.endsWith('categories') ? categories : url.startsWith('/api/standards?') ? [item('1', 'Alpha'), item('2', 'Beta')] : null })) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(ProductStandardPage))));
    await wait(10);
    assert.ok(document.body.textContent?.includes('上次刷新：'));
    assert.ok(document.body.textContent?.includes('20转/分钟'));
    assert.equal(document.querySelector('[aria-label="表格横向滚动"]'), null);
    let [first, second] = Array.from(document.querySelectorAll('.ant-table-row'));
    await click(first);
    assert.equal(first.getAttribute('aria-selected'), 'true');
    await click(second);
    assert.equal(first.getAttribute('aria-selected'), 'false');
    assert.equal(second.getAttribute('aria-selected'), 'true');
    await act(() => second.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    assert.equal(second.getAttribute('aria-selected'), 'false');
    await click(first);
    assert.equal(second.querySelectorAll('button').length, 2);
    await act(() => useAuthStore.setState({ user: { id: 'admin', name: 'Mike', role: 'admin', permissions: [] } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']> }));
    await wait(30); [first, second] = Array.from(document.querySelectorAll('.ant-table-row'));
    assert.equal(second.querySelectorAll('button').length, 5, 'cached cells must respond to permissions');
    await act(() => useAuthStore.setState({ user: null }));
    await wait(30); [first, second] = Array.from(document.querySelectorAll('.ant-table-row'));
    assert.equal(second.querySelectorAll('button').length, 2, 'revoking edit rights must remove editing actions');
    const action = second.querySelectorAll('button')[1]!;
    await click(action);
    assert.equal(first.getAttribute('aria-selected'), 'true', 'row actions must not change highlight');
  } finally {
    await act(() => root.unmount()); api.get = originalGet;
  }
});

test('sanitary page hides unused identity columns and groups covers before seats with natural serial ordering', async () => {
 clearStandardQueryCache();
 const originalGet=api.get;
 const records=[['SP0010-G','座'],['SP0009-G','盖'],['SP0002-G','盖'],['SP0001-G','座']].map(([serialNo,part])=>({...item(serialNo,'客户'),serialNo,categoryKey:'sanitary_damper',fields:{part_type:part}}));
 const sanitary={key:'sanitary_damper',name:'智能卫浴',fields:[{key:'part_type',label:'产品部位'}]};
 api.get=(async(url:string)=>({ok:true,data:url.endsWith('categories')?[...categories,sanitary]:records,total:4,version:'test'})) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(MemoryRouter,{initialEntries:['/product-standards?category=sanitary_damper']},createElement(ProductStandardPage))));
  await wait(60);
  const headers=[...document.querySelectorAll('.ant-table-header th')].map(x=>x.textContent);
  assert(!headers.includes('项目代号'));assert(!headers.includes('客户料号'));
  assert.deepEqual([...document.querySelectorAll('.ant-table-body .ant-table-row')].map(r=>r.querySelector('td')?.textContent),['SP0002-G','SP0009-G','SP0001-G','SP0010-G']);
 }finally{await act(()=>root.unmount());api.get=originalGet;clearStandardQueryCache();}
});

test('pending standards lead each category while preserving order within both sections', async () => {
  const originalGet = api.get;
  const sanitary = { key: 'sanitary_damper', name: '智能卫浴', fields: [{ key: 'part_type', label: '产品部位' }] };
  for (const categoryKey of ['gear_damper', 'sanitary_damper']) {
    clearStandardQueryCache();
    const records: StandardListItem[] = [
      { ...item('published-seat', '客户'), serialNo: 'SP0004-G', fields: { part_type: '座' } },
      { ...item('pending-seat', '客户'), serialNo: 'SP0003-G', fields: { part_type: '座' }, status: 'pending_review' },
      { ...item('published-cover', '客户'), serialNo: 'SP0002-G', fields: { part_type: '盖' } },
      { ...item('pending-cover', '客户'), serialNo: 'SP0001-G', fields: { part_type: '盖' }, status: 'pending_review' },
    ].map(record => ({ ...record, categoryKey }));
    api.get = (async (url: string) => ({ ok: true, data: url.endsWith('categories') ? [...categories, sanitary] : [...records], total: records.length, version: 'review-order' })) as typeof api.get;
    const root = createRoot(document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [`/product-standards?category=${categoryKey}`] }, createElement(ProductStandardPage))));
      await wait(60);
      const serials = () => [...document.querySelectorAll('.ant-table-body .ant-table-row')].map(row => row.querySelector('td')?.textContent);
      assert.deepEqual(serials(), categoryKey === 'sanitary_damper'
        ? ['SP0001-G', 'SP0003-G', 'SP0002-G', 'SP0004-G']
        : ['SP0003-G', 'SP0001-G', 'SP0004-G', 'SP0002-G']);
      assert.equal(records[0].serialNo, 'SP0004-G', 'display sorting must not mutate source data');
      records[1] = { ...records[1], status: 'published' };
      await click([...document.querySelectorAll('button')].find(button => button.textContent?.includes('刷新'))!);
      await wait(60);
      assert.equal(serials()[0], 'SP0001-G', 'a reviewed standard must leave the pending section');
    } finally {
      await act(() => root.unmount()); api.get = originalGet; clearStandardQueryCache();
    }
  }
});


test('every column filter focuses on opening and reopening; categories and summary remain visible', async () => {
  clearStandardQueryCache();
  const originalGet = api.get;
  const sevenCategories = ['齿形阻尼器','筒型阻尼器','齿条阻尼器','锁类·同步器','空气拉绳阻尼器','空气拉柄阻尼器','智能卫浴'].map((name,index)=>({key:index===0?'gear_damper':`category-${index}`,name,fields:[]}));
  const requests:string[]=[];
  api.get = (async (url:string) => { requests.push(url); return {data:url.endsWith('/categories') ? sevenCategories : [item('focus','客户')],total:344,overallTotal:808,version:'focus'}; }) as typeof api.get;
  const root=createRoot(document.getElementById('root')!);
  try {
    await act(async()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));await wait(70);
    assert(document.body.textContent?.includes('审核后发布'));
    assert(!document.body.textContent?.includes('管理员保存即生效'));
    const categoryGroup=document.querySelector('[aria-label="产品分类"]');
    assert(categoryGroup,'category navigation must expose every category');
    assert.equal(categoryGroup!.querySelectorAll('input[type="radio"]').length,7);
    assert(document.body.textContent?.includes('共 7 类'));
    const toolbar=[...document.querySelectorAll('div')].find(node=>node.querySelector('input[placeholder^="搜索序号"]') && node.textContent?.includes('重置筛选') && node.textContent?.includes('标准总数：808 条') && !node.querySelector('table'));
    assert(toolbar,'totals belong in the filter toolbar instead of a separate row');
    const triggers=[...document.querySelectorAll('.ant-table-header .ant-table-filter-trigger')];
    assert.equal(triggers.length,4);
    for(let index=0;index<triggers.length;index++) {
      const placeholders=['筛选客户名','筛选项目代号','筛选型号','筛选客户料号'];
      for(let attempt=0;attempt<2;attempt++) {
        await click(triggers[index]);await wait(50);
        const input=document.querySelector<HTMLInputElement>(`input[placeholder="${placeholders[index]}"]`);
        assert(input,`missing popup for column ${index}, attempt ${attempt}; header ${triggers[index].closest('th')?.textContent}; inputs ${[...document.querySelectorAll('input')].map(element=>element.placeholder).filter(Boolean).join(',')}`);assert.equal(document.activeElement===input,true,`column ${index}, attempt ${attempt}: expected ${placeholders[index]}, focused ${(document.activeElement as HTMLInputElement)?.placeholder}`);
        await click(triggers[index]);await wait(30);
        await act(()=>document.querySelector<HTMLInputElement>('input[placeholder^="搜索序号"]')?.focus());
      }
    }
    const sanitary=categoryGroup!.querySelector<HTMLInputElement>('input[value="category-6"]')!;
    await click(sanitary);await wait(40);
    assert.equal(sanitary.checked,true);
    assert(requests.some(url=>new URL(url,'http://local').searchParams.get('category')==='category-6'));
  } finally {await act(()=>root.unmount());api.get=originalGet;clearStandardQueryCache();}
});
