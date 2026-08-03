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

async function respondWithCachedData(res, cacheKey, fetchData, fallback = null, preferFallback = false) {
  try {
    const data = await fetchData();
    writeKingdeeCache(cacheKey, data);
    return res.json({ ok: true, data, stale: false });
  } catch (err) {
    const cached = preferFallback
      ? fallback?.() || readKingdeeCache(cacheKey)
      : readKingdeeCache(cacheKey) || fallback?.();
    if (cached) {
      console.warn(`[kingdee] ${cacheKey} using cached data:`, err.message);
      return res.json({ ok: true, data: cached.data, stale: true, fetchedAt: cached.fetchedAt });
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

function filteredMaterialsCache(search, categoryId) {
  const cached = readKingdeeCache("materials");
  if (!cached) return null;
  const keyword = String(search || "").trim().toLowerCase();
  return {
    fetchedAt: cached.fetchedAt,
    data: cached.data.filter((material) => {
      if (categoryId && material.parent_id !== categoryId) return false;
      if (!keyword) return true;
      return [material.name, material.number, material.model]
        .some((value) => String(value || "").toLowerCase().includes(keyword));
    }),
  };
}

export function registerKingdeeRoutes(app) {
  // ---- 商品资料 ----

  /**
   * GET /api/kingdee/materials
   * 获取商品列表，支持 ?search=&category=
   */
  app.get("/api/kingdee/materials", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search, category } = req.query;
    await respondWithCachedData(
      res,
      "materials",
      () => fetchAllMaterials({ search, categoryId: category }),
      () => filteredMaterialsCache(search, category),
      true
    );
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
    await respondWithCachedData(res, "categories", fetchCategories, categoriesFromMaterialsCache);
  });

  // ---- 客户资料 ----

  /**
   * GET /api/kingdee/customers
   * 获取客户列表，支持 ?search=
   */
  app.get("/api/kingdee/customers", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search } = req.query;
    await respondWithCachedData(res, "customers", () => fetchAllCustomers({ search }));
  });

  // ---- 供应商资料 ----

  /**
   * GET /api/kingdee/suppliers
   * 获取供应商列表，支持 ?search=
   */
  app.get("/api/kingdee/suppliers", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search } = req.query;
    await respondWithCachedData(res, "suppliers", () => fetchAllSuppliers({ search }));
  });

  /** 外部商品库 — 客户商品资料 */
  app.get("/api/kingdee/outside-materials", jwtAuth, requireAnyPermission(TECHNICAL_DATA_PERMISSIONS), async (req, res) => {
    const { search, type } = req.query;
    await respondWithCachedData(res, "outsideMaterials", () => fetchOutsideMaterials({ search, type }));
  });
}
