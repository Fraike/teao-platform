import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { act, createElement } from 'react';
import './standard-frontend-dom.ts';
const { createRoot } = await import('react-dom/client');
const { ConfigProvider } = await import('antd');
// jsdom has no CSS transition lifecycle; disable Ant motion while testing request lifecycle.
const { MemoryRouter } = await import('react-router-dom');
const { NotificationBell } = await import('../src/components/NotificationBell.tsx');
const { api, setToken } = await import('../src/lib/api.ts');
const { useAuthStore } = await import('../src/lib/authStore.ts');
const user = { id: 'reviewer', name: '乙', username: 'reviewer', role: 'user' as const,
  status: 'active' as const, permissions: ['engineering_review'] };
const item = { id: 'standard_review:1', type: 'standard_review', title: '产品标准待审核',
  description: '客户 · 型号', time: '', link: '/product-standards?status=pending_review' };
const page = (total = 25) => ({ ok: true, data: [item], total });
function visibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new window.Event('visibilitychange'));
}

function pollingClock(t: TestContext) {
  const callbacks = new Map<number, () => void>();
  const interval = globalThis.setInterval, clear = globalThis.clearInterval;
  let id = 1000000;
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    if (delay !== 30_000) return interval(callback, delay);
    callbacks.set(++id, callback); return id;
  });
  t.mock.method(globalThis, 'clearInterval', (timer: ReturnType<typeof setInterval>) => {
    if (!callbacks.delete(Number(timer))) clear(timer);
  });
  return { tick(milliseconds: number) {
    for (let n = 0; n < milliseconds / 30_000; n++) for (const callback of [...callbacks.values()]) callback();
  } };
}

test('hidden pages pause polling, visible resumes once, total drives badge and review guidance', async t => {
  const clock = pollingClock(t);
  const pending: { resolve: (value: unknown) => void; reject: (reason: Error) => void; signal?: AbortSignal | null }[] = [];
  const original = api.get;
  api.get = ((_url: string, options?: RequestInit) => new Promise((resolve, reject) =>
    pending.push({ resolve, reject, signal: options?.signal }))) as typeof api.get;
  setToken('session-one'); useAuthStore.setState({ user }); visibility('hidden');
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(ConfigProvider, { theme: { token: { motion: false } } }, createElement(MemoryRouter, null, createElement(NotificationBell)))));
    await act(async () => clock.tick(60_000));
    assert.equal(pending.length, 0, 'hidden mount must not fetch');
    await act(async () => visibility('visible'));
    assert.equal(pending.length, 1);
    await act(async () => clock.tick(60_000));
    assert.equal(pending.length, 1, 'only one request may be active');
    await act(async () => { pending[0].resolve(page()); });
    assert.equal(document.querySelector('.ant-badge-count')?.getAttribute('title'), '25');
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="通知"]')!.click());
    assert.match(document.body.textContent!, /共 25 条/);
    assert.match(document.body.textContent!, /查看标准审核/);
    await act(async () => visibility('hidden'));
    await act(async () => clock.tick(60_000));
    assert.equal(pending.length, 1);
    await act(async () => visibility('visible'));
    assert.equal(pending.length, 2);
    await act(async () => pending[1].reject(new Error('offline')));
    assert.equal(document.querySelector('.ant-badge-count')?.getAttribute('title'), '25', 'network errors retain data');
    await act(async () => clock.tick(30_000));
    await act(async () => visibility('hidden'));
    assert.equal(pending[2].signal?.aborted, true, 'hiding cancels the outstanding check');
    await act(async () => visibility('visible'));
    assert.equal(pending.length, 4, 'visible immediately starts a new check after cancellation');
    await act(async () => pending[3].resolve(page(4)));
    await act(async () => pending[2].resolve(page(99)));
    assert.equal(document.querySelector('.ant-badge-count')?.getAttribute('title'), '4');
  } finally { await act(async () => root.unmount()); api.get = original; }
});

test('token replacement without a user update cancels the old request and checks the new session', async t => {
  const clock = pollingClock(t);
  const pending: { resolve: (value: unknown) => void; signal?: AbortSignal | null }[] = [];
  const original = api.get;
  api.get = ((_url: string, options?: RequestInit) => new Promise(resolve =>
    pending.push({ resolve, signal: options?.signal }))) as typeof api.get;
  setToken('session-one'); useAuthStore.setState({ user }); visibility('visible');
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(ConfigProvider, { theme: { token: { motion: false } } }, createElement(MemoryRouter, null, createElement(NotificationBell)))));
    await act(async () => { setToken('session-two'); clock.tick(30_000); });
    assert.equal(pending[0].signal?.aborted, true);
    assert.equal(pending.length, 2, 'token changes must restart even before any usable data');
    await act(async () => pending[1].resolve(page(2)));
    await act(async () => pending[0].resolve(page(99)));
    assert.equal(document.querySelector('.ant-badge-count')?.getAttribute('title'), '2');
    await act(async () => {
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new window.StorageEvent('storage', { key: 'auth_token' }));
    });
    assert.equal(document.querySelector('.ant-badge-count'), null);
  } finally { await act(async () => root.unmount()); api.get = original; }
});

test('permission and session changes clear old data and cancel stale responses; unmount aborts', async t => {
  const clock = pollingClock(t);
  const pending: { resolve: (value: unknown) => void; signal?: AbortSignal | null }[] = [];
  const original = api.get;
  api.get = ((_url: string, options?: RequestInit) => new Promise(resolve =>
    pending.push({ resolve, signal: options?.signal }))) as typeof api.get;
  setToken('session-one'); useAuthStore.setState({ user }); visibility('visible');
  const root = createRoot(document.getElementById('root')!);
  let unmounted = false;
  try {
    await act(async () => root.render(createElement(ConfigProvider, { theme: { token: { motion: false } } }, createElement(MemoryRouter, null, createElement(NotificationBell)))));
    await act(async () => { pending[0].resolve(page()); });
    await act(async () => clock.tick(30_000));
    await act(async () => { setToken('session-two'); useAuthStore.setState({ user: { ...user, id: 'other' } }); });
    assert.equal(pending[1].signal?.aborted, true);
    assert.equal(document.querySelector('.ant-badge-count'), null, 'old badge must clear immediately');
    await act(async () => { pending[2].resolve(page(3)); });
    await act(async () => { pending[1].resolve(page(99)); });
    assert.equal(document.querySelector('.ant-badge-count')?.getAttribute('title'), '3', 'old result must never overwrite new session');
    await act(async () => useAuthStore.setState({ user: { ...user, permissions: [] } }));
    assert.equal(document.querySelector('.ant-badge-count'), null, 'permission changes clear existing notifications');
    await act(async () => root.unmount()); unmounted = true;
    assert.equal(pending.at(-1)?.signal?.aborted, true);
    await act(async () => pending.at(-1)!.resolve(page(99)));
    assert.equal(document.querySelector('.ant-badge-count'), null);
  } finally { if (!unmounted) await act(async () => root.unmount()); api.get = original; }
});
