import { registerUser, loginUser, getUserById, refreshToken, recoverAdminPassword, changeAdminPassword, requestUserPasswordRecovery } from "../services/users.js";
import { jwtAuth, adminAuth } from "../middleware/jwt-auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { createHash } from "node:crypto";

const loginLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxAttempts: 10, keyPrefix: "login" });
const recoveryLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 5, keyPrefix: "admin-recovery" });
const userRecoveryLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 5, keyPrefix: "user-recovery" });
const userRecoveryIpLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 30, keyPrefix: "user-recovery-ip" });

export function registerAuthRoutes(app) {
  app.post("/api/auth/recover-password", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
    const nameKey = createHash("sha256").update(name).digest("hex");
    if (userRecoveryIpLimiter.recordFailure(req) || userRecoveryLimiter.recordFailure({ ip: nameKey })) return res.status(429).json({ error: "申请次数过多，请15分钟后再试" });
    try {
      const result = await requestUserPasswordRecovery(req.body || {});
      if (result.error) return res.status(400).json({ error: result.error });
      res.json({ ok: true, message: "申请已提交，管理员审核通过后请使用新密码登录" });
    } catch {
      res.status(500).json({ error: "申请提交失败，请稍后重试" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    const { username, password, rememberLogin } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "请输入用户名和密码" });
    }
    const result = await loginUser({ username, password, rememberLogin: rememberLogin === true });
    if (result.error) {
      // Only count actual auth failures (not missing fields)
      if (result.error === "用户名或密码错误") {
        const limited = loginLimiter.recordFailure(req);
        if (limited) {
          return res.status(429).json({ error: "登录尝试次数过多，请5分钟后再试" });
        }
      }
      return res.status(401).json({ error: result.error });
    }
    loginLimiter.clear(req);
    res.json(result);
  });

  app.post("/api/auth/register", async (req, res) => {
    const { name, username, password } = req.body || {};
    if (!name || !username || !password) {
      return res.status(400).json({ error: "请填写完整信息" });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: "用户名需要 2-20 个字符" });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: "用户名只能包含字母、数字和下划线" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "密码至少 6 位" });
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ error: "密码必须同时包含字母和数字" });
    }
    const result = await registerUser({ name, username, password });
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, message: "申请已提交，等待管理员审核" });
  });

  app.post("/api/auth/admin-recover-password", async (req, res) => {
    const { username, recoveryCode, newPassword } = req.body || {};
    const result = await recoverAdminPassword({ username, recoveryCode, newPassword });
    if (result.error) {
      const limited = recoveryLimiter.recordFailure(req);
      if (limited) return res.status(429).json({ error: "尝试次数过多，请15分钟后再试" });
      return res.status(400).json({ error: "管理员恢复信息无效" });
    }
    recoveryLimiter.clear(req);
    res.json({ ok: true });
  });

  app.post("/api/auth/change-password", jwtAuth, adminAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const result = await changeAdminPassword({
      userId: req.user.id,
      currentPassword,
      newPassword,
      rememberLogin: req.user.rememberLogin === true,
      sessionStartedAt: req.user.sessionStartedAt ?? req.user.iat,
      sessionExpiresAt: req.user.sessionExpiresAt ?? req.user.exp,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.get("/api/auth/me", jwtAuth, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }
    res.json(user);
  });

  app.post("/api/auth/refresh", async (req, res) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "未登录" });
    }
    const token = header.slice(7);
    const result = refreshToken(token);
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });
}
