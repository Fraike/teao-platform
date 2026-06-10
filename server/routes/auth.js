import { registerUser, loginUser, getUserById, refreshToken } from "../services/users.js";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";

const loginLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxAttempts: 10, keyPrefix: "login" });

export function registerAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "请输入用户名和密码" });
    }
    const result = await loginUser({ username, password });
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
