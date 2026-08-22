import { jwtAuth, requirePermission } from "../middleware/jwt-auth.js";
import { initDB, queryInjectionEntries, createInjectionEntry, updateInjectionEntry, deleteInjectionEntry, replaceInjectionEntries, exportInjectionEntries, getHistory } from "../services/production-store.js";

initDB();

export function registerProductionEntryInjectionRoutes(app) {
  app.get("/api/production/injection/entries", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const { dateFrom, dateTo, machine, product, search, limit, offset } = req.query;
      const result = queryInjectionEntries({
        dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
        machine: machine || undefined, product: product || undefined,
        search: search || undefined,
        limit: limit ? parseInt(limit, 10) : 10, offset: offset ? parseInt(offset, 10) : 0,
      });
      res.json({ ok: true, data: result });
    } catch (err) { res.status(500).json({ error: "查询失败", detail: err.message }); }
  });

  app.post("/api/production/injection/entries", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const entry = createInjectionEntry(req.body, user);
      res.status(201).json({ ok: true, data: entry });
    } catch (err) { res.status(500).json({ error: "新增失败", detail: err.message }); }
  });

  app.post("/api/production/injection/entries/import", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const result = replaceInjectionEntries(req.body?.records, user);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[production-entry] injection import error:", err);
      res.status(err.status || 500).json({ error: err.message || "导入失败" });
    }
  });

  app.get("/api/production/injection/entries/export", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const { dateFrom, dateTo, machine, product, search } = req.query;
      res.json({ ok: true, data: exportInjectionEntries({ dateFrom, dateTo, machine, product, search }) });
    } catch (err) {
      res.status(500).json({ error: "导出数据查询失败", detail: err.message });
    }
  });

  app.put("/api/production/injection/entries/:id", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const entry = updateInjectionEntry(parseInt(req.params.id, 10), req.body, user);
      if (!entry) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true, data: entry });
    } catch (err) { res.status(500).json({ error: "更新失败", detail: err.message }); }
  });

  app.delete("/api/production/injection/entries/:id", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const ok = deleteInjectionEntry(parseInt(req.params.id, 10), user);
      if (!ok) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: "删除失败", detail: err.message }); }
  });

  app.get("/api/production/injection/entries/:id/history", jwtAuth, requirePermission("production"), (req, res) => {
    try {
      const history = getHistory("injection", parseInt(req.params.id, 10));
      res.json({ ok: true, data: history });
    } catch (err) { res.status(500).json({ error: "查询历史失败", detail: err.message }); }
  });
}
