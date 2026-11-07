import { pushAllowed, onPushSettingsChange } from "./push-settings.ts";
import { readConfig, onProductionConfigChange, formatShanghaiDate, isRestDay, getLastWorkingDay } from "../config.js";
import { sendProductionReport } from "./production-report-control.js";
import { isReleaseMaintenance } from "./release-maintenance.js";

export function createProductionScheduler(cron, send = sendProductionReport, todayDate = formatShanghaiDate) {
  let task = null;
  let unsubscribe = null, unsubscribePush = null, generation = 0, installing = false;
  async function callback(expectedGeneration) {
    if (installing || expectedGeneration !== generation || !pushAllowed("production") || isReleaseMaintenance()) return;
    try {
      const config = readConfig();
      const today = todayDate();
      if (!config.enabled || isRestDay(today, config)) return;
      const date = getLastWorkingDay(today, config);
      const result = await send(date, { automatic: true, shouldSend: () => expectedGeneration === generation && pushAllowed("production") });
      console.log(`[production] cron: ${date} ${result.status}`);
    } catch (error) {
      console.error(`[production] cron: ${error.code || "FAILED"}`);
    }
  }
  function rebuild() {
    generation++;
    if (task) { task.stop(); task.destroy?.(); }
    task = null;
    try {
      const config = readConfig();
      if (pushAllowed("production") && config.enabled && cron.validate(config.cronExpression)) {
        const current = generation;
        installing = true;
        try { task = cron.schedule(config.cronExpression, () => callback(current), { timezone: "Asia/Shanghai" }); }
        finally { installing = false; }
      }
    } catch (error) { console.error(`[production] cron disabled: ${error.code || "FAILED"}`); }
  }
  return {
    start() {
      if (!unsubscribe) unsubscribe = onProductionConfigChange(rebuild);
      if (!unsubscribePush) unsubscribePush = onPushSettingsChange(rebuild);
      rebuild();
    },
    stop() {
      generation++;
      if (task) { task.stop(); task.destroy?.(); }
      task = null;
      unsubscribePush?.(); unsubscribePush = null;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    },
  };
}
