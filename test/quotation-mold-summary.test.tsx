import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import './standard-frontend-dom.ts';
import { MoldPriceSummary } from '../src/components/MoldPriceSummary.tsx';
import PreviewPanel from '../src/components/PreviewPanel.tsx';
import { useQuotationStore } from '../src/lib/store.ts';

test('summary shows combined unit price without repeating mold details from preview table', () => {
  const store = useQuotationStore.getState();
  store.resetToSample();
  store.setProducts([{ id: 'p', name: '测试产品', unit: 'PCS', price: 2 }]);
  store.addMold(); store.addMold();
  const molds = useQuotationStore.getState().quotation.molds;
  store.updateMold(molds[0].id, mold => ({ ...mold, name: '主模具', totalCost: 10000, amortizeQty: 50000 }));
  store.updateMold(molds[1].id, mold => ({ ...mold, name: '副模具', totalCost: 5000, amortizeQty: 10000 }));
  store.setQuoteMeta(meta => ({ ...meta, showMold: true }));
  const quotation = useQuotationStore.getState().quotation;
  const container = document.createElement('div');
  const root = createRoot(container);
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  Object.defineProperty(globalThis, 'Image', { value: window.Image, configurable: true });
  let preview: string;
  try {
    act(() => root.render(<PreviewPanel />));
    preview = container.textContent ?? '';
    act(() => store.setQuoteMeta(meta => ({ ...meta, showMold: false })));
    const hiddenPreview = container.textContent ?? '';
    assert.match(hiddenPreview, /合计单价 ¥2\.7000\/PCS/);
    assert.doesNotMatch(hiddenPreview, /主模具|副模具|MOLD TOOLING COST/);
  } finally {
    act(() => root.unmount());
    if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
    else Reflect.deleteProperty(globalThis, 'Image');
  }
  const summary = renderToStaticMarkup(<MoldPriceSummary {...quotation} />);
  assert.doesNotMatch(summary, /主模具|副模具|÷|各模具按上述/);
  for (const html of [summary, preview]) {
    assert.match(html, /合计单价 ¥2\.7000\/PCS/);
    assert.match(html, /产品单价 ¥2\.0000 ＋ 模具分摊单价 ¥0\.7000/);
  }
  assert.match(preview, /50,000 PCS/);
  assert.match(preview, /10,000 PCS/);
  assert.match(preview, /主模具/);
  assert.match(preview, /副模具/);
  assert.equal(renderToStaticMarkup(<MoldPriceSummary products={quotation.products} molds={[]} />), '');
  const invalid = renderToStaticMarkup(<MoldPriceSummary products={[...quotation.products, { ...quotation.products[0], id: 'p2' }]} molds={quotation.molds} />);
  assert.match(invalid, /只能有一个产品/);
  assert.doesNotMatch(invalid, /合计单价/);
});
