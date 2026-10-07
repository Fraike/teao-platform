import { adminAuth, jwtAuth, requirePermission } from "../middleware/jwt-auth.js";
import { readConfig, formatShanghaiDate } from "../config.js";
import {
  getProductionReport,
  getProductionReportRange,
  getProductionReportRecords,
  previewProductionReport,
  sendProductionReport,
  updateProductionConfig,
  isProductionSourceReady,
} from "../services/production-report-control.js";

function respondError(res, error) {
  res.status(error.status || 500).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
}

const requestDate = (req) => req.query.date ?? formatShanghaiDate();
const requestActor = (req) => req.user?.id || "user";
const requestRange = (req) => {
  if (req.query.date !== undefined && req.query.dateFrom === undefined && req.query.dateTo === undefined) {
    return { dateFrom: req.query.date, dateTo: req.query.date };
  }
  if (req.query.dateFrom === undefined && req.query.dateTo === undefined) {
    const date = formatShanghaiDate();
    return { dateFrom: date, dateTo: date };
  }
  return { dateFrom: req.query.dateFrom, dateTo: req.query.dateTo };
};

export function registerProductionRoutes(app) {
  // Get config (masks sensitive fields)
  app.get("/api/production/config", jwtAuth, requirePermission("production"), (_req, res) => {
    try {
      const config = readConfig();
      res.json({
        enabled: config.enabled,
        dataSource: "internal",
        cronExpression: config.cronExpression,
        hasWebhook: !!config.wecomWebhook,
        configured: !!config.wecomWebhook && isProductionSourceReady(config),
      });
    } catch (error) { respondError(res, error); }
  });

  // Save config
  app.post("/api/production/config", jwtAuth, adminAuth, async (req, res) => {
    try {
      res.json(await updateProductionConfig(req.body, requestActor(req)));
    } catch (error) { respondError(res, error); }
  });

  // Fetch & store report for a date
  app.post("/api/production/fetch", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      const date = requestDate(req);
      const report = await getProductionReport(date, requestActor(req));
      res.json({
        ok: true,
        date,
        dataSource: report.dataSource,
        generatedAt: report.generatedAt,
        missingDepartments: report.missingDepartments,
        assembly: { summary: report.assembly.summary, rawCount: report.assembly.rawCount },
        injection: { summary: report.injection.summary, rawCount: report.injection.rawCount },
      });
    } catch (err) {
      respondError(res, err);
    }
  });

  // Always regenerate from the selected source, including empty reports.
  app.get("/api/production/report", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      const { dateFrom, dateTo } = requestRange(req);
      res.json(await getProductionReportRange(dateFrom, dateTo, requestActor(req)));
    } catch (error) { respondError(res, error); }
  });

  app.get("/api/production/report/records", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      const { dateFrom, dateTo } = requestRange(req);
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      const pageSize = req.query.pageSize === undefined ? 50 : Number(req.query.pageSize);
      res.json(await getProductionReportRecords(req.query.department, dateFrom, dateTo, page, pageSize));
    } catch (error) { respondError(res, error); }
  });

  // Manually send WeCom message for a date
  app.post("/api/production/send", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      if (req.body?.confirmRepeat !== undefined && typeof req.body.confirmRepeat !== "boolean") {
        return res.status(400).json({ error: "confirmRepeat 必须是布尔值" });
      }
      res.json(await sendProductionReport(requestDate(req), { confirmRepeat: req.body?.confirmRepeat === true, actor: requestActor(req) }));
    } catch (err) {
      respondError(res, err);
    }
  });

  // Preview WeCom message content (without sending)
  app.post("/api/production/preview", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      res.json(await previewProductionReport(requestDate(req), requestActor(req)));
    } catch (err) {
      respondError(res, err);
    }
  });
}
