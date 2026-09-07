import {
  fetchAllMaterials,
  fetchAllCustomers,
  fetchAllSuppliers,
  fetchCategories,
  fetchMaterialDetail,
  fetchOutsideMaterials,
} from "../services/kingdee.js";
import { readKingdeeCache, writeKingdeeCache } from "../services/kingdee-cache.js";
import { jwtAuth, requireAnyPermission } from "../middleware/jwt-auth.js";

const TECHNICAL_DATA_PERMISSIONS = ["basic_data", "business", "production"];
const pendingKingdeeRequests = new Map();
const FINISHED_PRODUCT_CATEGORY = "2314557705978701824";
const INJECTION_PLASTIC_PARTS_CATEGORY = "2314559979366968320";

export function getMaterialsCacheKey(category) {
  if (!category) return "materials";
  return `materials-category-${String(category).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function getQueryCacheKey(resource, query) {
  const normalized = Object.fromEntries(Object.entries(query).filter(([, value]) => value));
  if (Object.keys(normalized).length === 0) return resource;
  return `${resource}-${Buffer.from(JSON.stringify(normalized)).toString("base64url")}`;
}

function filterMaterials(materials, search) {
  const keyword = String(search || "").trim().toLowerCase();
  if (!keyword) return materials;
  return materials.filter((material) => [material.name, material.number, material.model]
    .some((value) => String(value || "").toLowerCase().includes(keyword)));
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

export function getProductionMaterialRefreshOptions(forceRefresh) {
  return {
    materials: forceRefresh,
    categories: forceRefresh,
  };
}

async function fetchAndCache(cacheKey, fetchData) {
  const pending = pendingKingdeeRequests.get(cacheKey);
  if (pending) return pending;
  const request = fetchData()
    .then((data) => {
      writeKingdeeCache(cacheKey, data);
      return data;
    })
    .finally(() => pendingKingdeeRequests.delete(cacheKey));
  pendingKingdeeRequests.set(cacheKey, request);
  return request;
}

async function getCachedKingdeeData(cacheKey, fetchData, forceRefresh) {
  const cached = readKingdeeCache(cacheKey);
  if (cached && !forceRefresh) return { ...cached, stale: false };
  try {
    const data = await fetchAndCache(cacheKey, fetchData);
    return { data, fetchedAt: readKingdeeCache(cacheKey)?.fetchedAt || null, stale: false };
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

async function respondWithCachedData(res, cacheKey, fetchData, options = {}) {
  const {
    fallback = null,
    preferFallback = false,
    forceRefresh = false,
    transformData = (data) => data,
  } = options;
  const cached = readKingdeeCache(cacheKey);
  if (cached && !forceRefresh) {
    return res.json({ ok: true, data: transformData(cached.data), stale: false, fetchedAt: cached.fetchedAt });
  }
  try {
    const data = await fetchAndCache(cacheKey, fetchData);
    const refreshed = readKingdeeCache(cacheKey);
    return res.json({ ok: true, data: transformData(data), stale: false, fetchedAt: refreshed?.fetchedAt || null });
  } catch (err) {
    const fallbackData = preferFallback
      ? fallback?.() || readKingdeeCache(cacheKey)
      : readKingdeeCache(cacheKey) || fallback?.();
    if (fallbackData) {
      console.warn(`[kingdee] ${cacheKey} using cached data:`, err.message);
      return res.json({ ok: true, data: transformData(fallbackData.data), stale: true, fetchedAt: fallbackData.fetchedAt });
    }
    console.error(`[kingdee] ${cacheKey} error:`, err);
    return res.status(503).json({ error: "金蝶资料暂时不可用，请联系管理员检查金蝶 API 凭据", detail: err.message });
  }
}

function categoriesFromMaterialsCache() {
  const materials = readKingdeeCache("materials");
  if (!materials) return null;
  const categories = new Map();
  for (const material of materials.data) {
    if (!material.parent_id || categories.has(material.parent_id)) continue;
    categories.set(material.parent_id, {
      id: material.parent_id,
      name: material.parent_name || "未分类",
      number: material.parent_number || "",
      count: 0,
    });
  }
  return { data: Array.from(categories.values()), fetchedAt: materials.fetchedAt };
}

export function registerKingdeeRoutes(app) {
  // ---- 商品资料 ----

  /**
   * GET /api/kingdee/materials
   * 获取商品列表，支持 ?search=&category=&refresh=1
   */
  app.get("/api/kingdee/materials", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search, category, refresh } = req.query;
    await respondWithCachedData(
      res,
      getMaterialsCacheKey(category),
      () => fetchAllMaterials({ categoryId: category }),
      {
        forceRefresh: refresh === "1",
        transformData: (materials) => filterMaterials(materials, search),
      }
    );
  });

  /**
   * GET /api/kingdee/production-materials
   * 生产日报商品：一次读取完整商品，再按分类树拆分成品和塑胶配件。
   */
  app.get("/api/kingdee/production-materials", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const forceRefresh = req.query.refresh === "1";
    const refreshOptions = getProductionMaterialRefreshOptions(forceRefresh);
    try {
      const [materials, categories] = await Promise.all([
        getCachedKingdeeData("materials", fetchAllMaterials, refreshOptions.materials),
        getCachedKingdeeData("categories", fetchCategories, refreshOptions.categories),
      ]);
      return res.json({
        ok: true,
        data: splitProductionMaterials(materials.data, categories.data),
        stale: materials.stale || categories.stale,
        fetchedAt: materials.fetchedAt,
      });
    } catch (error) {
      console.error("[kingdee] production materials error:", error);
      return res.status(503).json({ error: "金蝶生产商品暂时不可用，请点击更新金蝶商品后重试", detail: error.message });
    }
  });

  /**
   * GET /api/kingdee/materials/:id
   * 获取单个商品详情
   */
  app.get("/api/kingdee/materials/:id", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (_req, res) => {
    try {
      const detail = await fetchMaterialDetail(_req.params.id);
      res.json({ ok: true, data: detail });
    } catch (err) {
      console.error("[kingdee] material detail error:", err);
      res.status(500).json({ error: "获取商品详情失败", detail: err.message });
    }
  });

  /**
   * GET /api/kingdee/categories
   * 获取商品分类列表
   */
  app.get("/api/kingdee/categories", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (_req, res) => {
    await respondWithCachedData(res, "categories", fetchCategories, { fallback: categoriesFromMaterialsCache });
  });

  // ---- 客户资料 ----

  /**
   * GET /api/kingdee/customers
   * 获取客户列表，支持 ?search=
   */
  app.get("/api/kingdee/customers", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search } = req.query;
    await respondWithCachedData(res, getQueryCacheKey("customers", { search }), () => fetchAllCustomers({ search }));
  });

  // ---- 供应商资料 ----

  /**
   * GET /api/kingdee/suppliers
   * 获取供应商列表，支持 ?search=
   */
  app.get("/api/kingdee/suppliers", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search } = req.query;
    await respondWithCachedData(res, getQueryCacheKey("suppliers", { search }), () => fetchAllSuppliers({ search }));
  });

  /** 外部商品库 — 客户商品资料 */
  app.get("/api/kingdee/outside-materials", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search, type } = req.query;
    await respondWithCachedData(res, getQueryCacheKey("outsideMaterials", { search, type }), () => fetchOutsideMaterials({ search, type }));
  });
}
