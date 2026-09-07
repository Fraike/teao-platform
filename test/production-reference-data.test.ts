import assert from "node:assert/strict";

const productionMaterialConfig = await import("../src/lib/productionMaterialConfig.ts").catch(() => null);
const productionRequestQueue = await import("../src/lib/productionMaterialRequestQueue.ts").catch(() => null);

assert.ok(productionMaterialConfig, "生产日报商品分类配置应存在");
assert.equal(productionMaterialConfig.getProductionMaterialConfig("assembly").category, "2314557705978701824");
assert.equal(productionMaterialConfig.getProductionMaterialConfig("injection").category, "2314559979366968320");
assert.notEqual(
  productionMaterialConfig.getProductionMaterialConfig("assembly").cacheKey,
  productionMaterialConfig.getProductionMaterialConfig("injection").cacheKey,
  "成品和塑胶配件必须使用独立缓存键"
);

assert.ok(productionRequestQueue, "强制更新请求队列应存在");
assert.equal(typeof productionRequestQueue.createProductionMaterialRequestQueue, "function", "强制更新应使用独立的请求队列");
const requestQueue = productionRequestQueue.createProductionMaterialRequestQueue<number>();
let normalResolve: ((value: number) => void) | undefined;
const normalRequest = requestQueue(false, () => new Promise<number>((resolve) => { normalResolve = resolve; }));
const refreshRequest = requestQueue(true, async () => 2);
normalResolve?.(1);
assert.equal(await normalRequest, 1);
assert.equal(await refreshRequest, 2, "手动更新必须在旧请求结束后重新获取数据");

console.log("Production reference data tests passed.");
