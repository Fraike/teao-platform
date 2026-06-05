import { PASSWORD } from "../config.js";

export function auth(req, res, next) {
  const pw = req.headers["x-auth-password"];
  if (pw !== PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
