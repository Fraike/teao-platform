import assert from "node:assert/strict";
import { ApiError, api } from "../src/lib/api.ts";

// A lost API code must never turn an ambiguous/busy send into a repeat action.
const codedError = new ApiError("请确认重复发送", 409, "REPEAT_CONFIRMATION_REQUIRED");
assert.equal(codedError.code, "REPEAT_CONFIRMATION_REQUIRED", "ApiError 必须保留错误 code");
assert.equal(new ApiError("旧接口", 400).code, undefined, "兼容没有 code 的旧接口");

const ui = await import("../src/lib/productionReportUi.ts").catch(() => null);
assert.ok(ui, "生产汇总共享行为工具应存在");

assert.equal(ui.formatReportRate(null), "—");
assert.equal(ui.formatReportRate(undefined), "—");
assert.equal(ui.formatReportRate(0), "0.0%");
assert.equal(ui.formatReportRate(0.955), "95.5%");
assert.equal(ui.formatReportRate(0.955, 0), "96%");
assert.equal(ui.requiresRepeatConfirmation(codedError), true);
assert.equal(ui.requiresRepeatConfirmation(new ApiError("忙", 409, "PRODUCTION_BUSY")), false);
assert.equal(ui.requiresRepeatConfirmation(new ApiError("未知", 502, "SEND_RESULT_UNCERTAIN")), false);
assert.equal(ui.requiresRepeatConfirmation(new ApiError("重复", 409)), false);

assert.deepEqual(ui.getDefaultProductionReportRange("2026-10-07"), { dateFrom: "2026-09-30", dateTo: "2026-10-06" });
assert.equal(ui.validateProductionReportRange("2026-01-01", "2026-12-31"), null);
assert.match(ui.validateProductionReportRange("2026-01-01", "2027-01-01")!, /365/);
assert.match(ui.validateProductionReportRange("2026-09-03", "2026-09-01")!, /开始日期/);
assert.equal(ui.isSingleDayRange("2026-09-15", "2026-09-15"), true);
assert.equal(ui.isSingleDayRange("2026-09-14", "2026-09-15"), false);

const coordinator = ui.createProductionReportCoordinator("2026-09-14", "2026-09-15");
const oldReport = coordinator.begin("report");
const newReport = coordinator.begin("report");
assert.equal(coordinator.isCurrent(oldReport), false, "旧刷新结果及错误不能覆盖新刷新");
assert.equal(coordinator.isCurrent(newReport), true);
const repeat = coordinator.begin("send");
assert.equal(ui.getConfirmedSendRequest(coordinator, repeat), null, "多日范围不得确认企微重发");
coordinator.setContext("2026-09-15", "2026-09-15");
assert.equal(coordinator.isCurrent(newReport), false, "换日期后旧报表不能恢复");
assert.equal(ui.getConfirmedSendRequest(coordinator, repeat), null, "换日期后不能确认旧重发");
const singleDayRepeat = coordinator.begin("send");
assert.deepEqual(ui.getConfirmedSendRequest(coordinator, singleDayRepeat), {
  url: "/api/production/send?date=2026-09-15", body: { confirmRepeat: true },
});
coordinator.setContext("2026-09-15", "2026-09-15");
assert.equal(coordinator.isCurrent(newReport), false, "切回同一日期也不能复活旧结果");
const preview = coordinator.begin("preview");
coordinator.invalidate("preview");
assert.equal(coordinator.isCurrent(preview), false, "关闭预览后迟到结果不能重开弹窗");
const currentReport = coordinator.begin("report");
coordinator.invalidateAll();
assert.equal(coordinator.isCurrent(currentReport), false, "卸载后请求不能更新页面");

// Exercise the actual HTTP boundary, mocking only external transport/storage.
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
try {
  for (const [status, code] of [[409, "REPEAT_CONFIRMATION_REQUIRED"], [409, "PRODUCTION_BUSY"], [502, "SEND_RESULT_UNCERTAIN"]] as const) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "服务端提示", code }), { status });
    await assert.rejects(api.post("/api/production/send?date=2026-09-15", {}), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(ui.requiresRepeatConfirmation(error), code === "REPEAT_CONFIRMATION_REQUIRED");
      return true;
    });
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}

console.log("Production report UI tests passed.");
