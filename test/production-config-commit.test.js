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
  config.readConfig();
  await control.getProductionReportRange("2026-09-01", "2026-09-01", "test");
  const before = fs.readFileSync(config.CONFIG_FILE, "utf8");
  const beforeNotifications = notifications;
  store.getDB().exec(`CREATE TRIGGER reject_operation_success BEFORE UPDATE OF status ON production_report_operations
    WHEN NEW.status = 'success' BEGIN SELECT RAISE(ABORT, 'fixture success log update failure'); END;`);
  await assert.rejects(control.updateProductionConfig({ cronExpression: "0 1 13 * * *", wecomWebhook: "changed-fixture" }, "admin"));
  assert.equal(fs.readFileSync(config.CONFIG_FILE, "utf8"), before, "日志失败不得提交配置bytes");
  assert.equal(notifications, beforeNotifications, "拒绝提交不触发调度变更");
  store.getDB().exec("DROP TRIGGER reject_operation_success");

  fs.renameSync = () => { throw new Error("fixture config commit failure"); };
  await assert.rejects(control.updateProductionConfig({ wecomWebhook: "rename-failure" }, "admin"));
  assert.equal(fs.readFileSync(config.CONFIG_FILE, "utf8"), before);
  assert.equal(store.getDB().prepare("SELECT status FROM production_report_operations ORDER BY id DESC LIMIT 1").get().status, "failed");
  fs.renameSync = originalRename;

  const unsubscribeFault = config.onProductionConfigChange(() => { throw new Error("fixture notification failure"); });
  assert.equal((await control.updateProductionConfig({ wecomWebhook: "https://mock.invalid" }, "admin")).ok, true);
  assert.equal(config.readConfig().dataSource, "internal");
  assert.equal(config.readConfig().wecomWebhook, "https://mock.invalid");
  unsubscribeFault();
  console.log("Production config commit tests passed (internal-only atomic updates; notifications postcommit).");
} finally {
  fs.renameSync = originalRename;
  unsubscribe();
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
