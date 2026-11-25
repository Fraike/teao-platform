import express from "express";
import { registerProductRoutes } from "./routes/products.ts";
import cron from "node-cron";
import { PORT, readConfig } from "./config.js";
import { getDB as getStandardDB } from "./services/standard-store.js";
import { createPublicationWorker } from "./services/standard-publication-outbox.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerAssemblySchedulingRoutes } from "./routes/assembly-scheduling.ts";
import { generateScheduledDraft } from "./services/assembly-scheduling.ts";
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
import { registerOrganizationRoutes } from "./routes/organization.ts";
import { registerEngineeringChangeRoutes } from "./routes/engineering-changes.ts";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerSystemSettingsRoutes } from "./routes/system-settings.js";
import { registerCustomerAccountRoutes } from "./routes/customer-system-accounts.ts";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { createProductionScheduler } from "./services/production-report-scheduler.js";
import { createStandardReviewReminders } from "./services/standard-review-reminders.js";
import { productionQueryMetrics } from "./middleware/request-metrics.js";
import { productionRecoveryLock } from "./middleware/production-recovery-lock.js";

const app = express();
const assemblySchedulingAvailable = process.env.NODE_ENV === "development";
registerCustomerAccountRoutes(app);
// Warehouse confirmation can include two base64-encoded 8 MB files.
app.post("/api/engineering-changes/:id/actions", express.json({ limit: "24mb" }));
app.use(express.json({ limit: "20mb" }));
app.use(productionQueryMetrics);
app.use(productionRecoveryLock);
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "teao-api" }));

// ---- routes ----

registerHistoryRoutes(app);
registerQuotationRoutes(app);
registerProductionRoutes(app);
if (assemblySchedulingAvailable) registerAssemblySchedulingRoutes(app);
registerAuthRoutes(app);
registerAdminRoutes(app);
registerEmployeeRoutes(app);
registerKingdeeRoutes(app);
registerProductionEntryRoutes(app);
registerProductionEntryInjectionRoutes(app);
registerStandardRoutes(app);
registerNotificationRoutes(app);
const engineeringChangeWorker = registerEngineeringChangeRoutes(app);
registerOrganizationRoutes(app);
registerFeedbackRoutes(app);
registerSystemSettingsRoutes(app);
const productServices = registerProductRoutes(app);

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

  app.listen(PORT, "127.0.0.1", (error) => {
    if (error) {
      console.error(`[startup] ${error.code || "LISTEN_FAILED"}`);
      process.exit(1);
    }
    console.log(`teao-api running on port ${PORT}`);
    productionScheduler.start();
    if (assemblySchedulingAvailable) {
      cron.schedule("* * * * *", () => {
        try { generateScheduledDraft(); }
        catch { console.error("[assembly-scheduling] 次日草案生成失败"); }
      });
    }
    productServices.start(cron);
    standardReviewReminders.start(cron);
    standardPublicationWorker.start(cron);
    engineeringChangeWorker.wake();
    cron.schedule("* * * * *", engineeringChangeWorker.wake);
  });
})();
