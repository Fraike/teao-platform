import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { StandardFormModal } from '../src/components/standard/StandardFormModal.tsx';
import type { StandardCategory, StandardDetail } from '../src/types/standard.ts';
const { createRoot } = await import('react-dom/client');
const categories: StandardCategory[] = [{ key: 'gear_damper', name: '齿形', fields: [] }];
const detail = (id: string, customer: string): StandardDetail => ({ id, versions: [{ id: `${id}-v1`, serialNo: id, customer, model: 'model', categoryKey: 'gear_damper', standardType: 'formal', fields: {}, status: 'draft' }], changes: [] } as StandardDetail);

test('category refresh preserves dirty fields; opening and copy/edit identity initialize once', async () => {
  const root = createRoot(document.getElementById('root')!);
  let props = { open: true, categories, initial: null as StandardDetail | null, copySource: null as StandardDetail | null, onClose() {}, onSaved() {} };
  const render = () => act(async () => { root.render(createElement(StandardFormModal, props)); });
  await render();
  const customer = () => document.querySelector<HTMLInputElement>('input[placeholder="客户名称"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(customer(), '未保存客户');
    customer().dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  props = { ...props, categories: [...categories] };
  await render();
  assert.equal(customer().value, '未保存客户');
  props = { ...props, copySource: detail('SP1', '复制客户') }; await render();
  assert.equal(customer().value, '复制客户');
  assert.equal(document.querySelector<HTMLInputElement>('input[placeholder="如 SP0009-A"]')!.value, 'SP1-副本');
  props = { ...props, initial: detail('SP1', '编辑客户') }; await render();
  assert.equal(customer().value, '编辑客户');
  props = { ...props, initial: detail('SP1', '服务端刷新') }; await render();
  assert.equal(customer().value, '编辑客户');
  props = { ...props, open: false }; await render();
  props = { ...props, open: true }; await render();
  assert.equal(customer().value, '服务端刷新');
  await act(() => root.unmount());
});

test('late categories fill only the empty category and preserve other dirty input', async () => {
  const root = createRoot(document.getElementById('root')!);
  let props = { open: true, categories: [] as StandardCategory[], initial: null, onClose() {}, onSaved() {} };
  const render = () => act(async () => root.render(createElement(StandardFormModal, props)));
  await render();
  const input = document.querySelector<HTMLInputElement>('input[placeholder="客户名称"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, '异步期间输入');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  props = { ...props, categories }; await render();
  assert.equal(input.value, '异步期间输入');
  assert.equal(document.querySelector('.ant-select-selection-item')?.textContent, '齿形');
  props = { ...props, categories: [{ key: 'rack_damper', name: '齿条', fields: [] }, ...categories] }; await render();
  assert.equal(document.querySelector('.ant-select-selection-item')?.textContent, '齿形');
  await act(() => root.unmount());
});
