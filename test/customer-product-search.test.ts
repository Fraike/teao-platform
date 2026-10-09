import assert from "node:assert/strict";

const search = await import("../src/lib/customerProductSearch.ts").catch(() => null);
assert.ok(search, "客户商品搜索应有防止旧请求覆盖新结果的协调逻辑");

const coordinator = search.createCustomerProductSearchCoordinator();
const oldRequest = coordinator.begin();
const currentRequest = coordinator.begin();
assert.equal(oldRequest.signal.aborted, true, "新搜索应取消旧请求");
assert.equal(coordinator.isCurrent(oldRequest), false, "旧请求结果不能覆盖新搜索");
assert.equal(coordinator.isCurrent(currentRequest), true);
coordinator.cancel();
assert.equal(currentRequest.signal.aborted, true, "离开页面应取消请求");
assert.equal(coordinator.isCurrent(currentRequest), false);

console.log("Customer product search tests passed.");
