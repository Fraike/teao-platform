import assert from "node:assert/strict";

process.env.KINGDEE_CLIENT_ID = "test-client";
process.env.KINGDEE_CLIENT_SECRET = "test-secret";

const { fetchAllPages } = await import("../server/services/kingdee.js");
const originalFetch = globalThis.fetch;
let secondPageFails = true;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  let body;
  if (url.pathname === "/jdyconnector/app_management/push_app_authorize") {
    body = { code: 200, data: [{ appKey: "key", appSecret: "secret", domain: "https://example.com" }] };
  } else if (url.pathname === "/jdyconnector/app_management/kingdee_auth_token") {
    body = { code: 200, data: { "app-token": "test-token" } };
  } else if (url.searchParams.get("page") === "1") {
    body = { code: 200, data: { count: 3, rows: [{ id: "1" }, { id: "2" }] } };
  } else if (secondPageFails) {
    body = { code: 500, description: "page unavailable" };
  } else {
    body = { code: 200, data: { count: 3, rows: [{ id: "3" }] } };
  }
  return new Response(JSON.stringify(body), { status: 200 });
};

try {
  await assert.rejects(
    fetchAllPages("/jdy/v2/bd/material", {}, 2),
    /第2页/,
    "后续页面失败时不能返回不完整的商品列表",
  );
  secondPageFails = false;
  assert.deepEqual((await fetchAllPages("/jdy/v2/bd/material", {}, 2)).map((row) => row.id), ["1", "2", "3"]);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Kingdee pagination tests passed.");
