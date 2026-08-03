import { adminAuth, jwtAuth, requirePermission } from "../middleware/jwt-auth.js";
import { readConfig, writeConfig, formatShanghaiDate, readReport } from "../config.js";
import { fetchAndStoreReport, hasProductionData, buildWecomContent, buildEmptyContent } from "../services/report.js";
import { sendWecomMessage } from "../services/wecom.js";

export function registerProductionRoutes(app) {
  // Get config (masks sensitive fields)
  app.get("/api/production/config", jwtAuth, requirePermission("production"), (_req, res) => {
    const config = readConfig();
    res.json({
      enabled: config.enabled,
      cronExpression: config.cronExpression,
      hasToken: !!config.vikaToken,
      hasAssemblyId: !!config.assemblyDatasheetId,
      hasInjectionId: !!config.injectionDatasheetId,
      hasWebhook: !!config.wecomWebhook,
      configured: !!(config.vikaToken && config.assemblyDatasheetId && config.injectionDatasheetId && config.wecomWebhook),
    });
  });

  // Save config
  app.post("/api/production/config", jwtAuth, adminAuth, (req, res) => {
    const config = readConfig();
    const updates = req.body;
    const fields = [
      "vikaToken", "assemblyDatasheetId", "assemblyViewId",
      "injectionDatasheetId", "injectionViewId",
      "wecomWebhook", "cronExpression", "enabled",
      "restDays", "makeupWorkdays",
    ];
    for (const f of fields) {
      if (updates[f] !== undefined) config[f] = updates[f];
    }
    writeConfig(config);
    res.json({ ok: true });
  });

  // Fetch & store report for a date
  app.post("/api/production/fetch", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      const date = req.query.date || formatShanghaiDate();
      const report = await fetchAndStoreReport(date);
      res.json({
        ok: true,
        date,
        assembly: { summary: report.assembly.summary, rawCount: report.assembly.rawCount },
        injection: { summary: report.injection.summary, rawCount: report.injection.rawCount },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get stored report
  app.get("/api/production/report", jwtAuth, requirePermission("production"), (req, res) => {
    const date = req.query.date || formatShanghaiDate();
    const report = readReport(date);
    if (!report) return res.json({ exists: false, date });
    res.json({ exists: true, ...report });
  });

  // Manually send WeCom message for a date
  app.post("/api/production/send", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      const date = req.query.date || formatShanghaiDate();
      let report = readReport(date);
      if (!report) {
        report = await fetchAndStoreReport(date);
      }
      const config = readConfig();
      if (!config.wecomWebhook) throw new Error("未配置企微 Webhook");
      const content = hasProductionData(report)
        ? buildWecomContent(date, report.assembly, report.injection)
        : buildEmptyContent(date);
      await sendWecomMessage(config.wecomWebhook, content);
      res.json({ ok: true, date, message: "已推送到企业微信群" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Preview WeCom message content (without sending)
  app.post("/api/production/preview", jwtAuth, requirePermission("production"), async (req, res) => {
    try {
      const date = req.query.date || formatShanghaiDate();
      let report = readReport(date);
      if (!report) {
        report = await fetchAndStoreReport(date);
      }
      const content = hasProductionData(report)
        ? buildWecomContent(date, report.assembly, report.injection)
        : buildEmptyContent(date);
      res.json({ ok: true, date, content, hasData: hasProductionData(report) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
