import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "../server/node_modules/express/index.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-report-routes-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
process.env.JWT_SECRET = "test-report-routes-secret-0123456789012345";
process.env.NODE_ENV = "production";
process.env.INITIAL_ADMIN_PASSWORD = "TestFixture2026";
const { registerProductionRoutes } = await import("../server/routes/production.js");
const users = await import("../server/services/users.js");
const store = await import("../server/services/production-store.js");
const config = await import("../server/config.js");
const app = express();
app.use(express.json());
registerProductionRoutes(app);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const realFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ errcode: 0 });
const base = `http://127.0.0.1:${server.address().port}/api/production`;
let token;
async function request(endpoint, body, authorization = token) {
  const response = await realFetch(`${base}${endpoint}`, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text };
}

try {
  store.initDB();
  await users.initDefaultAdmin();
  token = (await users.loginUser({ username: "admin", password: "TestFixture2026" })).token;
  assert.equal((await request("/source", { dataSource: "internal" })).status, 404, "来源切换接口应移除");
  await users.registerUser({ username: "worker", name: "Worker", password: "WorkerFixture2026" });
  const worker = users.listUsers().find((user) => user.username === "worker");
  await users.approveUser(worker.id);
  await users.setUserPermission(worker.id, "production", true);
  const workerToken = (await users.loginUser({ username: "worker", password: "WorkerFixture2026" })).token;
  assert.equal((await request("/source", { dataSource: "vika" }, workerToken)).status, 404);
  assert.equal((await request("/source", { dataSource: "vika" }, null)).status, 404);
  assert.equal((await request("/config", { dataSource: "vika" })).status, 400);
  const safeConfig = (await request("/config")).body;
  assert.equal(safeConfig.dataSource, "internal");
  assert.equal(safeConfig.configured, false);
  assert.equal(safeConfig.vikaToken, undefined);
  assert.equal((await request("/config", { wecomWebhook: "https://mock.invalid" })).status, 200);
  assert.equal((await request("/config")).body.configured, true);
  const validConfig = fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH, "utf8");
  const damagedConfig = '{"dataSource":"internal",';
  fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, damagedConfig);
  const configFailure = await request("/config");
  assert.equal(configFailure.status, 503);
  assert.equal(configFailure.body.code, "PRODUCTION_CONFIG_READ_FAILED");
  assert.doesNotMatch(configFailure.body.error, /\/tmp|mock\.invalid|fixture/);
  assert.equal(fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH, "utf8"), damagedConfig);
  fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, validConfig);
  const empty = await request("/report?date=2026-09-15");
  assert.equal(empty.body.exists, true);
  assert.deepEqual(empty.body.missingDepartments, ["assembly", "injection"]);
  await request("/config", { enabled: false });
  const preview = await request("/preview?date=2026-09-15", {});
  assert.equal(preview.status, 200, "停用自动推送仍可人工预览核对来源");
  assert.equal(preview.body.hasData, false);
  assert.equal(preview.body.dataSource, "internal");
  assert.match(preview.body.content, /内部平台/);
  store.createEntry({ date: "2026-09-15", line: "1", customer: "C", productName: "Late record", dailyQty: 7 }, "test");
  assert.equal((await request("/report?date=2026-09-15")).body.assembly.summary.totalActualQty, 7);
  store.createEntry({ date: "2026-09-14", line: "2", customer: "C", productName: "Earlier", planQty: 10, dailyQty: 5, defects: 1 }, "test");
  const range = await request("/report?dateFrom=2026-09-14&dateTo=2026-09-15");
  assert.equal(range.status, 200);
  assert.equal(range.body.dateFrom, "2026-09-14");
  assert.equal(range.body.dateTo, "2026-09-15");
  assert.equal(range.body.assembly.summary.totalActualQty, 12);
  const records = await request("/report/records?department=assembly&dateFrom=2026-09-14&dateTo=2026-09-15&page=1&pageSize=1");
  assert.equal(records.status, 200);
  assert.equal(records.body.total, 2);
  assert.equal(records.body.records.length, 1);
  assert.equal(records.body.records[0].date, "2026-09-15");
  assert.equal((await request("/report?dateFrom=2025-01-01&dateTo=2026-01-01")).status, 400);
  assert.equal((await request("/report/records?department=bad&dateFrom=2026-09-14&dateTo=2026-09-15")).status, 400);
  assert.equal((await request("/fetch?date=2026-09-15", {})).body.dataSource, "internal");
  assert.equal((await request("/send?date=2026-09-15", {})).body.status, "sent");
  const repeated = await request("/send?date=2026-09-15", {});
  assert.equal(repeated.status, 409);
  assert.equal(repeated.body.code, "REPEAT_CONFIRMATION_REQUIRED");
  assert.equal((await request("/send?date=2026-09-15", { confirmRepeat: "true" })).status, 400);
  assert.equal((await request("/send?date=2026-09-15", { confirmRepeat: true })).body.status, "sent");
  for (const date of ["../../history", "2026-02-30", "2026-99-01"]) {
    assert.equal((await request(`/report?date=${encodeURIComponent(date)}`)).status, 400);
  }
  const { createProductionScheduler } = await import("../server/services/production-report-scheduler.js");
  config.writeConfig({ ...config.readConfig(), enabled: true });
  const scheduled = [];
  let stops = 0;
  let sentDate;
  const scheduler = createProductionScheduler({ validate: () => true,
    schedule: (expression, callback, options) => { scheduled.push({ expression, callback, options }); return { stop: () => stops++ }; } },
  async (date) => { sentDate = date; return { status: "sent" }; }, () => "2026-09-16");
  scheduler.start();
  config.writeConfig({ ...config.readConfig(), cronExpression: "0 1 13 * * *", restDays: ["2026-09-15"] });
  assert.equal(stops, 1);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].expression, "0 1 13 * * *");
  assert.equal(scheduled[1].options.timezone, "Asia/Shanghai");
  await scheduled[0].callback();
  assert.equal(sentDate, "2026-09-14", "旧回调也读取最新节假日配置");
  config.writeConfig({ ...config.readConfig(), enabled: false });
  sentDate = null;
  await scheduled[1].callback();
  assert.equal(sentDate, null);
  const disabledConfig = fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH, "utf8");
  fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, damagedConfig);
  await scheduled[1].callback();
  assert.equal(sentDate, null, "损坏配置旧cron回调拒发而非回退vika");
  scheduler.start();
  assert.equal(scheduled.length, 2, "损坏配置拒绝重建自动推送");
  fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, disabledConfig);
  scheduler.stop();
  console.log("Production report routes/scheduler tests passed (HTTP loopback; isolated state; mocked delivery).");
} finally {
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
