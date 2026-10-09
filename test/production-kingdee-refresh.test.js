import assert from "node:assert/strict";
import { createServer } from "vite";

const stored = new Map();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => { stored.set(key, value); },
  removeItem: (key) => { stored.delete(key); },
} });

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const reference = await vite.ssrLoadModule("/src/lib/productionReferenceData.ts");
  const { getCache, setCache } = await vite.ssrLoadModule("/src/lib/kingdeeCache.ts");
  assert.equal(typeof reference.refreshKingdeeData, "function", "两个部门应共用一键更新逻辑");
  assert.equal(typeof reference.formatKingdeeRefreshMessage, "function", "结果提示应由共享逻辑生成");

  const oldFinished = [{ value: "old-product", label: "旧商品", productName: "旧商品", productNumber: "SP1" }];
  const oldCustomers = [{ value: "旧客户", label: "旧客户" }];
  const states = [
    { productsFail: false, customersFail: false, level: "success" },
    { productsFail: false, customersFail: true, level: "warning" },
    { productsFail: true, customersFail: false, level: "warning" },
    { productsFail: true, customersFail: true, level: "error" },
  ];
  let notifications = 0;
  const unsubscribe = reference.subscribeToProductionMaterialUpdates(() => { notifications += 1; });
  try {
    for (const state of states) {
      setCache("production_finished_products_v4", oldFinished);
      setCache("production_injection_plastic_parts_v4", oldFinished);
      setCache("production_customers", oldCustomers);
      setCache("customers", [{ id: "old", name: "旧客户" }]);
      const calls = [];
      globalThis.fetch = async (url) => {
        calls.push(String(url));
        if (String(url).startsWith("/api/kingdee/production-materials?refresh=1")) {
          return new Response(JSON.stringify({ ok: true, stale: state.productsFail, refreshed: !state.productsFail,
            fetchedAt: "2026-10-09T00:00:00.000Z",
            data: { finishedProducts: [{ id: "new-product", name: "新成品", number: "SP2" }],
              plasticParts: [{ id: "new-part", name: "新配件", number: "B2" }] } }), { status: 200 });
        }
        if (String(url).startsWith("/api/kingdee/customers?refresh=1")) {
          return new Response(JSON.stringify({ ok: true, stale: state.customersFail, refreshed: !state.customersFail,
            fetchedAt: "2026-10-09T00:00:00.000Z",
            data: [{ id: "old", name: "旧客户" }, { id: "new", name: "新增客户" }] }), { status: 200 });
        }
        throw new Error(`unexpected request: ${url}`);
      };
      const before = notifications;
      const result = await reference.refreshKingdeeData();
      assert.equal(result.products.ok, !state.productsFail);
      assert.equal(result.customers.ok, !state.customersFail);
      const display = reference.formatKingdeeRefreshMessage(result);
      assert.equal(display.level, state.level);
      assert.match(display.content, state.productsFail ? /商品更新失败/ : /成品 1 条/);
      assert.match(display.content, state.customersFail ? /客户更新失败/ : /客户 2 条/);
      if (!state.productsFail || !state.customersFail) {
        assert.match(display.content, /2026/, "成功项应显示金蝶数据更新时间");
      }
      assert.equal(calls.filter((url) => url.includes("production-materials?refresh=1")).length, 1);
      assert.equal(calls.filter((url) => url.includes("customers?refresh=1")).length, 1);
      assert.equal(getCache("production_finished_products_v4")[0].value,
        state.productsFail ? "old-product" : "new-product");
      assert.equal(getCache("production_customers").at(-1).value,
        state.customersFail ? "旧客户" : "新增客户");
      assert.equal(getCache("customers").at(-1).name,
        state.customersFail ? "旧客户" : "新增客户");
      assert.equal(notifications - before, state.productsFail && state.customersFail ? 0 : 1,
        "只在有成功更新时通知已打开的录入弹窗一次");
      assert.equal((await reference.getCustomerOptions()).at(-1).value,
        state.customersFail ? "旧客户" : "新增客户");
    }

    setCache("production_finished_products_v4", oldFinished);
    setCache("production_customers", oldCustomers);
    const beforeLegacy = notifications;
    globalThis.fetch = async (url) => {
      if (String(url).includes("production-materials?refresh=1")) {
        return new Response(JSON.stringify({ ok: true, stale: false, fetchedAt: "2026-09-05T00:00:00.000Z",
          data: { finishedProducts: [{ id: "new-product", name: "新成品" }], plasticParts: [] } }), { status: 200 });
      }
      if (String(url).includes("customers?refresh=1")) {
        return new Response(JSON.stringify({ ok: true, stale: false, fetchedAt: "2026-09-05T00:00:00.000Z",
          data: [{ id: "new", name: "新增客户" }] }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    };
    const legacyResult = await reference.refreshKingdeeData();
    assert.equal(legacyResult.products.ok, false, "旧后端忽略刷新参数时不能误报商品更新成功");
    assert.equal(legacyResult.customers.ok, false, "旧后端忽略刷新参数时不能误报客户更新成功");
    assert.equal(getCache("production_finished_products_v4")[0].value, "old-product");
    assert.equal(getCache("production_customers")[0].value, "旧客户");
    assert.equal(notifications, beforeLegacy, "旧后端响应不能通知弹窗使用未更新的数据");

    let productCalls = 0;
    let customerCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("production-materials?refresh=1")) {
        productCalls += 1;
        return new Response(JSON.stringify({ ok: true, stale: false, refreshed: true, data: {
          finishedProducts: [{ id: "p", name: "成品" }], plasticParts: [],
        } }), { status: 200 });
      }
      if (String(url).includes("customers?refresh=1")) {
        customerCalls += 1;
        return new Response(JSON.stringify({ ok: true, stale: false, refreshed: true, data: [{ name: "客户" }] }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    };
    await Promise.all([reference.refreshKingdeeData(), reference.refreshKingdeeData()]);
    assert.equal(productCalls, 1, "连续点击不能重复抓商品");
    assert.equal(customerCalls, 1, "连续点击不能重复抓客户");
  } finally {
    unsubscribe();
  }
} finally {
  await vite.close();
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}

console.log("Production Kingdee refresh tests passed.");
