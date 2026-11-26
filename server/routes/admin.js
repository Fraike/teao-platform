import { listUsers, approveUser, rejectUser, disableUser, resetUserPassword, setUserPermission, setUserWecomUserid, reviewUserPasswordRecovery, getPendingWecomSuggestion, previewUserWecomImport, importUserWecomDirectory } from "../services/users.js";
import { organizationStore } from './organization.ts';
import { listEmployees } from '../services/employees.js';
import { jwtAuth, adminAuth } from "../middleware/jwt-auth.js";

export function registerAdminRoutes(app) {
  app.post("/api/admin/users/:id/password-recovery/review", jwtAuth, adminAuth, async (req, res) => {
    try {
      const result = await reviewUserPasswordRecovery(req.params.id, req.body || {}, req.user.id);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "审核失败，请稍后重试" });
    }
  });
  app.get("/api/admin/users", jwtAuth, adminAuth, (_req, res) => {
    res.json(listUsers());
  });
  app.post("/api/admin/users/:id/disable", jwtAuth, adminAuth, async (req, res) => {
    try {
      const result = await disableUser(req.user.id, req.params.id);
      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result);
    } catch {
      res.status(500).json({ error: "停用账号失败，请稍后重试" });
    }
  });

  const directoryHandler = action => async (req, res) => {
    try { res.json({ ok: true, data: await action(req.body) }); }
    catch (error) {
      const status = [400, 409].includes(error.status) ? error.status : 500;
      res.status(status).json({ error: status === 500 ? '通讯录处理失败，请稍后重试' : error.message });
    }
  };
  app.post("/api/admin/wecom-directory/preview", jwtAuth, adminAuth,
    directoryHandler(body => previewUserWecomImport(body?.members, listEmployees(), organizationStore().confirmedLinks())));
  app.put("/api/admin/wecom-directory", jwtAuth, adminAuth,
    directoryHandler(body => importUserWecomDirectory(body?.members, listEmployees, organizationStore().confirmedLinks, body?.bindingRevision)));

  app.get("/api/admin/users/:id/wecom-suggestion", jwtAuth, adminAuth, (req, res) => {
    try {
      const result = getPendingWecomSuggestion(req.params.id, organizationStore().confirmedLinks());
      if (result.error) return res.status(400).json({ error: result.error });
      res.json({ ok: true, data: result });
    } catch { res.status(500).json({ error: '通讯录读取失败，请稍后重试' }); }
  });

  app.post("/api/admin/users/:id/approve", jwtAuth, adminAuth, async (req, res) => {
    const result = await approveUser(req.params.id, req.body?.wecomUserid);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/users/:id/reject", jwtAuth, adminAuth, async (req, res) => {
    const result = await rejectUser(req.params.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  app.put("/api/admin/users/:id/permissions", jwtAuth, adminAuth, async (req, res) => {
    const { permission, enabled } = req.body;
    if (!permission || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "参数错误" });
    }
    if (permission === "engineering_maintain") return res.status(400).json({ error: "请在系统设置的临时校对模式中管理免审核人员" });
    const result = await setUserPermission(req.params.id, permission, enabled);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  });

  app.post("/api/admin/users/:id/reset-password", jwtAuth, adminAuth, async (req, res) => {
    const { newPassword } = req.body || {};
    const result = await resetUserPassword(req.params.id, newPassword);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  app.put("/api/admin/users/:id/wecom", jwtAuth, adminAuth, async (req, res) => {
    const { wecomUserid } = req.body || {};
    if (typeof wecomUserid !== "string") {
      return res.status(400).json({ error: "参数错误" });
    }
    const result = await setUserWecomUserid(req.params.id, wecomUserid);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  });
}
