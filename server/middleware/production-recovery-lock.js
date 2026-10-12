export function productionRecoveryLock(req, res, next) {
  if (process.env.PRODUCTION_RECOVERY_READ_ONLY === "1" &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      /^\/api\/production\/(entries|injection\/entries)(\/|$)/i.test(req.path)) {
    return res.status(503).json({ error: "生产日报恢复期间暂时只读，请稍后重试" });
  }
  return next();
}
