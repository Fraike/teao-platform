import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-report-control-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, JSON.stringify({ dataSource: "vika", enabled: true }));

const config = await import("../server/config.js");
const store = await import("../server/services/production-store.js");
const report = await import("../server/services/report.js");
const control = await import("../server/services/production-report-control.js");
const originalFetch = globalThis.fetch;
let deliveryMode = "success";
let releaseDelivery;
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), "https://mock.invalid/webhook", "生产日报不得再请求维格表");
  assert.ok(options.signal);
  if (deliveryMode === "wait") await new Promise((resolve) => { releaseDelivery = resolve; });
  if (deliveryMode === "network") throw new Error("network disconnected");
  return Response.json({ errcode: 0 });
};

try {
  store.initDB();
  assert.equal(config.readConfig().dataSource, "internal");
  await control.updateProductionConfig({ wecomWebhook: "https://mock.invalid/webhook" }, "admin");
  assert.equal((await control.sendProductionReport("2026-09-15", { automatic: true })).status, "skipped_empty");

  store.createEntry({ date: "2026-09-15", line: "1#", customer: "C", productName: "P", planQty: 200, dailyQty: 100, defects: 2 }, "test");
  const generated = await report.fetchAndStoreReport("2026-09-15");
  assert.equal(generated.dataSource, "internal");
  assert.equal(generated.assembly.summary.totalActualQty, 100);
  assert.match(report.buildWecomContent(generated.date, generated.assembly, generated.injection), /数据来源：内部平台/);

  assert.equal((await control.sendProductionReport("2026-09-15")).status, "sent");
  await assert.rejects(control.sendProductionReport("2026-09-15"), { code: "REPEAT_CONFIRMATION_REQUIRED" });
  assert.equal((await control.sendProductionReport("2026-09-15", { automatic: true })).status, "skipped_duplicate");

  deliveryMode = "wait";
  const pending = control.sendProductionReport("2026-09-15", { confirmRepeat: true });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(control.sendProductionReport("2026-09-15", { confirmRepeat: true }), { code: "PRODUCTION_BUSY" });
  releaseDelivery();
  await pending;

  store.createEntry({ date: "2026-09-14", line: "1#", customer: "C", productName: "P", dailyQty: 1 }, "test");
  deliveryMode = "network";
  await assert.rejects(control.sendProductionReport("2026-09-14"), { code: "SEND_RESULT_UNCERTAIN" });
  const uncertain = store.getDB().prepare("SELECT * FROM production_report_sends WHERE date = ? ORDER BY id DESC LIMIT 1").get("2026-09-14");
  assert.equal(uncertain.status, "unknown");
  assert.match(uncertain.content_hash, /^[a-f0-9]{64}$/);
  assert.ok(store.getDB().prepare("SELECT COUNT(*) AS count FROM production_report_operations").get().count > 0);
  console.log("Production report internal control tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
