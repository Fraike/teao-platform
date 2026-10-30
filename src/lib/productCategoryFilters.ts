import { identifyProductSeries } from './productSeries.ts';
import type { ProductArchive, ProductCategoryNode } from '../types/product.ts';
import {isManagedSemiProduct,parseSemiProductName} from '../../server/shared/semi-product-series.ts';

export function needsKingdeeEntry(product: ProductArchive) {
  return product.standards.length > 0 && (!product.kingdeeId || product.kingdeeMissing);
}

export function filterProductArchives(products: ProductArchive[], options: { search: string; scope: string; missingGroup?:'finished'|'semi' }) {
  const keyword = options.search.trim().toLowerCase();
  return products.filter(p => {
    const active = options.scope === 'inactive' ? !p.productionAvailable : options.scope === 'unlinked' ? needsKingdeeEntry(p) : options.scope === 'issues' || p.productionAvailable;
    const matches = !keyword || [p.internalNumber, p.name, p.model, identifyProductSeries(p).name,...(isManagedSemiProduct(p)?parseSemiProductName(p.material?.name||p.name).series:[]), ...p.standards.flatMap(s => [s.customer, s.customerPartNo, s.model])].some(value => value.toLowerCase().includes(keyword));
    return active && matches
      && (options.scope !== 'missing' || p.group===(options.missingGroup||'finished') && (p.group==='finished'||isManagedSemiProduct(p)) && !p.drawingCount)
      && (options.scope !== 'issues' || p.issues.length > 0 || p.kingdeeMissing);
  });
}
export function productInCategory(product: ProductArchive, categoryId: string, index: Map<string, ProductCategoryNode>) {
  if (categoryId === 'all' || product.categoryId === categoryId) return true;
  let node = index.get(product.categoryId); const visited = new Set<string>();
  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    if (node.parentId === categoryId) return true;
    node = node.parentId ? index.get(node.parentId) : undefined;
  }
  return false;
}
export function safeProductListReturn(value: string | null) {
  return value === '/materials' || value?.startsWith('/materials?') || value === '/product-standards' || value?.startsWith('/product-standards?') ? value : '/materials';
}
