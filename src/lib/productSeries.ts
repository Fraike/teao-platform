import type { ProductArchive, ProductSeriesIdentity, ProductSeriesGroup } from '../types/product.ts';
import { PRODUCT_CATEGORY_IDS as ids } from '../../server/shared/product-classification.ts';
export const SERIES_CATEGORY_IDS: readonly string[] = [ids.gear, ids.barrel, ids.rack, ids.cord];
const compare = (a: string, b: string) => a.localeCompare(b, 'zh-CN', { numeric: true });
function parseSeries(value: string): string | null {
  const text = value.trim().toUpperCase();
  const match = text.match(/^(?:RD-)?([A-Z]+\d+[A-Z]*)(?:-\d+(?:\.\d+)?)?(?:-(CW|CCW))?$/);
  if (match) return match[1] + (match[2] ? `-${match[2]}` : '');
  const direction = text.match(/^(?:RD-)?(\d+)(左|右)$/);
  return direction ? direction[1] + direction[2] : null;
}
export function productFullModels(product: ProductArchive): string[] {
  return [...new Set((product.kingdeeId ? [product.material?.name || product.name] : product.standards.map(s => s.model)).map(s => s.trim()).filter(Boolean))].sort(compare);
}
export function identifyProductSeries(product: ProductArchive): ProductSeriesIdentity {
  const models = productFullModels(product), names = models.map(parseSeries);
  const valid = names.length > 0 && names.every(Boolean) && new Set(names).size === 1;
  const name = valid ? names[0]! : models.join(' / ') || product.name || product.internalNumber;
  return { key: `${product.categoryId}:${valid ? name : `pending:${product.id}`}`, name, pending: !valid };
}
export function groupProductSeries(products: ProductArchive[]): ProductSeriesGroup[] {
  const groups = new Map<string, ProductSeriesGroup>();
  for (const product of new Map(products.map(p => [p.id, p])).values()) {
    const identity = identifyProductSeries(product);
    const group = groups.get(identity.key) || { ...identity, products: [], models: [] };
    group.products.push(product); groups.set(group.key, group);
  }
  return [...groups.values()].map(group => ({ ...group, products: group.products.sort((a,b) => compare(productFullModels(a).join(' / '),productFullModels(b).join(' / ')) || compare(a.internalNumber,b.internalNumber)), models: [...new Set(group.products.flatMap(productFullModels))].sort(compare) }))
    .sort((a,b) => Number(a.pending)-Number(b.pending) || Number(!/^T\d/.test(a.name))-Number(!/^T\d/.test(b.name)) || compare(a.name,b.name) || compare(a.key,b.key));
}

export function productSpecification(product: ProductArchive): string {
  if (product.kingdeeId) return product.material?.model || product.model || '未维护';
  return [...new Set(product.standards.map(s => s.fields.test_standard?.trim()).filter(Boolean))].join(' / ') || '未维护';
}
