import { readKingdeeCache } from "./kingdee-cache.js";

export const FINISHED_PRODUCT_CATEGORY = "2314557705978701824";
export const INJECTION_PLASTIC_PARTS_CATEGORY = "2314559979366968320";

function productError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function findCategory(categories, categoryId) {
  for (const category of categories) {
    if (String(category.id) === categoryId) return category;
    const child = findCategory(category.children || [], categoryId);
    if (child) return child;
  }
  return null;
}

function collectCategoryIds(category, ids) {
  ids.add(String(category.id));
  for (const child of category.children || []) collectCategoryIds(child, ids);
}

function getCategoryDescendantIds(categories, categoryId, includeRoot = true) {
  const ids = new Set();
  const category = findCategory(categories, categoryId);
  if (!category) {
    ids.add(categoryId);
  } else if (includeRoot) {
    collectCategoryIds(category, ids);
  } else {
    for (const child of category.children || []) collectCategoryIds(child, ids);
  }
  return ids;
}

export function splitProductionMaterials(materials, categories) {
  const finishedCategoryIds = getCategoryDescendantIds(categories, FINISHED_PRODUCT_CATEGORY, false);
  return {
    finishedProducts: materials.filter((material) => finishedCategoryIds.has(String(material.parent_id))),
    plasticParts: materials.filter((material) => String(material.parent_id) === INJECTION_PLASTIC_PARTS_CATEGORY),
  };
}

export function getTrustedProductionProduct(department, productId) {
  const id = String(productId || "").trim();
  if (!id) throw productError("请选择当前金蝶商品");
  const materials = readKingdeeCache("materials");
  const categories = readKingdeeCache("categories");
  if (!materials || !categories) {
    throw productError("金蝶商品缓存尚未准备好，请先更新金蝶商品", 503);
  }
  const groups = splitProductionMaterials(materials.data, categories.data);
  const allowed = department === "assembly" ? groups.finishedProducts : groups.plasticParts;
  const product = allowed.find((material) => String(material.id) === id);
  if (!product) {
    const exists = materials.data.some((material) => String(material.id) === id);
    const departmentName = department === "assembly" ? "装配部成品" : "注塑部塑胶配件";
    throw productError(exists ? `所选商品不属于${departmentName}` : "所选金蝶商品不存在，请更新商品后重试");
  }
  return {
    productId: String(product.id),
    productNumber: String(product.number || "").trim(),
    productName: String(product.name || "").trim(),
  };
}
