import express from "express";
import cron from "node-cron";
import { PORT, readConfig, formatShanghaiDate, isRestDay, getLastWorkingDay } from "./config.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerProductionRoutes } from "./routes/production.js";
import { fetchAndStoreReport, hasProductionData, buildWecomContent } from "./services/report.js";
import { sendWecomMessage } from "./services/wecom.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

// ---- routes ----

registerHistoryRoutes(app);
registerProductionRoutes(app);

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

app.listen(PORT, "127.0.0.1", () => {
  console.log(`teao-api running on port ${PORT}`);
  setupCron();
});
