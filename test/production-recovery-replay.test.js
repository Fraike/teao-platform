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
  const postImportFirstAuditId = db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id + 1;
  const newInjection = store.createInjectionEntry({ date: "2026-10-10", machine: "4#", shift: "白班", productName: "新配件", dailyQty: 9 }, "new-editor");
  const lastAuditId = db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id;
  const plans = {
    assembly: { table: "assembly_records", firstAuditId: firstAssembly, lastAuditId: endAssembly, expected: 1 },
    injection: { table: "injection_records", firstAuditId: firstInjection, lastAuditId: endInjection, expected: 1 },
  };
  const hashes = {
    assemblyHash: fingerprintDailyTable(db, "assembly_records"),
    injectionHash: fingerprintDailyTable(db, "injection_records"),
  };
  assert.throws(() => restorePreImportRowsOnCopy(db, { assembly: 1, injection: 2, lastAuditId: lastAuditId - 1, ...hashes }, plans), /审计末尾已变化/);
  assert.equal(db.prepare("SELECT date FROM assembly_records").get().date, "2026-09-23");
  assert.throws(() => restorePreImportRowsOnCopy(db, { assembly: 1, injection: 2, lastAuditId, ...hashes, assemblyHash: "0".repeat(64) }, plans), /内容指纹不符/);
  const current = { assembly: 1, injection: 2, lastAuditId, ...hashes, preservePostImport: { firstAuditId: postImportFirstAuditId, count: 1 } };
  assert.throws(() => restorePreImportRowsOnCopy(db, { ...current, preservePostImport: { firstAuditId: postImportFirstAuditId, count: 2 } }, plans), /审计范围与预期不符/);
  db.exec("SAVEPOINT changed_new_row");
  db.prepare("UPDATE injection_records SET daily_qty = 10 WHERE id = ?").run(newInjection.id);
  assert.throws(() => restorePreImportRowsOnCopy(db, { ...current, injectionHash: fingerprintDailyTable(db, "injection_records") }, plans), /新增记录已变化/);
  db.exec("ROLLBACK TO changed_new_row; RELEASE changed_new_row");
  db.exec("SAVEPOINT unexpected_edit_audit");
  db.prepare("INSERT INTO audit_log (record_type, record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES ('injection', ?, 'UPDATE', 'daily_qty', '9', '10', 'editor', '2026-10-12T00:00:00.000Z')").run(newInjection.id);
  assert.throws(() => restorePreImportRowsOnCopy(db, { ...current, lastAuditId: lastAuditId + 1, preservePostImport: { firstAuditId: postImportFirstAuditId, count: 2 } }, plans), /非新增操作/);
  db.exec("ROLLBACK TO unexpected_edit_audit; RELEASE unexpected_edit_audit");
  assert.deepEqual(restorePreImportRowsOnCopy(db, current, plans), { assembly: 1, injection: 2 });
  const restoredAssembly = db.prepare("SELECT * FROM assembly_records").get();
  const restoredInjection = db.prepare("SELECT * FROM injection_records WHERE id = ?").get(i.id);
  assert.equal(restoredAssembly.id, a.id);
  assert.equal(restoredAssembly.daily_qty, 12);
  assert.equal(restoredAssembly.updated_by, "editor");
  assert.equal(restoredInjection.id, i.id);
  assert.equal(restoredInjection.daily_qty, 7);
  assert.equal(db.prepare("SELECT daily_qty FROM injection_records WHERE id = ?").get(newInjection.id).daily_qty, 9);
  assert.equal(db.prepare("SELECT value FROM unrelated").get().value, "keep");
  assert.equal(db.prepare("SELECT action FROM audit_log ORDER BY id DESC LIMIT 1").get().action, "RESTORE");
  store.closeDB();
});
