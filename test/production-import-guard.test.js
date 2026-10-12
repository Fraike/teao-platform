import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "teao-import-guard-"));
process.env.DATA_DIR = dir;
process.env.PRODUCTION_DB_PATH = path.join(dir, "production.db");
process.env.NODE_ENV = "development";

const { initDB, getDB, closeDB, createEntry, createInjectionEntry } = await import("../server/services/production-store.js");
const { previewProductionImport, confirmProductionImport } = await import("../server/services/production-import.js");
const { requireProductionImport } = await import("../server/middleware/jwt-auth.js");
const { productionRecoveryLock } = await import("../server/middleware/production-recovery-lock.js");

const assembly = (date) => ({ date, line: "1#", customer: "客户", productName: "产品", dailyQty: 10, defects: 0 });
const injection = (date) => ({ date, machine: "1#", shift: "白班", productName: "配件", dailyQty: 10, defects: 0 });

function permitted(id) {
  let status = null;
  requireProductionImport({ user: { id, role: "admin", permissions: ["production_import"] } }, {
    status(value) { status = value; return this; }, json() {},
  }, () => { status = 200; });
  return status;
}

test("导入授权读取当前用户档案，撤权后旧令牌不能导入", () => {
  fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify({ users: [
    { id: "u", role: "user", status: "active", permissions: ["production", "production_import"] },
  ] }));
  assert.equal(permitted("u"), 200);
  fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify({ users: [
    { id: "u", role: "user", status: "active", permissions: ["production"] },
  ] }));
  assert.equal(permitted("u"), 403);
});

test("恢复只读开关拦截两部门写入，保留查询与导出", () => {
  process.env.PRODUCTION_RECOVERY_READ_ONLY = "1";
  const statusFor = (method, route) => {
    let status = 200;
    productionRecoveryLock({ method, path: route }, {
      status(code) { status = code; return this; }, json() {},
    }, () => {});
    return status;
  };
  assert.equal(statusFor("POST", "/api/production/entries/import"), 503);
  assert.equal(statusFor("POST", "/API/PRODUCTION/ENTRIES/import"), 503);
  assert.equal(statusFor("PUT", "/api/production/injection/entries/123"), 503);
  assert.equal(statusFor("GET", "/api/production/entries/export"), 200);
  delete process.env.PRODUCTION_RECOVERY_READ_ONLY;
});

test("覆盖必须预览；文件或数据库变化拒绝；成功先备份且只能提交一次", async () => {
  fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify({ users: [
    { id: "u", role: "user", status: "active", permissions: ["production", "production_import"] },
  ] }));
  initDB();
  createEntry(assembly("2026-10-09"), "old");
  createInjectionEntry(injection("2026-10-09"), "old");
  const a = previewProductionImport("assembly", [assembly("2026-09-23")], "u");
  assert.equal(a.currentCount, 1);
  assert.deepEqual(a.disappearingDates, [{ date: "2026-10-09", count: 1 }]);
  await assert.rejects(confirmProductionImport("assembly", [assembly("2026-09-22")], a.previewToken, "u", "actor"), /文件内容已变化/);
  assert.equal(getDB().prepare("SELECT date FROM assembly_records").get().date, "2026-10-09");

  const b = previewProductionImport("assembly", [assembly("2026-09-23")], "u");
  createEntry(assembly("2026-10-08"), "other");
  await assert.rejects(confirmProductionImport("assembly", [assembly("2026-09-23")], b.previewToken, "u", "actor"), /数据已变化/);
  assert.equal(getDB().prepare("SELECT COUNT(*) AS n FROM assembly_records").get().n, 2);

  const backupFailure = previewProductionImport("assembly", [assembly("2026-09-23")], "u");
  const db = getDB();
  const originalBackup = db.backup;
  db.backup = async () => { throw new Error("backup failed"); };
  try {
    await assert.rejects(confirmProductionImport("assembly", [assembly("2026-09-23")], backupFailure.previewToken, "u", "actor"), /backup failed/);
  } finally {
    db.backup = originalBackup;
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assembly_records").get().n, 2);

  const expired = previewProductionImport("assembly", [assembly("2026-09-23")], "u");
  const originalNow = Date.now;
  Date.now = () => originalNow() + 11 * 60 * 1000;
  try {
    await assert.rejects(confirmProductionImport("assembly", [assembly("2026-09-23")], expired.previewToken, "u", "actor"), /预览已失效/);
  } finally {
    Date.now = originalNow;
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assembly_records").get().n, 2);

  const revokedDuringBackup = previewProductionImport("assembly", [assembly("2026-09-23")], "u");
  db.backup = async (target) => {
    await originalBackup.call(db, target);
    fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify({ users: [
      { id: "u", role: "user", status: "active", permissions: ["production"] },
    ] }));
  };
  try {
    await assert.rejects(confirmProductionImport("assembly", [assembly("2026-09-23")], revokedDuringBackup.previewToken, "u", "actor"), /导入权限已被撤销/);
  } finally {
    db.backup = originalBackup;
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assembly_records").get().n, 2);
  fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify({ users: [
    { id: "u", role: "user", status: "active", permissions: ["production", "production_import"] },
  ] }));

  const c = previewProductionImport("assembly", [assembly("2026-09-23")], "u");
  const result = await confirmProductionImport("assembly", [assembly("2026-09-23")], c.previewToken, "u", "actor");
  assert.equal(result.count, 1);
  assert.ok(fs.existsSync(path.join(dir, "production-import-backups", result.backupFile)));
  assert.equal(fs.statSync(path.join(dir, "production-import-backups", result.backupFile)).mode & 0o777, 0o600);
  assert.equal(getDB().prepare("SELECT date FROM assembly_records").get().date, "2026-09-23");
  await assert.rejects(confirmProductionImport("assembly", [assembly("2026-09-23")], c.previewToken, "u", "actor"), /预览已失效/);
  assert.equal(getDB().prepare("SELECT date FROM injection_records").get().date, "2026-10-09");
  closeDB();
});
