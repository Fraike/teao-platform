import assert from "node:assert/strict";
import { ApiError, api } from "../src/lib/api.ts";

// A lost API code must never turn an ambiguous/busy send into a repeat action.
const codedError = new ApiError("请确认重复发送", 409, "REPEAT_CONFIRMATION_REQUIRED");
assert.equal(codedError.code, "REPEAT_CONFIRMATION_REQUIRED", "ApiError 必须保留错误 code");
assert.equal(new ApiError("旧接口", 400).code, undefined, "兼容没有 code 的旧接口");

const ui = await import("../src/lib/productionReportUi.ts").catch(() => null);
assert.ok(ui, "生产汇总共享行为工具应存在");

assert.deepEqual(ui.getSourceSwitchAction("admin", "vika"), { label: "切换到内部平台", target: "internal" });
assert.deepEqual(ui.getSourceSwitchAction("admin", "internal"), { label: "切回维格表", target: "vika" });
assert.equal(ui.getSourceSwitchAction("user", "vika"), null, "普通用户不得获得来源切换操作");
assert.equal(ui.getSourceSwitchAction(undefined, "internal"), null);
assert.equal(ui.getSourceSwitchAction("admin", null), null, "获取配置失败不得猜测默认来源");
assert.equal(ui.formatReportRate(null), "—");
assert.equal(ui.formatReportRate(undefined), "—");
assert.equal(ui.formatReportRate(0), "0.0%");
assert.equal(ui.formatReportRate(0.955), "95.5%");
assert.equal(ui.formatReportRate(0.955, 0), "96%");
assert.equal(ui.requiresRepeatConfirmation(codedError), true);
assert.equal(ui.requiresRepeatConfirmation(new ApiError("忙", 409, "PRODUCTION_BUSY")), false);
assert.equal(ui.requiresRepeatConfirmation(new ApiError("未知", 502, "SEND_RESULT_UNCERTAIN")), false);
assert.equal(ui.requiresRepeatConfirmation(new ApiError("重复", 409)), false);

const coordinator = ui.createProductionReportCoordinator("2026-09-15", "vika");
const oldReport = coordinator.begin("report");
const newReport = coordinator.begin("report");
assert.equal(coordinator.isCurrent(oldReport), false, "旧刷新结果及错误不能覆盖新刷新");
assert.equal(coordinator.isCurrent(newReport), true);
const repeat = coordinator.begin("send");
assert.deepEqual(ui.getConfirmedSendRequest(coordinator, repeat), {
  url: "/api/production/send?date=2026-09-15", body: { confirmRepeat: true },
});
const sourceConfirmation = coordinator.begin("sourceConfirmation");
assert.deepEqual(ui.getConfirmedSourceRequest(coordinator, sourceConfirmation, "admin"), {
  url: "/api/production/source", body: { dataSource: "internal" },
});
assert.equal(ui.getConfirmedSourceRequest(coordinator, sourceConfirmation, "user"), null);
coordinator.setContext("2026-09-14", "vika");
assert.equal(coordinator.isCurrent(newReport), false, "换日期后旧报表不能恢复");
assert.equal(ui.getConfirmedSendRequest(coordinator, repeat), null, "换日期后不能确认旧重发");
assert.equal(ui.getConfirmedSourceRequest(coordinator, sourceConfirmation, "admin"), null, "换日期后不能执行过期切换确认");
coordinator.setContext("2026-09-15", "vika");
assert.equal(coordinator.isCurrent(newReport), false, "切回同一日期也不能复活旧结果");
const preview = coordinator.begin("preview");
coordinator.invalidate("preview");
assert.equal(coordinator.isCurrent(preview), false, "关闭预览后迟到结果不能重开弹窗");
const sourceReport = coordinator.begin("report");
const sourceRepeat = coordinator.begin("send");
coordinator.setContext("2026-09-15", "internal");
assert.equal(coordinator.isCurrent(sourceReport), false, "切换来源后旧报表不能恢复");
assert.equal(ui.getConfirmedSendRequest(coordinator, sourceRepeat), null, "切换来源后不得发送旧确认");
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
