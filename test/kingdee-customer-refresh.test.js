import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-customer-refresh-"));
process.env.DATA_DIR = dataDirectory;
process.env.JWT_SECRET = "01234567890123456789012345678901";
process.env.KINGDEE_CLIENT_ID = "test-client";
process.env.KINGDEE_CLIENT_SECRET = "test-secret";

const { writeKingdeeCache, readKingdeeCache } = await import("../server/services/kingdee-cache.js");
const { registerKingdeeRoutes } = await import("../server/routes/kingdee.js");
const { initDefaultAdmin, loginUser } = await import("../server/services/users.js");
const express = createRequire(import.meta.url)("../server/node_modules/express");
const actualFetch = globalThis.fetch;
const oldCustomer = { id: "old", name: "旧客户", number: "KH001" };
const newCustomer = { id: "new", name: "新增客户", number: "KH002" };
let customerCalls = 0;
let remoteFails = false;

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === "127.0.0.1") return actualFetch(input, init);
  let body;
  if (url.pathname === "/jdyconnector/app_management/push_app_authorize") {
    body = { code: 200, data: [{ appKey: "key", appSecret: "secret", domain: "https://example.com" }] };
  } else if (url.pathname === "/jdyconnector/app_management/kingdee_auth_token") {
    body = { code: 200, data: { "app-token": "test-token" } };
  } else if (url.pathname === "/jdy/v2/bd/customer") {
    customerCalls += 1;
    body = remoteFails
      ? { code: 500, description: "temporary failure" }
      : { code: 200, data: { count: 2, rows: [oldCustomer, newCustomer] } };
  } else {
    throw new Error(`unexpected external request: ${url.pathname}`);
  }
  return new Response(JSON.stringify(body), { status: 200 });
};

let server;
try {
  writeKingdeeCache("customers", [oldCustomer]);
  await initDefaultAdmin();
  const token = (await loginUser({ username: "admin", password: "admin123" })).token;
  const app = express();
  registerKingdeeRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const port = server.address().port;
  const read = async (suffix = "") => {
    const response = await fetch(`http://127.0.0.1:${port}/api/kingdee/customers${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() };
  };

  const cached = await read();
  assert.deepEqual(cached.body.data.map((customer) => customer.id), ["old"]);
  assert.notEqual(cached.body.refreshed, true, "普通缓存读取不能标记为强制刷新成功");
  assert.equal(customerCalls, 0, "普通读取不得重复请求金蝶");

  const refreshed = await read("?refresh=1");
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.stale, false);
  assert.equal(refreshed.body.refreshed, true, "只有实际完成强制抓取才能标记刷新成功");
  assert.deepEqual(refreshed.body.data.map((customer) => customer.id), ["old", "new"]);
  assert.equal(customerCalls, 1, "手动更新必须向金蝶重新抓取客户");
  assert.deepEqual(readKingdeeCache("customers")?.data.map((customer) => customer.id), ["old", "new"]);

  remoteFails = true;
  const fallback = await read("?refresh=1");
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.stale, true, "刷新失败必须明确标记旧缓存");
  assert.notEqual(fallback.body.refreshed, true, "回退到旧缓存不能标记刷新成功");
  assert.deepEqual(fallback.body.data.map((customer) => customer.id), ["old", "new"]);
  assert.deepEqual(readKingdeeCache("customers")?.data.map((customer) => customer.id), ["old", "new"]);
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  globalThis.fetch = actualFetch;
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}

console.log("Kingdee customer refresh tests passed.");
