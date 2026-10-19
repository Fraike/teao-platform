import { listUsers, approveUser, rejectUser, resetUserPassword, setUserPermission, setUserWecomUserid, reviewUserPasswordRecovery } from "../services/users.js";
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

  app.post("/api/admin/users/:id/approve", jwtAuth, adminAuth, async (req, res) => {
    const result = await approveUser(req.params.id);
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
