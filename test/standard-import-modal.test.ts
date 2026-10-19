import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { StandardImportModal } from '../src/components/standard/StandardImportModal.tsx';
import { useAuthStore } from '../src/lib/authStore.ts';
import { api } from '../src/lib/api.ts';
import type { StandardImportWorkerResponse } from '../src/types/standardImport.ts';
const { createRoot } = await import('react-dom/client');
class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage?: (event: { data: StandardImportWorkerResponse }) => void;
  terminated = 0;
  constructor() { WorkerDouble.instances.push(this); }
  terminate() { this.terminated++; }
  postMessage() {}
}
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const result = { records: [{ serialNo: 'SP0103-A', customer: '客户', model: '型号', customerPartNo: '', categoryKey: 'gear_damper', standardType: 'formal' as const, fields: {}, sourceHash: 'a'.repeat(64), sourceSheet: '标准', sourceRow: 4 }], errors: [], warnings: [], fileHash: 'a'.repeat(64), source: { sheetName: '标准', range: 'A1:C4', rowCount: 4, columnCount: 3 } };

test('modal cancels replaced/closed workers, displays obsolete count and blocks backend errors', async () => {
  const originalWorker = globalThis.Worker;
  const originalPost = api.post;
  const originalAuth = useAuthStore.getState();
  globalThis.Worker = WorkerDouble as unknown as typeof Worker;
  useAuthStore.setState({ user: { role: 'admin' } as typeof originalAuth.user });
  const requests: unknown[] = [];
  let invalid = false;
  api.post = async <T>(_url: string, body: unknown): Promise<T> => {
    requests.push(body);
    return { ok: true, data: { total: 1, valid: 1, skipped: 0, obsolete: 1, token: invalid ? null : 'token', errors: invalid ? [{ row: 4, message: '未确认的作废标准' }] : [] } } as T;
  };
  const root = createRoot(document.getElementById('root')!);
  let open = true;
  const render = () => act(async () => root.render(createElement(StandardImportModal, { open, onClose: () => { open = false; }, onImported() {} })));
  const choose = async (name: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new window.File(['bytes'], name);
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(5) });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(() => input.dispatchEvent(new window.Event('change', { bubbles: true })));
    await tick();
    return WorkerDouble.instances.at(-1)!;
  };
  const confirm = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.replaceAll(' ', '') === '确认导入')!;
  try {
    await render();
    const first = await choose('first.xlsx');
    const second = await choose('second.xlsx');
    assert.equal(first.terminated, 1);
    await act(() => first.onmessage!({ data: { ok: true, data: result } }));
    assert.equal(requests.length, 0, 'replaced parser must not request preview');
    await act(() => second.onmessage!({ data: { ok: true, data: result } })); await tick();
    assert.equal(second.terminated, 1);
    assert.ok(document.body.textContent?.includes('将停用 1'));
    assert.deepEqual(requests[0], { records: result.records });
    await act(() => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    assert.equal(confirm().disabled, false);
    invalid = true;
    const third = await choose('invalid.xlsx');
    await act(() => third.onmessage!({ data: { ok: true, data: result } })); await tick();
    await act(() => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    assert.equal(confirm().disabled, true);
    assert.ok(document.body.textContent?.includes('未确认的作废标准'));
    const fourth = await choose('close.xlsx');
    await act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.replaceAll(' ', '') === '取消')!.click());
    assert.equal(fourth.terminated, 1);
    await render();
  } finally {
    await act(() => root.unmount());
    globalThis.Worker = originalWorker;
    api.post = originalPost;
    useAuthStore.setState(originalAuth);
  }
});
