import type { MoldItem, Product } from "../types/quotation";

export function validateMoldPricing(products: Product[], molds: MoldItem[]): string | null {
  if (molds.length === 0) return null;
  if (products.length !== 1) return "有模具分摊费用时只能有一个产品，请先保留一个产品。";
  if (molds.some((mold) => !Number.isFinite(mold.totalCost) || mold.totalCost < 0
    || !Number.isSafeInteger(mold.amortizeQty) || mold.amortizeQty <= 0)) {
    return "请填写有效的模具费用和分摊数量（正整数）。";
  }
  return null;
}

export function calculateMoldPricing(product: Product, molds: MoldItem[]) {
  const unitCost = validateMoldPricing([product], molds) ? null
    : molds.reduce((sum, mold) => sum + mold.totalCost / mold.amortizeQty, 0);
  const prices = product.tierPricingEnabled
    ? (product.tiers ?? []).map((tier) => ({ price: tier.price, minQty: tier.minQty }))
    : [{ price: product.price, minQty: undefined }];
  return {
    unitCost,
    prices: prices.map((row) => ({ ...row, total: unitCost === null ? null : row.price + unitCost })),
  };
}
