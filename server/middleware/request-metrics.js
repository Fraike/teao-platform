const QUERY_PATHS = new Set([
  "/api/production/report",
  "/api/production/report/records",
  "/api/production/entries",
  "/api/production/injection/entries",
  "/api/quotations",
  "/api/kingdee/materials",
  "/api/kingdee/production-materials",
  "/api/kingdee/outside-materials",
  "/api/kingdee/customers",
  "/api/kingdee/suppliers",
]);

export function productionQueryMetrics(req, res, next) {
  if (req.method !== "GET" || !QUERY_PATHS.has(req.path)) return next();
  const startedAt = performance.now();
  res.once("finish", () => {
    console.info(JSON.stringify({
      event: "api_query",
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
      error: res.statusCode >= 400,
    }));
  });
  next();
}
