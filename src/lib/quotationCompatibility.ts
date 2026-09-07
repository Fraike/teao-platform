import type { Product } from "../types/quotation";

export function truncateDecimalPlaces(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimalPlaces;
  return Math.trunc((value + Number.EPSILON) * factor) / factor;
}

export function formatDomesticPrice(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}

export function isTaxIncluded(taxNote: string | undefined): boolean {
  return taxSelectionFromNote(taxNote) === "included";
}

export type TaxSelection = "included" | "excluded";

export function taxSelectionFromNote(taxNote: string | undefined): TaxSelection {
  const normalized = taxNote?.trim() ?? "";
  if (!normalized) return "excluded";
  return normalized.includes("不含税") || normalized.includes("不含增值税") ? "excluded" : "included";
}

export function taxNoteFromSelection(selection: TaxSelection): string {
  return selection === "included" ? "含税" : "不含税";
}

export function ensureUniqueProductIds(
  products: Product[],
  createId: (index: number) => string,
): Product[] {
  const seen = new Set<string>();
  return products.map((product, index) => {
    if (product.id && !seen.has(product.id)) {
      seen.add(product.id);
      return product;
    }
    const id = createId(index);
    seen.add(id);
    return { ...product, id };
  });
}

export function removeProductById(products: Product[], productId: string): Product[] {
  return products.filter((product) => product.id !== productId);
}
