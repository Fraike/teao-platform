import assert from "node:assert/strict";
import {
  addTier,
  createDefaultTiers,
  removeTier,
  setTierPricingEnabled,
  sortTiers,
  validateQuotationTiers,
  validateTierPricing,
} from "../src/lib/tierPricing.ts";
import type { Product } from "../src/types/quotation.ts";

const baseProduct: Product = {
  id: "p1",
  name: "阻尼器",
  unit: "PCS",
  price: 1.5,
};

const defaults = createDefaultTiers(1.5);
assert.deepEqual(defaults.map(({ minQty, price }) => ({ minQty, price })), [
  { minQty: 1000, price: 1.5 },
  { minQty: 3000, price: 1.5 },
  { minQty: 5000, price: 1.5 },
]);
assert.equal(new Set(defaults.map((tier) => tier.id)).size, 3);

const enabled = setTierPricingEnabled(baseProduct, true);
assert.equal(enabled.tierPricingEnabled, true);
assert.equal(enabled.tiers?.length, 3);
const disabled = setTierPricingEnabled(enabled, false);
assert.equal(disabled.tierPricingEnabled, false);
assert.deepEqual(disabled.tiers, enabled.tiers);
assert.deepEqual(setTierPricingEnabled(disabled, true).tiers, enabled.tiers);

const sorted = sortTiers([
  { id: "b", minQty: 5000, price: 1 },
  { id: "a", minQty: 1000, price: 1.4 },
]);
assert.deepEqual(sorted.map((tier) => tier.minQty), [1000, 5000]);
assert.deepEqual(addTier(sorted, 1.4).map((tier) => tier.minQty), [1000, 5000, 7000]);
assert.equal(removeTier(sorted, "a").length, 2, "不能删除到少于两档");

const validProduct: Product = {
  ...baseProduct,
  tierPricingEnabled: true,
  tiers: [
    { id: "a", minQty: 1000, price: 1.5 },
    { id: "b", minQty: 3000, price: 1.3 },
    { id: "c", minQty: 5000, price: 1.1 },
  ],
};
assert.deepEqual(validateTierPricing(validProduct), { errors: [], warnings: [] });

assert.deepEqual(validateTierPricing({
  ...validProduct,
  tiers: [
    { id: "a", minQty: 1000, price: 1.2 },
    { id: "b", minQty: 3000, price: 1.2 },
  ],
}), {
  errors: [],
  warnings: ["MOQ 3,000 的单价应低于 MOQ 1,000"],
});

const invalid = validateTierPricing({
  ...validProduct,
  tiers: [
    { id: "a", minQty: 1000, price: 0 },
    { id: "b", minQty: 1000, price: 1 },
  ],
});
assert.deepEqual(invalid.errors, ["MOQ不能重复", "阶梯单价必须大于0"]);

assert.deepEqual(validateTierPricing({ ...validProduct, tierPricingEnabled: false }), { errors: [], warnings: [] });

const quotationValidation = validateQuotationTiers([{
  ...validProduct,
  tiers: [
    { id: "a", minQty: 1000, price: 1.25 },
    { id: "b", minQty: 3000, price: 1.25 },
    { id: "c", minQty: 5000, price: 1.25 },
  ],
}]);
assert.equal(quotationValidation.errors.length, 0);
assert.equal(quotationValidation.warnings.length, 2);
assert.match(quotationValidation.warnings[0], /第1个产品“阻尼器”/);

const internationalValidation = validateQuotationTiers([{
  ...validProduct,
  name: "Rotary Damper",
  tiers: [
    { id: "a", minQty: 1000, price: 1.25 },
    { id: "b", minQty: 1000, price: 1.25 },
  ],
}], "en");
assert.deepEqual(internationalValidation.errors, [
  'Product 1 "Rotary Damper": MOQ values must be unique',
]);
assert.deepEqual(internationalValidation.warnings, [
  'Product 1 "Rotary Damper": Unit price at MOQ 1,000 should be lower than at MOQ 1,000',
]);

console.log("Tier pricing tests passed.");
