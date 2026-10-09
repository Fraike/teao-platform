import { jwtAuth, requirePermission } from "../middleware/jwt-auth.js";
import {
  initDB,
  getDB,
  queryEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  replaceAssemblyEntries,
  exportAssemblyEntries,
  getHistory,
} from "../services/production-store.js";
import { getTrustedProductionProduct } from "../services/production-product.js";
import {
  createProductionActorResolver,
  getProductionActorName,
  mapProductionHistoryActors,
  mapProductionQueryActors,
  mapProductionRecordActors,
} from "../services/production-actors.js";

// 确保数据库已初始化
initDB();

export function registerProductionEntryRoutes(app) {
  // 获取产线列表
  app.get("/api/production/lines", jwtAuth, requirePermission("production"), (_req, res) => {
    try {
      const db = getDB();
      const rows = db.prepare("SELECT DISTINCT line FROM assembly_records WHERE line != '' ORDER BY line").all();
      res.json({ ok: true, data: rows.map((r) => r.line) });
    } catch (err) {
      res.status(500).json({ error: "查询失败", detail: err.message });
    }
  });

  // 查询列表（按日期分组）
  app.get("/api/production/entries", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const { dateFrom, dateTo, line, product, customer, search, limit, offset } = req.query;
      const result = queryEntries({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        line: line || undefined,
        product: product || undefined,
        customer: customer || undefined,
        search: search || undefined,
        limit: limit ? parseInt(limit, 10) : 10,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      res.json({ ok: true, data: mapProductionQueryActors(result) });
    } catch (err) {
      console.error("[production-entry] query error:", err);
      res.status(500).json({ error: "查询失败", detail: err.message });
    }
  });

  // 新增
  app.post("/api/production/entries", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const resolveActor = createProductionActorResolver();
      const user = getProductionActorName(req.user, resolveActor);
      const product = getTrustedProductionProduct("assembly", req.body?.productId);
      const entry = createEntry({ ...req.body, ...product }, user);
      res.status(201).json({ ok: true, data: mapProductionRecordActors(entry, resolveActor) });
    } catch (err) {
      console.error("[production-entry] create error:", err);
      res.status(err.status || 500).json({ error: err.message || "新增失败" });
    }
  });

  app.post("/api/production/entries/import", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const resolveActor = createProductionActorResolver();
      const user = getProductionActorName(req.user, resolveActor);
      const result = replaceAssemblyEntries(req.body?.records, user);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[production-entry] import error:", err);
      res.status(err.status || 500).json({ error: err.message || "导入失败" });
    }
  });

  app.get("/api/production/entries/export", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const { dateFrom, dateTo, line, product, customer, search } = req.query;
      const result = exportAssemblyEntries({ dateFrom, dateTo, line, product, customer, search });
      res.json({ ok: true, data: mapProductionQueryActors(result) });
    } catch (err) {
      res.status(500).json({ error: "导出数据查询失败", detail: err.message });
    }
  });

  // 更新
  app.put("/api/production/entries/:id", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const resolveActor = createProductionActorResolver();
      const user = getProductionActorName(req.user, resolveActor);
      const entry = updateEntry(parseInt(req.params.id, 10), req.body, user);
      if (!entry) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true, data: mapProductionRecordActors(entry, resolveActor) });
    } catch (err) {
      console.error("[production-entry] update error:", err);
      res.status(500).json({ error: "更新失败", detail: err.message });
    }
  });

  // 删除
  app.delete("/api/production/entries/:id", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const resolveActor = createProductionActorResolver();
      const user = getProductionActorName(req.user, resolveActor);
      const ok = deleteEntry(parseInt(req.params.id, 10), user);
      if (!ok) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[production-entry] delete error:", err);
      res.status(500).json({ error: "删除失败", detail: err.message });
    }
  });

  // 修改历史
  app.get("/api/production/entries/:id/history", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const history = getHistory("assembly", parseInt(req.params.id, 10));
      const resolveActor = createProductionActorResolver();
      res.json({ ok: true, data: mapProductionHistoryActors(history, resolveActor) });
    } catch (err) {
      console.error("[production-entry] history error:", err);
      res.status(500).json({ error: "查询历史失败", detail: err.message });
    }
  });
}
