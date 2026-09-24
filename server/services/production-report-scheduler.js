import { readConfig, onProductionConfigChange, formatShanghaiDate, isRestDay, getLastWorkingDay } from "../config.js";
import { sendProductionReport } from "./production-report-control.js";

export function createProductionScheduler(cron, send = sendProductionReport, todayDate = formatShanghaiDate) {
  let task = null;
  let unsubscribe = null;
  async function callback() {
    try {
      const config = readConfig();
      const today = todayDate();
      if (!config.enabled || isRestDay(today, config)) return;
      const date = getLastWorkingDay(today, config);
      const result = await send(date, { automatic: true });
      console.log(`[production] cron: ${date} ${result.status}`);
    } catch (error) {
      console.error(`[production] cron: ${error.code || "FAILED"}`);
    }
  }
  function rebuild() {
    if (task) task.stop();
    task = null;
    try {
      const config = readConfig();
      if (config.enabled && cron.validate(config.cronExpression)) {
        task = cron.schedule(config.cronExpression, callback, { timezone: "Asia/Shanghai" });
      }
    } catch (error) { console.error(`[production] cron disabled: ${error.code || "FAILED"}`); }
  }
  return {
    start() {
      if (!unsubscribe) unsubscribe = onProductionConfigChange(rebuild);
      rebuild();
    },
    stop() {
      if (task) task.stop();
      task = null;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    },
  };
}
