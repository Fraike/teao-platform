import express from "express";
import cron from "node-cron";
import { PORT, readConfig, formatShanghaiDate, isRestDay, getLastWorkingDay } from "./config.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerProductionRoutes } from "./routes/production.js";
import { initDefaultAdmin } from "./services/users.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { initEmployeeData } from "./services/employees.js";
import { registerEmployeeRoutes } from "./routes/employees.js";
import { registerKingdeeRoutes } from "./routes/kingdee.js";
import { registerProductionEntryRoutes } from "./routes/production-entry.js";
import { registerProductionEntryInjectionRoutes } from "./routes/production-entry-injection.js";
import { registerQuotationRoutes } from "./routes/quotations.js";
import { fetchAndStoreReport, hasProductionData, buildWecomContent } from "./services/report.js";
import { sendWecomMessage } from "./services/wecom.js";

const app = express();
app.use(express.json({ limit: "20mb" }));

// ---- routes ----

registerHistoryRoutes(app);
registerQuotationRoutes(app);
registerProductionRoutes(app);
registerAuthRoutes(app);
registerAdminRoutes(app);
registerEmployeeRoutes(app);
registerKingdeeRoutes(app);
registerProductionEntryRoutes(app);
registerProductionEntryInjectionRoutes(app);

// ---- cron: daily push ----

let cronTask = null;

function setupCron() {
  const config = readConfig();
  if (cronTask) cronTask.stop();

  if (!config.enabled) {
    console.log("[production] cron disabled");
    return;
  }

  if (!cron.validate(config.cronExpression)) {
    console.error(`[production] invalid cron: ${config.cronExpression}`);
    return;
  }

  cronTask = cron.schedule(config.cronExpression, async () => {
    const today = formatShanghaiDate();
    console.log(`[production] cron: triggered at ${today}`);

    if (isRestDay(today, config)) {
      console.log(`[production] cron: ${today} is rest day, skipped`);
      return;
    }

    const date = getLastWorkingDay(today, config);
    console.log(`[production] cron: fetching report for last working day ${date}`);

    try {
      const report = await fetchAndStoreReport(date);
      if (hasProductionData(report)) {
        const content = buildWecomContent(date, report.assembly, report.injection);
        await sendWecomMessage(config.wecomWebhook, content);
        console.log(`[production] cron: sent report for ${date}`);
      } else {
        console.log(`[production] cron: no data for ${date}, skipped`);
      }
    } catch (err) {
      console.error(`[production] cron error: ${err.message}`);
    }
  }, { timezone: "Asia/Shanghai" });

  console.log(`[production] cron scheduled: ${config.cronExpression} (Asia/Shanghai)`);
}

// ---- start ----

(async () => {
  try {
    await initDefaultAdmin();
    await initEmployeeData();
  } catch (err) {
    console.error(`[startup] ${err.message}`);
    process.exit(1);
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`teao-api running on port ${PORT}`);
    setupCron();
  });
})();
