import express from "express";
import cron from "node-cron";
import { PORT, readConfig } from "./config.js";
import { getDB as getStandardDB } from "./services/standard-store.js";
import { createPublicationWorker } from "./services/standard-publication-outbox.js";
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
import { registerStandardRoutes } from "./routes/standards.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { createProductionScheduler } from "./services/production-report-scheduler.js";
import { createStandardReviewReminders } from "./services/standard-review-reminders.js";
import { productionQueryMetrics } from "./middleware/request-metrics.js";
import { productionRecoveryLock } from "./middleware/production-recovery-lock.js";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(productionQueryMetrics);
app.use(productionRecoveryLock);
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "teao-api" }));

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
registerStandardRoutes(app);
registerNotificationRoutes(app);
registerFeedbackRoutes(app);

// ---- cron: daily push ----

const productionScheduler = createProductionScheduler(cron);
const standardReviewReminders = createStandardReviewReminders();
const standardPublicationWorker = createPublicationWorker(getStandardDB(), readConfig);

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
    productionScheduler.start();
    if (process.env.STANDARD_REVIEW_REMINDERS_ENABLED === "true") standardReviewReminders.start(cron);
    else console.log("[standards-reminder] 定时催审未启用，需显式设置 STANDARD_REVIEW_REMINDERS_ENABLED=true");
    standardPublicationWorker.start(cron);
  });
})();
