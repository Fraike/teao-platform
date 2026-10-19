import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { createElement, act, useCallback, useState } from 'react';
import type { ChangeEvent, CompositionEvent } from 'react';
import { useImeSafeFilter } from '../src/lib/useImeSafeFilter.ts';

const { createRoot } = await import('react-dom/client');
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

test('debounces committed text, cancels pending work during IME/reset/unmount', async () => {
  let filter: ReturnType<typeof useImeSafeFilter>;
  const applied: string[] = [];
  function Harness() {
    filter = useImeSafeFilter('', 180, value => applied.push(value));
    return createElement('input', filter.inputProps);
  }
  const root = createRoot(document.getElementById('root')!);
  await act(() => root.render(createElement(Harness)));
  const change = async (value: string) => act(() => filter.inputProps.onChange({ target: { value } } as ChangeEvent<HTMLInputElement>));
  await change('a');
  assert.equal(filter!.inputProps.value, 'a');
  assert.equal(filter!.applied, '', 'typing must not synchronously filter the table');
  await wait(100);
  await change('ab');
  await wait(100);
  assert.deepEqual(applied, []);
  await wait(100);
  assert.deepEqual(applied, ['ab']);
  await change('pending');
  await act(() => filter!.inputProps.onCompositionStart());
  await change('zhong');
  await wait(220);
  assert.deepEqual(applied, ['ab'], 'IME start must cancel pre-composition debounce');
  await act(() => filter!.inputProps.onCompositionEnd({ currentTarget: { value: '中文' } } as CompositionEvent<HTMLInputElement>));
  await change('中文'); // browsers commonly emit onChange after compositionend
  await wait(220);
  assert.deepEqual(applied, ['ab', '中文']);
  await change('discard');
  await act(() => filter!.reset());
  await wait(220);
  assert.equal(filter!.inputProps.value, '');
  assert.deepEqual(applied, ['ab', '中文', '']);
  await change('unmounted');
  await act(() => root.unmount());
  await wait(220);
  assert.deepEqual(applied, ['ab', '中文', '']);
});


test('isolated input never rerenders parent per keystroke and keeps composition on unrelated updates', async () => {
  const { StandardFilterInput } = await import('../src/components/standard/StandardFilterInput.tsx');
  let parentRenders = 0;
  let rerender: () => void;
  let resetInput: () => void;
  let appliedValue = '';
  function Harness() {
    parentRenders++;
    const [applied, setApplied] = useState('');
    const [resetVersion, setResetVersion] = useState(0);
    const [, setRevision] = useState(0);
    appliedValue = applied;
    rerender = () => setRevision(current => current + 1);
    resetInput = () => { setApplied(''); setResetVersion(current => current + 1); };
    const onApply = useCallback((next: string) => setApplied(next), []);
    return createElement(StandardFilterInput, { placeholder: 'isolated', resetVersion, onApply });
  }
  const root = createRoot(document.getElementById('root')!);
  await act(() => root.render(createElement(Harness)));
  const input = document.querySelector<HTMLInputElement>('input[placeholder="isolated"]')!;
  const change = async (value: string) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(() => input.focus());
  await change('a'); await change('ab'); await change('abc');
  assert.equal(input.value, 'abc');
  assert.equal(parentRenders, 1, 'local typing must leave table parent untouched');
  await wait(220);
  assert.equal(appliedValue, 'abc'); assert.equal(parentRenders, 2);
  await act(() => input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })));
  await change('zhong');
  await act(() => rerender!());
  await wait(220);
  assert.equal(appliedValue, 'abc'); assert.equal(input.value, 'zhong');
  assert.equal(document.activeElement, input);
  await change('中文');
  await act(() => input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true, data: '中文' })));
  await wait(220);
  assert.equal(appliedValue, '中文');
  await change('pending');
  await act(() => resetInput!());
  await wait(220);
  assert.equal(input.value, ''); assert.equal(appliedValue, '');
  await act(() => root.unmount());
});
