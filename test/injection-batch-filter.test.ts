import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import './standard-frontend-dom.ts';

const { createRoot } = await import('react-dom/client');
const { ConfigProvider } = await import('antd');
const { api } = await import('../src/lib/api.ts');
const { useAuthStore } = await import('../src/lib/authStore.ts');
const { ProductionEntryInjectionPage } = await import('../src/pages/ProductionEntryInjectionPage.tsx');

test('injection page searches the production batch and clears it on reset', async () => {
  const originalGet = api.get;
  const requests: string[] = [];
  api.get = (async (url: string) => {
    requests.push(url);
    if (url.startsWith('/api/kingdee/production-materials')) {
      return { ok: true, data: { finishedProducts: [], plasticParts: [] } };
    }
    return { ok: true, data: { groups: [], total: 0, hasMore: false } };
  }) as typeof api.get;
  useAuthStore.setState({ user: { id: 'worker', name: '张三', username: 'worker', role: 'user',
    status: 'active', permissions: ['production'] } });
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(ConfigProvider, { theme: { token: { motion: false } } },
      createElement(ProductionEntryInjectionPage))));
    const input = document.querySelector<HTMLInputElement>('input[placeholder="批号搜索"]');
    assert.ok(input, '应提供批号搜索输入框');
    assert.equal(document.querySelector('input[placeholder="全局搜索"]'), null);
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(input, '2026-00');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === label)!;
    await act(async () => button('搜索').click());
    assert.match(requests.filter(url => url.startsWith('/api/production/injection/entries?')).at(-1)!, /batchNo=2026-00/);
    assert.doesNotMatch(requests.at(-1)!, /[?&]search=/);
    await act(async () => button('重置筛选').click());
    assert.doesNotMatch(requests.filter(url => url.startsWith('/api/production/injection/entries?')).at(-1)!, /batchNo=/);
  } finally {
    await act(async () => root.unmount());
    api.get = originalGet;
  }
});
