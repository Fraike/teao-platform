import { jwtAuth, requirePermission } from "../middleware/jwt-auth.js";
import {
  initQuotationDB,
  listQuotations,
  getQuotation,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  migrateLegacyHistory,
} from "../services/quotation-store.js";
import { readData } from "../config.js";
import { getUserById } from "../services/users.js";

initQuotationDB();
const migratedCount = migrateLegacyHistory(readData());
if (migratedCount > 0) console.log(`[quotations] migrated ${migratedCount} legacy history records`);

function canAccessQuotation(quotation, user) {
  return user?.role === "admin" || quotation?.createdBy === user?.username;
}

export function registerQuotationRoutes(app) {
  app.get("/api/quotations", jwtAuth, requirePermission("business"), (req, res) => {
    try {
      const createdBy = req.user?.role === "admin" ? "" : req.user?.username || "__no_access__";
      res.json({ ok: true, ...listQuotations({ ...req.query, createdBy }) });
    } catch (err) {
      console.error("[quotations] list error:", err);
      res.status(500).json({ error: "报价查询失败" });
    }
  });

  app.get("/api/quotations/:id", jwtAuth, requirePermission("business"), (req, res) => {
    try {
      const quotation = getQuotation(req.params.id);
      if (!quotation || !canAccessQuotation(quotation, req.user)) return res.status(404).json({ error: "报价记录不存在" });
      res.json({ ok: true, data: quotation });
    } catch (err) {
      console.error("[quotations] get error:", err);
      res.status(500).json({ error: "报价读取失败" });
    }
  });

  app.post("/api/quotations", jwtAuth, requirePermission("business"), (req, res) => {
    try {
      const currentUser = getUserById(req.user?.id);
      const quotation = createQuotation(req.body, {
        username: req.user?.username,
        actualQuoterName: currentUser?.name || req.user?.username || "",
      });
      res.status(201).json({ ok: true, data: quotation });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "报价提交失败" });
    }
  });

  app.put("/api/quotations/:id", jwtAuth, requirePermission("business"), (req, res) => {
    try {
      const existing = getQuotation(req.params.id);
      if (!existing || !canAccessQuotation(existing, req.user)) return res.status(404).json({ error: "报价记录不存在" });
      const quotation = updateQuotation(req.params.id, req.body, req.user?.username);
      if (!quotation) return res.status(404).json({ error: "报价记录不存在" });
      res.json({ ok: true, data: quotation });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "报价更新失败" });
    }
  });

  app.delete("/api/quotations/:id", jwtAuth, requirePermission("business"), (req, res) => {
    try {
      const existing = getQuotation(req.params.id);
      if (!existing || !canAccessQuotation(existing, req.user)) return res.status(404).json({ error: "报价记录不存在" });
      const deleted = deleteQuotation(req.params.id, req.user?.username);
      if (!deleted) return res.status(404).json({ error: "报价记录不存在" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[quotations] delete error:", err);
      res.status(500).json({ error: "报价删除失败" });
    }
  });
}
