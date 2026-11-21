import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import QuotationManagementPage from '../src/pages/QuotationManagementPage.tsx';
import { api } from '../src/lib/api.ts';
import { sampleQuotation } from '../src/lib/sample.ts';
import type { ManagedQuotation } from '../src/types/quotation.ts';

test('quotation management detail shows combined domestic mold price', async () => {
  const originalGet = api.get;
  const record: ManagedQuotation = {
    id: 'mold-summary', market: 'domestic', quoteNo: 'Q-MOLD', quoteDate: '2026-11-21',
    customerName: '客户', currency: 'CNY', salesName: '业务员', actualQuoterName: '业务员',
    productCount: 1, totalAmount: 2, createdAt: '', updatedAt: '', createdBy: 'tester', updatedBy: 'tester',
    quotation: { ...sampleQuotation, products: [{ id: 'p', name: '测试产品', price: 2, unit: 'PCS' }],
      molds: [{ id: 'm1', name: '模具', totalCost: 10000, amortizeQty: 50000 }] },
  };
  api.get = (async (url: string) => url.includes('/api/quotations/mold-summary')
    ? { data: record } : { data: [record], total: 1 }) as typeof api.get;
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => { root.render(<MemoryRouter><QuotationManagementPage /></MemoryRouter>); });
    const view = document.querySelector<HTMLButtonElement>('button[title="查看报价"]');
    assert.ok(view);
    await act(async () => { view.click(); });
    const drawer = document.querySelector('.ant-drawer');
    assert.ok(drawer);
    assert.match(drawer.textContent ?? '', /产品单价 ¥2\.0000 ＋ 模具分摊单价 ¥0\.2000/);
    assert.match(drawer.textContent ?? '', /合计单价 ¥2\.2000\/PCS/);
  } finally {
    await act(async () => root.unmount());
    api.get = originalGet;
  }
});
