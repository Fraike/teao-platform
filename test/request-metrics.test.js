import assert from "node:assert/strict";
import { createRequire } from "node:module";

const metrics = await import("../server/middleware/request-metrics.js").catch(() => null);
assert.ok(metrics, "重点查询应有统一的低敏耗时日志");

const require = createRequire(import.meta.url);
const express = require("../server/node_modules/express");
const app = express();
app.use(metrics.productionQueryMetrics);
app.get("/api/production/report", (_req, res) => res.json({ ok: true }));
app.get("/api/auth/login", (_req, res) => res.json({ ok: true }));
const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const originalInfo = console.info;
const lines = [];
console.info = (line) => { lines.push(String(line)); };
try {
  const port = server.address().port;
  await fetch(`http://127.0.0.1:${port}/api/production/report?search=private-customer`);
  await fetch(`http://127.0.0.1:${port}/api/auth/login`);
  assert.equal(lines.length, 1, "只记录重点查询接口");
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, "api_query");
  assert.equal(event.path, "/api/production/report");
  assert.equal(event.status, 200);
  assert.ok(event.durationMs >= 0);
  assert.equal(lines[0].includes("private-customer"), false, "日志不应包含查询参数");
} finally {
  console.info = originalInfo;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("Request metrics tests passed.");
