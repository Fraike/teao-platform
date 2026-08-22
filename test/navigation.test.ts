import assert from "node:assert/strict";
import { getNavigationItem, getVisibleNavigationItems } from "../src/lib/navigation.ts";

const admin = { id: "admin", name: "管理员", username: "admin", role: "admin" as const, permissions: [] };
const productionUser = { id: "p1", name: "生产员", username: "production", role: "user" as const, permissions: ["production"] };

assert.equal(getNavigationItem("/production-entry")?.title, "装配部生产日报录入");
assert.equal(getNavigationItem("/production-entry-injection")?.title, "注塑部生产日报录入");
assert.equal(getNavigationItem("/materials/RD-01")?.title, "商品详情");
assert.equal(getNavigationItem("/not-a-page"), undefined);

const adminTitles = getVisibleNavigationItems(admin).map((item) => item.title);
assert.ok(adminTitles.includes("报价管理"));
assert.ok(adminTitles.includes("客户商品资料"));
assert.ok(adminTitles.includes("技术资料（流程查阅）"));
assert.ok(adminTitles.includes("用户管理"));

const productionTitles = getVisibleNavigationItems(productionUser).map((item) => item.title);
assert.deepEqual(productionTitles, ["生产日报汇总", "装配部生产日报录入", "注塑部生产日报录入"]);

console.log("Navigation tests passed.");
