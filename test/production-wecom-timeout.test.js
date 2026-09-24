import assert from "node:assert/strict";
import { sendWecomMessage } from "../server/services/wecom.js";

const realFetch = globalThis.fetch;
// A referenced watchdog keeps Node alive while AbortSignal.timeout's timer is unref'ed.
const watchdog = setTimeout(() => { throw new Error("15-second delivery timeout did not fire"); }, 20000);
let timedOut = false;
globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener("abort", () => {
    timedOut = true;
    reject(signal.reason);
  }, { once: true });
});
try {
  await assert.rejects(sendWecomMessage("https://mock.invalid/timeout", "fixture"), { code: "SEND_RESULT_UNCERTAIN", status: 502 });
  assert.equal(timedOut, true, "真实15秒超时信号触发，不把超时误报为成功/明确拒绝");
  console.log("Production WeCom timeout test passed (15-second AbortSignal; mocked fetch only).");
} finally {
  clearTimeout(watchdog);
  globalThis.fetch = realFetch;
}
