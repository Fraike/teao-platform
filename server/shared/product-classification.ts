import type { ProductArchive, ProductCategoryNode, ProductGroup, ProductMaterial, ProductStandardReference } from '../../src/types/product.ts';

export const PRODUCT_CATEGORY_IDS = {
  finished: '2314557705978701824', semi: '2342167326683590656',
  gear: '2342097486262423552', barrel: '2342097638163310592', rack: '2345177343053558784',
  lock: '2345680863410286592', cord: '2342318423171690496', handle: '2345175688375554048',
  sanitary: '2355920654022328320', sync: '2342317768625448960', plastic: '2314559979366968320',
} as const;
export const STANDARD_CATEGORY_NAMES: Readonly<Record<string, string>> = {
  gear_damper: '齿轮阻尼器', barrel_damper: '圆筒阻尼器', rack_damper: '齿条阻尼器',
  lock_sync: '其他锁扣.铰链 / 同步器', air_pull_cord: '空气拉绳阻尼器',
  air_pull_handle: '空气拉杆阻尼器', sanitary_damper: '马桶座盖',
};
export const STANDARD_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  齿形阻尼器: 'gear_damper', 齿轮阻尼器: 'gear_damper',
  筒形阻尼器: 'barrel_damper', 筒型阻尼器: 'barrel_damper', 圆筒阻尼器: 'barrel_damper',
  齿条阻尼器: 'rack_damper', '锁类、同步器': 'lock_sync', '锁类·同步器': 'lock_sync',
  '其他锁扣.铰链 / 同步器': 'lock_sync', '其他锁扣.铰链': 'lock_sync', 同步器: 'lock_sync',
  空气拉绳阻尼器: 'air_pull_cord', 空气拉柄阻尼器: 'air_pull_handle', 空气拉杆阻尼器: 'air_pull_handle',
  智能卫浴: 'sanitary_damper', 马桶座盖: 'sanitary_damper',
};
const ids = PRODUCT_CATEGORY_IDS;
const standardIds: Readonly<Record<string, string>> = {
  gear_damper: ids.gear, barrel_damper: ids.barrel, rack_damper: ids.rack,
  air_pull_cord: ids.cord, air_pull_handle: ids.handle, sanitary_damper: ids.sanitary,
};
const fallback = [
  { id: ids.finished, name: '成品', children: [
    [ids.gear, '齿轮阻尼器'], [ids.barrel, '圆筒阻尼器'], [ids.rack, '齿条阻尼器'],
    [ids.lock, '其他锁扣.铰链'], [ids.cord, '空气拉绳阻尼器'], [ids.handle, '空气拉杆阻尼器'],
    [ids.sanitary, '马桶座盖'], [ids.sync, '同步器'],
  ].map(([id, name]) => ({ id, name })) },
  { id: ids.semi, name: '半成品', children: [
    [ids.plastic, '塑胶配件'], ['2314560296833838080', '塑胶原料'], ['2314560420062489600', '阻尼脂'],
    ['2314560542703938560', '绳子'], ['2314560711633708032', '弹簧.五金'], ['2314560770664341504', 'O型圈'],
    ['2314560860841877504', '包材（纸箱.胶袋）'], ['2392107715217476608', '外加工配件'],
  ].map(([id, name]) => ({ id, name })) },
];
export function buildProductCategoryTree(raw: unknown[]): ProductCategoryNode[] {
  function normalize(items: unknown[], parentId: string | null, inherited: ProductGroup): ProductCategoryNode[] {
    return items.flatMap(value => {
      if (!value || typeof value !== 'object' || !('id' in value) || !('name' in value)) return [];
      const record = value as Record<string, unknown>, id = String(record.id);
      const group = id === ids.finished ? 'finished' : id === ids.semi ? 'semi' : inherited;
      return [{ id, name: String(record.name), parentId, group, count: 0,
        children: normalize(Array.isArray(record.children) ? record.children : [], id, group) }];
    });
  }
  const tree = normalize(Array.isArray(raw) ? raw : [], null, 'unclassified');
  return tree.length ? tree : normalize(fallback, null, 'unclassified');
}
export function indexProductCategories(tree: ProductCategoryNode[]): Map<string, ProductCategoryNode> {
  const index = new Map<string, ProductCategoryNode>();
  const visit = (nodes: ProductCategoryNode[]) => { for (const node of nodes) { index.set(node.id, node); visit(node.children); } };
  visit(tree); return index;
}
export function classifyProduct(material: ProductMaterial | null, standards: ProductStandardReference[], index: Map<string, ProductCategoryNode>) {
  if (material) {
    const categoryId = String(material.parent_id || ''), node = index.get(categoryId);
    if (node) return { categoryId: node.id, category: node.name, group: node.group };
    return { categoryId: categoryId || 'unclassified:pending', category: material.parent_name || '未分类', group: 'unclassified' as const };
  }
  const keys = [...new Set(standards.map(s => s.categoryKey))];
  const mappedIds = [...new Set(keys.map(key => standardIds[key]).filter(Boolean))];
  if (keys.length && keys.every(key => Boolean(standardIds[key])) && mappedIds.length === 1) {
    const node = index.get(mappedIds[0]);
    if (node) return { categoryId: node.id, category: node.name, group: node.group };
  }
  const group = keys.length && keys.every(key => Boolean(STANDARD_CATEGORY_NAMES[key])) ? 'finished' : 'unclassified';
  return { categoryId: `${group}:pending`, category: '待分类', group } as const;
}
export function countProductCategories(tree: ProductCategoryNode[], products: ProductArchive[]): ProductCategoryNode[] {
  const clone = tree.map(function copy(node): ProductCategoryNode { return { ...node, children: node.children.map(copy), count: 0 }; });
  const index = indexProductCategories(clone), counts = new Map<string, number>();
  for (const p of new Map(products.map(product => [product.id, product])).values()) {
    if (!index.has(p.categoryId)) {
      const rootId = p.group === 'finished' ? ids.finished : p.group === 'semi' ? ids.semi : 'unclassified';
      let root = index.get(rootId);
      if (!root) {
        root = { id: rootId, name: p.group === 'finished' ? '成品' : p.group === 'semi' ? '半成品' : '未分类', group: p.group, parentId: null, children: [], count: 0 };
        clone.push(root); index.set(rootId, root);
      }
      const node = { id: p.categoryId, name: p.categoryId.endsWith(':pending') ? '待分类' : p.category, parentId: root.id, group: p.group, count: 0, children: [] };
      root.children.push(node); index.set(node.id, node);
    }
    counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
  }
  function total(node: ProductCategoryNode): number {
    node.count = (counts.get(node.id) || 0) + node.children.reduce((sum, child) => sum + total(child), 0); return node.count;
  }
  clone.forEach(total); return clone;
}
