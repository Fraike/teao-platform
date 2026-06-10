import jwt from "jsonwebtoken";

export function jwtAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

export function adminAuth(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "无权限" });
  }
  next();
}
