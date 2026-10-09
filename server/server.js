import express from "express";
import cron from "node-cron";
import { PORT } from "./config.js";
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
import { createProductionScheduler } from "./services/production-report-scheduler.js";
import { productionQueryMetrics } from "./middleware/request-metrics.js";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(productionQueryMetrics);

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

const productionScheduler = createProductionScheduler(cron);

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
  });
})();
