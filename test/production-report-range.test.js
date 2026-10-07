import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-report-range-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");

const legacyConfig = JSON.stringify({
  dataSource: "vika",
  vikaToken: "legacy-token",
  assemblyDatasheetId: "legacy-assembly",
  injectionDatasheetId: "legacy-injection",
  enabled: true,
});
fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, legacyConfig);

const config = await import("../server/config.js");
const store = await import("../server/services/production-store.js");
const control = await import("../server/services/production-report-control.js");

try {
  store.initDB();
  assert.equal(config.readConfig().dataSource, "internal", "旧维格表配置上线后必须强制使用内部平台");
  assert.equal(fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH, "utf8"), legacyConfig, "读取旧配置不得改写线上文件");

  store.createEntry({ date: "2026-09-01", line: "1#", customer: "A", productName: "P1", planQty: 100, dailyQty: 50, defects: 5, orderQty: 200, cumulativeQty: 50 }, "test");
  store.createEntry({ date: "2026-09-02", line: "1#", customer: "A", productName: "P1", planQty: 100, dailyQty: 100, defects: 10, orderQty: 200, cumulativeQty: 160 }, "test");
  store.createEntry({ date: "2026-09-02", line: "2#", customer: "B", productName: "P2", planQty: 50, dailyQty: 25, defects: 0, orderQty: 80, cumulativeQty: 60 }, "test");
  store.createEntry({ date: "2026-09-04", line: "3#", customer: "C", productName: "OUT", planQty: 999, dailyQty: 999 }, "test");

  store.createInjectionEntry({ date: "2026-09-01", machine: "1#", shift: "白班", productName: "I1", dailyQty: 40, defects: 4, orderQty: 100, cumulativeQty: 40 }, "test");
  store.createInjectionEntry({ date: "2026-09-02", machine: "1#", shift: "夜班", productName: "I2", dailyQty: 60, defects: 6, orderQty: 100, cumulativeQty: 80 }, "test");
  store.createInjectionEntry({ date: "2026-09-02", machine: "2#", shift: "白班", productName: "I3", dailyQty: 100, defects: 0, orderQty: 150, cumulativeQty: 100 }, "test");

  const result = await control.getProductionReportRange("2026-09-01", "2026-09-03", "tester");
  assert.equal(result.dateFrom, "2026-09-01");
  assert.equal(result.dateTo, "2026-09-03");
  assert.equal(result.dataSource, "internal");
  assert.equal(result.assembly.rawCount, 3);
  assert.equal(result.assembly.summary.lines, 2, "产线按区间唯一值计数");
  assert.equal(result.assembly.summary.totalPlanQty, 250);
  assert.equal(result.assembly.summary.totalActualQty, 175);
  assert.equal(result.assembly.summary.totalDefects, 15);
  assert.equal(result.assembly.summary.avgAchievementRate, 0.7, "达成率按总量加权");
  assert.equal(result.assembly.summary.avgQualifiedRate, 160 / 175, "合格率按总量加权");
  assert.equal(result.assembly.summary.latestBackorder, 60, "欠数只汇总最新有数据日期");
  assert.equal(result.assembly.summary.totalBackorder, 60, "兼容字段也不得跨日期累加欠数");
  assert.equal(result.assembly.summary.backorderAsOf, "2026-09-02");
  assert.equal(result.injection.summary.machines, 2, "机台按区间唯一值计数");
  assert.equal(result.injection.summary.machineShifts, 3);
  assert.equal(result.injection.summary.totalQty, 200);
  assert.equal(result.injection.summary.avgQualifiedRate, 190 / 200);
  assert.equal(result.injection.summary.totalBackorder, 70);
  assert.deepEqual(result.missingDepartments, []);

  const assemblyPage = await control.getProductionReportRecords("assembly", "2026-09-01", "2026-09-03", 1, 2, "tester");
  assert.equal(assemblyPage.total, 3);
  assert.equal(assemblyPage.totalPages, 2);
  assert.equal(assemblyPage.records.length, 2);
  assert.deepEqual(assemblyPage.records.map((record) => record.date), ["2026-09-02", "2026-09-02"]);
  const secondPage = await control.getProductionReportRecords("assembly", "2026-09-01", "2026-09-03", 2, 2, "tester");
  assert.deepEqual(secondPage.records.map((record) => record.date), ["2026-09-01"]);

  await assert.rejects(control.getProductionReportRange("2026-09-03", "2026-09-01"), { status: 400, code: "INVALID_DATE_RANGE" });
  await assert.rejects(control.getProductionReportRange("2026-02-30", "2026-03-01"), { status: 400, code: "INVALID_DATE" });
  await assert.doesNotReject(control.getProductionReportRange("2025-01-01", "2025-12-31"));
  await assert.rejects(control.getProductionReportRange("2025-01-01", "2026-01-01"), { status: 400, code: "DATE_RANGE_TOO_LARGE" });
  await assert.rejects(control.getProductionReportRecords("unknown", "2026-09-01", "2026-09-03", 1, 50), { status: 400 });
  await assert.rejects(control.getProductionReportRecords("assembly", "2026-09-01", "2026-09-03", 1, 101), { status: 400 });

  console.log("Production report range tests passed.");
} finally {
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
