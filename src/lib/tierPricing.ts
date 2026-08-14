import type { Product, Tier } from "../types/quotation";

export interface TierPricingValidation {
  errors: string[];
  warnings: string[];
}

let tierIdCounter = Date.now();

function createTierId(): string {
  tierIdCounter += 1;
  return `tier_${tierIdCounter.toString(36)}`;
}

export function sortTiers(tiers: Tier[], direction: "asc" | "desc" = "asc"): Tier[] {
  return [...tiers].sort((left, right) => direction === "asc" ? left.minQty - right.minQty : right.minQty - left.minQty);
}

export function createDefaultTiers(price: number, quantities = [1000, 3000, 5000]): Tier[] {
  return quantities.map((minQty) => ({ id: createTierId(), minQty, price }));
}

export function setTierPricingEnabled(product: Product, enabled: boolean, defaultQuantities?: number[]): Product {
  return {
    ...product,
    tierPricingEnabled: enabled,
    tiers: product.tiers?.length ? product.tiers : createDefaultTiers(product.price || 0, defaultQuantities),
  };
}

export function addTier(tiers: Tier[], price: number, step = 2000, direction: "asc" | "desc" = "asc"): Tier[] {
  const sorted = sortTiers(tiers);
  const lastQty = sorted.at(-1)?.minQty ?? 0;
  const next = [...sorted, { id: createTierId(), minQty: lastQty + step, price }];
  return sortTiers(next, direction);
}

export function removeTier(tiers: Tier[], tierId: string): Tier[] {
  if (tiers.length <= 2) return tiers;
  return tiers.filter((tier) => tier.id !== tierId);
}

export function updateTier(tiers: Tier[], tierId: string, field: "minQty" | "price", value: number): Tier[] {
  return tiers.map((tier) => tier.id === tierId ? { ...tier, [field]: value } : tier);
}

export function validateTierPricing(product: Product, locale: "zh" | "en" = "zh"): TierPricingValidation {
  if (!product.tierPricingEnabled) return { errors: [], warnings: [] };
  const tiers = sortTiers(product.tiers || []);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (tiers.length < 2) errors.push(locale === "en" ? "Tier pricing requires at least two tiers" : "阶梯报价至少需要两档");
  if (tiers.some((tier) => !Number.isInteger(tier.minQty) || tier.minQty <= 0)) errors.push(locale === "en" ? "MOQ must be a positive integer" : "MOQ必须是正整数");
  if (new Set(tiers.map((tier) => tier.minQty)).size !== tiers.length) errors.push(locale === "en" ? "MOQ values must be unique" : "MOQ不能重复");
  if (tiers.some((tier) => !Number.isFinite(tier.price) || tier.price <= 0)) errors.push(locale === "en" ? "Tier prices must be greater than 0" : "阶梯单价必须大于0");

  for (let index = 1; index < tiers.length; index += 1) {
    if (tiers[index].price >= tiers[index - 1].price) {
      warnings.push(locale === "en"
        ? `Unit price at MOQ ${tiers[index].minQty.toLocaleString("en-US")} should be lower than at MOQ ${tiers[index - 1].minQty.toLocaleString("en-US")}`
        : `MOQ ${tiers[index].minQty.toLocaleString("zh-CN")} 的单价应低于 MOQ ${tiers[index - 1].minQty.toLocaleString("zh-CN")}`);
    }
  }
  return { errors, warnings };
}

export function validateQuotationTiers(products: Product[], locale: "zh" | "en" = "zh"): TierPricingValidation {
  return products.reduce<TierPricingValidation>((result, product, index) => {
    const validation = validateTierPricing(product, locale);
    const label = locale === "en"
      ? `Product ${index + 1}${product.name ? ` "${product.name}"` : ""}`
      : `第${index + 1}个产品${product.name ? `“${product.name}”` : ""}`;
    const separator = locale === "en" ? ": " : "：";
    result.errors.push(...validation.errors.map((error) => `${label}${separator}${error}`));
    result.warnings.push(...validation.warnings.map((warning) => `${label}${separator}${warning}`));
    return result;
  }, { errors: [], warnings: [] });
}
