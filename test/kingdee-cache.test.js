import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-kingdee-cache-test-"));
process.env.DATA_DIR = dataDirectory;
process.env.JWT_SECRET = "01234567890123456789012345678901";

const { readKingdeeCache, writeKingdeeCache } = await import("../server/services/kingdee-cache.js");
const { initDefaultAdmin, loginUser } = await import("../server/services/users.js");
const kingdeeRoutes = await import("../server/routes/kingdee.js");
const { registerKingdeeRoutes } = kingdeeRoutes;
assert.equal(typeof kingdeeRoutes.getMaterialsCacheKey, "function", "商品分类应使用独立的服务端缓存键");
assert.equal(kingdeeRoutes.getMaterialsCacheKey("group-a"), "materials-category-group-a");
assert.equal(kingdeeRoutes.getMaterialsCacheKey("group-b"), "materials-category-group-b");
assert.equal(typeof kingdeeRoutes.splitProductionMaterials, "function", "生产日报应按分类树汇总商品");
assert.equal(typeof kingdeeRoutes.getProductionMaterialRefreshOptions, "function", "手动更新必须同时刷新商品和分类");
assert.deepEqual(kingdeeRoutes.getProductionMaterialRefreshOptions(true), { materials: true, categories: true });
const productionFixture = kingdeeRoutes.splitProductionMaterials([
  { id: "finished-child", parent_id: "finished-child", name: "Finished child" },
  { id: "finished-grandchild", parent_id: "finished-grandchild", name: "Finished grandchild" },
  { id: "finished-root", parent_id: "2314557705978701824", name: "Finished root" },
  { id: "plastic", parent_id: "2314559979366968320", name: "Plastic part" },
], [{
  id: "2314557705978701824",
  children: [{ id: "finished-child", children: [{ id: "finished-grandchild", children: [] }] }],
}]);
assert.deepEqual(productionFixture.finishedProducts.map((item) => item.id), ["finished-child", "finished-grandchild"], "装配部应包含成品的所有子分类商品，但不包含根分类直挂商品");
assert.deepEqual(productionFixture.plasticParts.map((item) => item.id), ["plastic"], "注塑部应只包含塑胶配件商品");
const require = createRequire(import.meta.url);
const express = require("../server/node_modules/express");

try {
  fs.writeFileSync(
    path.join(dataDirectory, "kingdee_materials.json"),
    JSON.stringify({
      fetchedAt: "2026-07-30T00:00:00.000Z",
      materials: [
        { id: "material-1", parent_id: "group-a", name: "Material one" },
        { id: "material-2", parent_id: "group-b", name: "Material two" },
      ],
    })
  );
  assert.deepEqual(readKingdeeCache("materials"), {
    fetchedAt: "2026-07-30T00:00:00.000Z",
    data: [
      { id: "material-1", parent_id: "group-a", name: "Material one" },
      { id: "material-2", parent_id: "group-b", name: "Material two" },
    ],
  });

  writeKingdeeCache("materials-category-group-a", [
    { id: "material-1", parent_id: "group-a", name: "Material one" },
  ]);
  writeKingdeeCache("materials", [
    { id: "finished-1", parent_id: "finished-child", name: "Finished item" },
    { id: "plastic-1", parent_id: "2314559979366968320", name: "Plastic part" },
  ]);
  writeKingdeeCache("categories", [{
    id: "2314557705978701824",
    children: [{ id: "finished-child", children: [] }],
  }]);

  writeKingdeeCache("customers", [{ id: "customer-1" }]);
  assert.deepEqual(readKingdeeCache("customers")?.data, [{ id: "customer-1" }]);

  const app = express();
  registerKingdeeRoutes(app);
  await initDefaultAdmin();
  const login = await loginUser({ username: "admin", password: "admin123" });
  assert.ok(login.token);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const port = server.address().port;
    const token = login.token;
    const response = await fetch(`http://127.0.0.1:${port}/api/kingdee/materials?category=group-a&search=one`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.data, [{ id: "material-1", parent_id: "group-a", name: "Material one" }]);

    const productionResponse = await fetch(`http://127.0.0.1:${port}/api/kingdee/production-materials`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const productionBody = await productionResponse.json();
    assert.equal(productionResponse.status, 200);
    assert.deepEqual(productionBody.data.finishedProducts.map((item) => item.id), ["finished-1"]);
    assert.deepEqual(productionBody.data.plasticParts.map((item) => item.id), ["plastic-1"]);

    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const isolatedResponse = await fetch(`http://127.0.0.1:${port}/api/kingdee/materials?category=group-b`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(isolatedResponse.status, 503, "分类缓存不可用时不能误用其他分类的数据");
    } finally {
      console.error = originalConsoleError;
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log("Kingdee cache tests passed.");
} finally {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}
