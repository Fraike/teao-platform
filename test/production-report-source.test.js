import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-source-test-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
const config = await import("../server/config.js");
const store = await import("../server/services/production-store.js");
const report = await import("../server/services/report.js");
const originalFetch = globalThis.fetch;
let webhookMode = "success";
let releaseFetch;
let releaseDelivery;
const waiters = [];
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.vika.cn")) {
    if (releaseFetch) await new Promise((resolve) => { waiters.push(resolve); });
    return { ok: true, json: async () => ({ success: true, data: { records: [
      { fields: { "日期": "2026/09/15", "产线": "V1", "机台": "V2", "当天生产数量": 40, "不良数": 2, "计划生产数量": 50 } },
    ] } }) };
  }
  assert.equal(String(url), "https://mock.invalid/webhook");
  assert.ok(options.signal, "发送必须有超时signal");
  if (webhookMode === "wait") await new Promise((resolve) => { releaseDelivery = resolve; });
  if (webhookMode === "network") throw new Error("network disconnected");
  if (webhookMode === "malformed") return { ok: true, json: async () => ({}) };
  if (webhookMode === "http") return { ok: false, status: 503, json: async () => ({ errcode: 0 }) };
  return { ok: true, json: async () => ({ errcode: webhookMode === "reject" ? 40001 : 0, errmsg: "mock" }) };
};

try {
  assert.equal(config.readConfig().dataSource, "vika", "旧配置无来源必须默认vika");
  const control = await import("../server/services/production-report-control.js");
  store.initDB();
  await assert.rejects(control.switchProductionSource("bad", "admin"), { status: 400 });
  await assert.rejects(control.switchProductionSource("vika", "admin"), /维格表/);
  assert.equal(config.readConfig().dataSource, "vika");
  await control.switchProductionSource("internal", "admin");
  const switchLog = store.getDB().prepare("SELECT * FROM production_report_operations WHERE action = 'switch_source' AND status = 'success' ORDER BY id DESC LIMIT 1").get();
  assert.equal(switchLog.data_source, "vika");
  assert.equal(switchLog.target_source, "internal", "切换日志持久化前后来源");
  assert.equal(JSON.parse(fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH)).dataSource, "internal");
  await assert.rejects(control.updateProductionConfig({ dataSource: "vika" }, "admin"), { status: 400 });
  await control.updateProductionConfig({ wecomWebhook: "https://mock.invalid/webhook" }, "admin");
  fs.mkdirSync(config.REPORTS_DIR, { recursive: true });
  const historicalPath = path.join(config.REPORTS_DIR, "2026-09-15.json");
  const historicalBytes = '{"date":"2026-09-15","historical":"must retain original bytes"}\n';
  fs.writeFileSync(historicalPath, historicalBytes, { mode: 0o640 });
  let generated = await report.fetchAndStoreReport("2026-09-15");
  assert.equal(fs.readFileSync(historicalPath, "utf8"), historicalBytes, "实时生成不得覆盖旧日期汇总");
  assert.deepEqual(generated.missingDepartments, ["assembly", "injection"]);
  assert.equal(generated.dataSource, "internal");
  assert.equal((await control.sendProductionReport("2026-09-15", { automatic: true })).status, "skipped_empty");
  store.createEntry({ date: "2026-09-15", line: "1", customer: "C", productName: "Internal", dailyQty: 100, planQty: 200, defects: 2 }, "test");
  generated = await report.fetchAndStoreReport("2026-09-15");
  assert.equal(generated.assembly.summary.totalActualQty, 100, "不读取之前空缓存");
  assert.equal(generated.assembly.summary.avgQualifiedRate, 0.98);
  assert.equal(generated.assembly.summary.avgAchievementRate, 0.5);
  assert.deepEqual(generated.missingDepartments, ["injection"]);
  assert.match(report.buildWecomContent(generated.date, generated.assembly, generated.injection), /注塑部.*无记录/);
  store.createEntry({ date: "2026-09-14", line: "1", customer: "C", productName: "Zero", dailyQty: 0 }, "test");
  const zero = await report.fetchAndStoreReport("2026-09-14");
  assert.equal(zero.assembly.summary.avgQualifiedRate, null);
  assert.equal(zero.assembly.summary.avgAchievementRate, null);
  assert.match(report.buildWecomContent(zero.date, zero.assembly, zero.injection), /—/);
  assert.equal((await control.sendProductionReport("2026-09-15")).status, "sent");
  await assert.rejects(control.sendProductionReport("2026-09-15"), { status: 409, code: "REPEAT_CONFIRMATION_REQUIRED" });
  assert.equal((await control.sendProductionReport("2026-09-15", { automatic: true })).status, "skipped_duplicate");
  assert.equal((await control.sendProductionReport("2026-09-15", { confirmRepeat: true })).status, "sent");
  webhookMode = "wait";
  const pendingSend = control.sendProductionReport("2026-09-15", { confirmRepeat: true });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(control.sendProductionReport("2026-09-15", { confirmRepeat: true }), { status: 409, code: "PRODUCTION_BUSY" });
  await assert.rejects(control.switchProductionSource("internal", "admin"), { status: 409 });
  releaseDelivery();
  await pendingSend;
  webhookMode = "success";
  await control.updateProductionConfig({ vikaToken: "mock-token", assemblyDatasheetId: "a", injectionDatasheetId: "i" }, "admin");
  await control.switchProductionSource("vika", "admin");
  generated = await report.fetchAndStoreReport("2026-09-15");
  assert.equal(generated.assembly.summary.totalActualQty, 40, "vika不混内部记录");
  assert.equal(fs.readFileSync(historicalPath, "utf8"), historicalBytes, "刷新及来源切换后旧汇总bytes保持不变");
  assert.equal(fs.statSync(historicalPath).mode & 0o777, 0o640, "不改旧汇总权限");
  for (const source of ["internal", "vika"]) {
    const cached = path.join(config.REPORTS_DIR, "source-cache", source, "2026-09-15.json");
    assert.equal(JSON.parse(fs.readFileSync(cached, "utf8")).dataSource, source);
    assert.equal(fs.statSync(cached).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(cached)).mode & 0o777, 0o700);
  }
  assert.equal(fs.statSync(path.join(config.REPORTS_DIR, "source-cache")).mode & 0o777, 0o700);
  assert.equal((await control.sendProductionReport("2026-09-15", { automatic: true })).status, "skipped_duplicate", "跨来源按日期去重");
  releaseFetch = true;
  const busyReport = report.fetchAndStoreReport("2026-09-15");
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(control.switchProductionSource("internal", "admin"), { status: 409 });
  await assert.rejects(control.sendProductionReport("2026-09-15"), { status: 409 });
  releaseFetch = null;
  waiters.forEach((resolve) => resolve());
  await busyReport;
  await control.switchProductionSource("internal", "admin");
  for (const mode of ["network", "malformed", "http"]) {
    const date = `2026-09-${mode === "network" ? "11" : mode === "malformed" ? "12" : "13"}`;
    store.createEntry({ date, line: "1", customer: "C", productName: mode, dailyQty: 1 }, "test");
    webhookMode = mode;
    await assert.rejects(control.sendProductionReport(date), { status: 502, code: "SEND_RESULT_UNCERTAIN" });
    const unknownLog = store.getDB().prepare("SELECT * FROM production_report_sends WHERE date = ? ORDER BY id DESC LIMIT 1").get(date);
    assert.equal(unknownLog.error_code, "SEND_RESULT_UNCERTAIN");
    assert.equal(unknownLog.actor, "user");
    assert.match(unknownLog.content_hash, /^[a-f0-9]{64}$/);
    store.closeDB();
    assert.equal((await control.sendProductionReport(date, { automatic: true })).status, "skipped_uncertain", "重启unknown不可自动重试");
    await assert.rejects(control.sendProductionReport(date), { code: "REPEAT_CONFIRMATION_REQUIRED" });
    webhookMode = "success";
    assert.equal((await control.sendProductionReport(date, { confirmRepeat: true })).status, "sent");
  }
  webhookMode = "reject";
  await assert.rejects(control.sendProductionReport("2026-09-14"), { code: "SEND_REJECTED" });
  webhookMode = "success";
  assert.equal((await control.sendProductionReport("2026-09-14")).status, "sent", "明确拒绝允许重试");
  const d = store.getDB();
  d.prepare("INSERT INTO production_report_sends (date, data_source, trigger_type, status, created_at, updated_at) VALUES (?, 'internal', 'automatic', 'pending', ?, ?)").run("2026-09-10", "now", "now");
  store.closeDB();
  assert.equal((await control.sendProductionReport("2026-09-10", { automatic: true })).status, "skipped_uncertain");
  const restart = spawnSync(process.execPath, ["--input-type=module", "-e", `
    globalThis.fetch = async () => { throw new Error('external calls blocked'); };
    const { sendProductionReport } = await import('./server/services/production-report-control.js');
    console.log(JSON.stringify(await sendProductionReport('2026-09-10', {automatic:true})));
  `], { cwd: path.resolve(import.meta.dirname, ".."), env: process.env, encoding: "utf8" });
  assert.equal(restart.status, 0, restart.stderr);
  assert.equal(JSON.parse(restart.stdout).status, "skipped_uncertain", "全新Node进程保留pending拦截");
  assert.ok(store.getDB().prepare("SELECT COUNT(*) AS count FROM production_report_operations").get().count > 5);
  console.log("Production report source/control tests passed (isolated DB/config; all fetch mocked).");
} finally {
  globalThis.fetch = originalFetch;
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
