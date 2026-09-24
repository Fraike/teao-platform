import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-config-commit-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
const config = await import("../server/config.js");
const store = await import("../server/services/production-store.js");
const control = await import("../server/services/production-report-control.js");
let notifications = 0;
const unsubscribe = config.onProductionConfigChange(() => notifications++);
const originalRename = fs.renameSync;
try {
  store.initDB();
  config.writeConfig({ ...config.readConfig(), vikaToken: "fixture", assemblyDatasheetId: "a", injectionDatasheetId: "i" });
  await control.switchProductionSource("vika", "admin");
  for (const initialSource of ["vika", "internal"]) {
    await control.switchProductionSource(initialSource, "admin");
    const before = fs.readFileSync(config.CONFIG_FILE, "utf8");
    const beforeNotifications = notifications;
    store.getDB().exec(`CREATE TRIGGER reject_operation_success BEFORE UPDATE OF status ON production_report_operations
      WHEN NEW.status = 'success' BEGIN SELECT RAISE(ABORT, 'fixture success log update failure'); END;`);
    await assert.rejects(control.switchProductionSource(initialSource === "vika" ? "internal" : "vika", "admin"));
    assert.equal(fs.readFileSync(config.CONFIG_FILE, "utf8"), before, "日志失败切换不得提交任何配置bytes");
    await assert.rejects(control.updateProductionConfig({ cronExpression: "0 1 13 * * *", wecomWebhook: "changed-fixture" }, "admin"));
    assert.equal(fs.readFileSync(config.CONFIG_FILE, "utf8"), before, "同源配置更新日志失败也保持原bytes");
    assert.equal(notifications, beforeNotifications, "拒绝提交不触发调度变更");
    store.getDB().exec("DROP TRIGGER reject_operation_success");
    assert.equal((await control.switchProductionSource(initialSource, "admin")).ok, true, "失败后释放busy");
  }
  const beforeRenameFailure = fs.readFileSync(config.CONFIG_FILE, "utf8");
  const priorNotifications = notifications;
  fs.renameSync = () => { throw new Error("fixture config commit failure"); };
  await assert.rejects(control.switchProductionSource("vika", "admin"));
  assert.equal(fs.readFileSync(config.CONFIG_FILE, "utf8"), beforeRenameFailure);
  assert.equal(notifications, priorNotifications);
  assert.equal(store.getDB().prepare("SELECT status FROM production_report_operations ORDER BY id DESC LIMIT 1").get().status, "failed", "配置commit失败补偿日志，不误报success");
  fs.renameSync = originalRename;
  const unsubscribeFault = config.onProductionConfigChange(() => { throw new Error("fixture notification failure"); });
  assert.equal((await control.switchProductionSource("vika", "admin")).ok, true, "落盘成功后监听器失败不可伪报配置失败");
  assert.equal(config.readConfig().dataSource, "vika");
  unsubscribeFault();
  console.log("Production config commit tests passed (SQLite success-log fault; both source directions/config updates unchanged; notifications postcommit).");
} finally {
  fs.renameSync = originalRename;
  unsubscribe();
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
