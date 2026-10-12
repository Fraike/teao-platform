import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "teao-recovery-test-"));
process.env.DATA_DIR = dir;
process.env.PRODUCTION_DB_PATH = path.join(dir, "production.db");
const store = await import("../server/services/production-store.js");
const { fingerprintDailyTable, restorePreImportRowsOnCopy } = await import("../server/services/production-recovery.js");

test("审计回放保留原 ID 与编辑信息，只恢复两张日报表，不改其他数据", () => {
  store.initDB();
  const db = store.getDB();
  db.exec("CREATE TABLE unrelated (value TEXT)");
  db.prepare("INSERT INTO unrelated (value) VALUES ('keep')").run();
  const a = store.createEntry({ date: "2026-10-09", line: "1#", customer: "客户", productName: "成品", dailyQty: 10 }, "original");
  const firstAssembly = db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id;
  const i = store.createInjectionEntry({ date: "2026-10-09", machine: "1#", shift: "白班", productName: "配件", dailyQty: 5 }, "original");
  const firstInjection = db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id;
  const aDeleted = store.createEntry({ date: "2026-10-08", line: "2#", customer: "客户", productName: "旧成品", dailyQty: 3 }, "original");
  const iDeleted = store.createInjectionEntry({ date: "2026-10-08", machine: "2#", shift: "夜班", productName: "旧配件", dailyQty: 3 }, "original");
  store.updateEntry(a.id, { dailyQty: 12 }, "editor");
  store.deleteEntry(aDeleted.id, "editor");
  store.updateInjectionEntry(i.id, { dailyQty: 7 }, "editor");
  store.deleteInjectionEntry(iDeleted.id, "editor");
  const endAssembly = db.prepare("SELECT MAX(id) AS id FROM audit_log WHERE record_type = 'assembly'").get().id;
  const endInjection = db.prepare("SELECT MAX(id) AS id FROM audit_log WHERE record_type = 'injection'").get().id;
  store.replaceAssemblyEntries([{ date: "2026-09-23", line: "3#", customer: "旧", productName: "旧", dailyQty: 1 }], "importer");
  store.replaceInjectionEntries([{ date: "2026-09-23", machine: "3#", shift: "白班", productName: "旧", dailyQty: 1 }], "importer");
  const lastAuditId = db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id;
  const plans = {
    assembly: { table: "assembly_records", firstAuditId: firstAssembly, lastAuditId: endAssembly, expected: 1 },
    injection: { table: "injection_records", firstAuditId: firstInjection, lastAuditId: endInjection, expected: 1 },
  };
  const hashes = {
    assemblyHash: fingerprintDailyTable(db, "assembly_records"),
    injectionHash: fingerprintDailyTable(db, "injection_records"),
  };
  assert.throws(() => restorePreImportRowsOnCopy(db, { assembly: 1, injection: 1, lastAuditId: lastAuditId - 1, ...hashes }, plans), /审计末尾已变化/);
  assert.equal(db.prepare("SELECT date FROM assembly_records").get().date, "2026-09-23");
  assert.throws(() => restorePreImportRowsOnCopy(db, { assembly: 1, injection: 1, lastAuditId, ...hashes, assemblyHash: "0".repeat(64) }, plans), /内容指纹不符/);
  assert.deepEqual(restorePreImportRowsOnCopy(db, { assembly: 1, injection: 1, lastAuditId, ...hashes }, plans), { assembly: 1, injection: 1 });
  const restoredAssembly = db.prepare("SELECT * FROM assembly_records").get();
  const restoredInjection = db.prepare("SELECT * FROM injection_records").get();
  assert.equal(restoredAssembly.id, a.id);
  assert.equal(restoredAssembly.daily_qty, 12);
  assert.equal(restoredAssembly.updated_by, "editor");
  assert.equal(restoredInjection.id, i.id);
  assert.equal(restoredInjection.daily_qty, 7);
  assert.equal(db.prepare("SELECT value FROM unrelated").get().value, "keep");
  assert.equal(db.prepare("SELECT action FROM audit_log ORDER BY id DESC LIMIT 1").get().action, "RESTORE");
  store.closeDB();
});
