import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductionProductSelect } from '../src/components/production/ProductionProductSelect.tsx';
import type { ProductionProductOption } from '../src/lib/productionProductSearch.ts';

test('unclassified products appear in their group and remain selectable after searching', async () => {
  const options: ProductionProductOption[] = [
    { value: 'finished', label: 'SP001 · 成品', productName: '成品', productNumber: 'SP001', group: '成品' },
    { value: 'missing', label: 'SP0201-A · RD-T023-60', productName: 'RD-T023-60', productNumber: 'SP0201-A', group: '金蝶未分类' },
  ];
  let selected: ProductionProductOption | undefined;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(() => root.render(createElement(ProductionProductSelect, { options, onProductSelect: option => { selected = option; } })));
    const input = document.querySelector('input[role="combobox"]') as HTMLInputElement;
    await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
    assert.match(document.body.textContent || '', /金蝶未分类/);
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'sp0201');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.equal(document.querySelectorAll('.ant-select-item-option').length, 1, '搜索后仅保留匹配商品');
    const option = [...document.querySelectorAll('.ant-select-item-option')].find(item => item.textContent?.includes('SP0201-A'));
    assert.ok(option);
    await act(() => option.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    assert.equal(selected?.value, 'missing');
    assert.equal(selected?.productName, 'RD-T023-60');
  } finally {
    await act(() => root.unmount());
  }
});
