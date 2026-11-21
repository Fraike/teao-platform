import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateMoldPricing, validateMoldPricing } from '../src/lib/moldPricing.ts';
import type { Product } from '../src/types/quotation.ts';

const product: Product = { id: 'p', name: '产品', price: 2, unit: 'PCS' };
const molds = [
  { id: 'a', name: 'A', totalCost: 10000, amortizeQty: 50000 },
  { id: 'b', name: 'B', totalCost: 5000, amortizeQty: 10000 },
];

test('multiple molds use independent quantities and add once to product price', () => {
  const result = calculateMoldPricing(product, molds);
  assert.equal(result.unitCost, 0.7);
  assert.equal(result.prices[0].total, 2.7);
  assert.equal(validateMoldPricing([product], molds), null);
  const tiered = calculateMoldPricing({ ...product, tierPricingEnabled: true,
    tiers: [{ id: 't', minQty: 1000, price: 1.5 }] }, molds);
  assert.equal(tiered.prices[0].total, 2.2);
  assert.equal(tiered.prices[0].minQty, 1000);
});

test('invalid quantities or multiple products must not yield a misleading total', () => {
  const invalid = [{ ...molds[0], amortizeQty: 0 }];
  assert.equal(calculateMoldPricing(product, invalid).unitCost, null);
  assert.ok(validateMoldPricing([product], invalid));
  assert.ok(validateMoldPricing([product, { ...product, id: 'p2' }], molds));
  assert.ok(validateMoldPricing([], molds));
  assert.ok(validateMoldPricing([product], [{ ...molds[0], totalCost: Infinity }]));
  assert.equal(validateMoldPricing([product, product], []), null);
});
