import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-production-test-"));
process.env.DATA_DIR = testDirectory;
process.env.PRODUCTION_DB_PATH = path.join(testDirectory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(testDirectory, "production-config.json");
fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, JSON.stringify({ dataSource: "internal", enabled: true }));

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
const productIdentity = await import("../server/services/production-product.js").catch(() => null);

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

  assert.ok(productIdentity, "服务端生产商品校验模块应存在");
  fs.writeFileSync(path.join(testDirectory, "kingdee_materials.json"), JSON.stringify({ data: [
    { id: "finished-1", number: "SP0001", name: "可信成品", parent_id: "finished-child" },
    { id: "plastic-1", number: "B0001", name: "可信塑胶件", parent_id: "2314559979366968320" },
  ] }));
  fs.writeFileSync(path.join(testDirectory, "kingdee_categories.json"), JSON.stringify({ data: [
    { id: "2314557705978701824", name: "成品", children: [{ id: "finished-child", name: "成品子类", children: [] }] },
    { id: "2314559979366968320", name: "塑胶配件", children: [] },
  ] }));
  assert.deepEqual(productIdentity.getTrustedProductionProduct("assembly", "finished-1"), {
    productId: "finished-1", productNumber: "SP0001", productName: "可信成品",
  });
  assert.deepEqual(productIdentity.getTrustedProductionProduct("injection", "plastic-1"), {
    productId: "plastic-1", productNumber: "B0001", productName: "可信塑胶件",
  });
  assert.throws(() => productIdentity.getTrustedProductionProduct("assembly", "plastic-1"), /不属于装配部/);
  assert.throws(() => productIdentity.getTrustedProductionProduct("injection", "fake-id"), /不存在/);

  const assembly = createEntry(assemblyRecord(), "test-user");
  const injection = createInjectionEntry(injectionRecord(), "test-user");
  assert.equal(assembly.qualifiedRate, 0.98);
  assert.equal(injection.qualifiedRate, 0.99);
  const linkedAssembly = createEntry(assemblyRecord({
    productId: "kingdee-finished-1",
    productNumber: "SP0001-D",
    productName: "RD-01",
  }), "test-user");
  assert.equal(linkedAssembly.productId, "kingdee-finished-1");
  assert.equal(linkedAssembly.productNumber, "SP0001-D");
  const linkedInjection = createInjectionEntry(injectionRecord({
    productId: "kingdee-plastic-1",
    productNumber: "B0001",
    productName: "RD-01 锁芯",
  }), "test-user");
  assert.equal(linkedInjection.productId, "kingdee-plastic-1");
  assert.equal(linkedInjection.productNumber, "B0001");
  for (const table of ["assembly_records", "injection_records"]) {
    const columns = getDB().prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    assert.ok(columns.includes("product_id"), `${table} 应增量增加 product_id`);
    assert.ok(columns.includes("product_number"), `${table} 应增量增加 product_number`);
  }

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
