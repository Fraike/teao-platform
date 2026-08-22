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
      res.json({ ok: true, data: result });
    } catch (err) {
      console.error("[production-entry] query error:", err);
      res.status(500).json({ error: "查询失败", detail: err.message });
    }
  });

  // 新增
  app.post("/api/production/entries", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const entry = createEntry(req.body, user);
      res.status(201).json({ ok: true, data: entry });
    } catch (err) {
      console.error("[production-entry] create error:", err);
      res.status(500).json({ error: "新增失败", detail: err.message });
    }
  });

  app.post("/api/production/entries/import", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
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
      res.json({ ok: true, data: exportAssemblyEntries({ dateFrom, dateTo, line, product, customer, search }) });
    } catch (err) {
      res.status(500).json({ error: "导出数据查询失败", detail: err.message });
    }
  });

  // 更新
  app.put("/api/production/entries/:id", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const entry = updateEntry(parseInt(req.params.id, 10), req.body, user);
      if (!entry) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true, data: entry });
    } catch (err) {
      console.error("[production-entry] update error:", err);
      res.status(500).json({ error: "更新失败", detail: err.message });
    }
  });

  // 删除
  app.delete("/api/production/entries/:id", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
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
      res.json({ ok: true, data: history });
    } catch (err) {
      console.error("[production-entry] history error:", err);
      res.status(500).json({ error: "查询历史失败", detail: err.message });
    }
  });
}
