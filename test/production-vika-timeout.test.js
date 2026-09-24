import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-vika-timeout-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, JSON.stringify({ dataSource: "vika", vikaToken: "fixture", assemblyDatasheetId: "a", injectionDatasheetId: "i" }));
const store = await import("../server/services/production-store.js");
const control = await import("../server/services/production-report-control.js");
const realFetch = globalThis.fetch;
const watchdog = setTimeout(() => { throw new Error("Vika read did not terminate in 20 seconds"); }, 20000);
let aborts = 0;
globalThis.fetch = async (_url, { signal }) => {
  assert.ok(signal, "Vika读取必须绑定明确超时signal");
  return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
    aborts++;
    reject(signal.reason);
  }, { once: true }));
};
try {
  store.initDB();
  await assert.rejects(control.getProductionReport("2026-09-15"), { code: "VIKA_READ_TIMEOUT" });
  assert.equal(aborts, 2, "两部门读取任务均结束才释放busy");
  assert.equal((await control.switchProductionSource("internal", "admin")).dataSource, "internal", "超时失败释放busy，管理员可切换内部来源");
  console.log("Production Vika timeout test passed (15-second mock abort releases busy; internal switch succeeds).");
} finally {
  clearTimeout(watchdog);
  globalThis.fetch = realFetch;
  store.closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
}
