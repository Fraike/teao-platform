import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-production-test-"));
process.env.DATA_DIR = testDirectory;
process.env.PRODUCTION_DB_PATH = path.join(testDirectory, "production.db");

const store = await import("../server/services/production-store.js");
const {
  closeDB,
  getDB,
  createEntry,
  createInjectionEntry,
  exportAssemblyEntries,
  exportInjectionEntries,
  getHistory,
  initDB,
  queryEntries,
  queryInjectionEntries,
  replaceAssemblyEntries,
  replaceInjectionEntries,
} = store;
const { fetchAndStoreReport } = await import("../server/services/report.js");

const assemblyRecord = (overrides = {}) => ({
  date: "2026-07-27",
  line: "12#",
  customer: "测试客户",
  productName: "TEST-001",
  dailyQty: 100,
  defects: 2,
  ...overrides,
});

const injectionRecord = (overrides = {}) => ({
  date: "2026-07-27",
  machine: "1#",
  shift: "白班",
  productName: "INJ-001",
  dailyQty: 100,
  defects: 1,
  ...overrides,
});

try {
  initDB();

  const assembly = createEntry(assemblyRecord(), "test-user");
  const injection = createInjectionEntry(injectionRecord(), "test-user");
  assert.equal(assembly.qualifiedRate, 0.98);
  assert.equal(injection.qualifiedRate, 0.99);

  assert.ok(getHistory("assembly", assembly.id).every((entry) => entry.record_type === "assembly"));
  assert.ok(getHistory("injection", injection.id).every((entry) => entry.record_type === "injection"));

  createEntry(assemblyRecord({ date: "2026-07-26", line: "13#", productName: "TEST-002" }), "test-user");
  createEntry(assemblyRecord({ date: "2026-07-25", line: "14#", productName: "TEST-003" }), "test-user");
  const firstPage = queryEntries({ limit: 2, offset: 0 });
  const secondPage = queryEntries({ limit: 2, offset: 2 });
  assert.equal(firstPage.groups.length, 2);
  assert.equal(firstPage.totalGroups, 3);
  assert.equal(firstPage.hasMore, true);
  assert.equal(secondPage.groups.length, 1);
  assert.equal(secondPage.hasMore, false);
  assert.equal(exportAssemblyEntries({}).groups.length, 3);
  assert.ok(getDB().prepare("PRAGMA index_list('assembly_records')").all().some((index) => index.name === "idx_assembly_date_line"));

  const importedAssembly = [
    assemblyRecord({ date: "2026-07-30", line: "2#", productName: "ASSEMBLY-NEW" }),
    assemblyRecord({ date: "2026-07-30", line: "3#", productName: "ASSEMBLY-NEW-2", dailyQty: 50, defects: 0 }),
  ];
  assert.deepEqual(replaceAssemblyEntries(importedAssembly, "import-user"), { count: 2 });
  const assemblyAfterImport = queryEntries({ limit: 10 });
  assert.equal(assemblyAfterImport.total, 2);
  assert.equal(assemblyAfterImport.groups.length, 1);
  assert.equal(assemblyAfterImport.groups[0].summary.totalDailyQty, 150);

  const importedInjection = [injectionRecord({ date: "2026-07-30", machine: "6#", productName: "INJECTION-NEW", dailyQty: 80, defects: 0 })];
  assert.deepEqual(replaceInjectionEntries(importedInjection, "import-user"), { count: 1 });
  const injectionAfterImport = queryInjectionEntries({ limit: 10 });
  assert.equal(injectionAfterImport.total, 1);
  assert.equal(injectionAfterImport.groups[0].records[0].machine, "6#");
  assert.equal(exportInjectionEntries({}).groups.length, 1);

  const report = await fetchAndStoreReport("2026-07-30");
  assert.equal(report.assembly.summary.totalActualQty, 150);
  assert.equal(report.injection.summary.totalQty, 80);

  assert.throws(
    () => replaceAssemblyEntries([assemblyRecord({ defects: 101 })], "import-user"),
    /不良数不能大于当天生产数量/
  );

  console.log("Production store tests passed.");
} finally {
  closeDB();
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
