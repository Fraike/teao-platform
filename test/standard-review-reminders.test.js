import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "standard-reminders-"));
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "reminder-tests-only-secret-at-least-32-characters";
const store = await import("../server/services/standard-store.js");
store.initDB();
const { createStandardReviewReminders, REVIEW_REMINDER_INTERVAL_MS } = await import("../server/services/standard-review-reminders.js");
const db = store.getDB();
const submitter = { id: "submitter", name: "提交人" };
const reviewer = { id: "reviewer", name: "审核人", status: "active", wecomUserid: "reviewer-wecom" };
const users = [reviewer];
const submitted = Date.parse("2026-10-19T00:00:00.123Z");
let now = submitted;
let configured = true;
let fail = false;
let calls = [];
function pending(code) {
  let detail = store.createStandard({ serialNo: code, categoryKey: "gear_damper", customer: "客户", model: "RD-TEST", fields: {} }, submitter);
  detail = store.submitStandard(detail.id, submitter, { versionId: detail.versions[0].id, revision: detail.versions[0].revision, reviewerId: reviewer.id, reviewerName: reviewer.name });
  db.prepare("UPDATE product_standard_versions SET submitted_at=? WHERE id=?").run(new Date(submitted).toISOString(), detail.versions[0].id);
  return store.getStandard(detail.id);
}
const dependencies = {
  now: () => now, users: () => users, config: () => ({ wecomWebhook: configured ? "https://example.invalid/mock" : "" }),
  send: async (_webhook, content, mentions) => { calls.push({ content, mentions }); if (fail) throw new Error("test send failure"); },
};
const first = pending("TEST-ONE"), second = pending("TEST-TWO");
const service = createStandardReviewReminders(dependencies);
await service.tick(); assert.equal(calls.length, 0);
now += REVIEW_REMINDER_INTERVAL_MS - 1;
await service.tick(); assert.equal(calls.length, 0);
now++;
await Promise.all([service.tick(), createStandardReviewReminders(dependencies).tick()]);
assert.equal(calls.length, 1, "same reviewer grouped and concurrent scheduler cannot duplicate");
assert(calls[0].content.includes("TEST-ONE") && calls[0].content.includes("TEST-TWO"));
assert.deepEqual(calls[0].mentions, ["reviewer-wecom"]);
await createStandardReviewReminders(dependencies).tick(); assert.equal(calls.length, 1, "restart preserves last reminder");
now += REVIEW_REMINDER_INTERVAL_MS * 5;
await service.tick(); assert.equal(calls.length, 2, "missed periods produce only one catch-up");
store.reviewStandard(first.id, { versionId: first.versions[0].id, revision: first.versions[0].revision, approve: true }, reviewer);
store.reviewStandard(second.id, { versionId: second.versions[0].id, revision: second.versions[0].revision, approve: false, comment: "修改" }, reviewer);
now += REVIEW_REMINDER_INTERVAL_MS; await service.tick(); assert.equal(calls.length, 2, "reviewed items stop");
const resubmitted = store.getStandard(second.id);
store.submitStandard(second.id, submitter, { versionId: resubmitted.versions[0].id, revision: resubmitted.versions[0].revision, reviewerId: reviewer.id, reviewerName: reviewer.name });
db.prepare("UPDATE product_standard_versions SET submitted_at=? WHERE id=?").run(new Date(now).toISOString(), resubmitted.versions[0].id);
now += REVIEW_REMINDER_INTERVAL_MS; configured = false; await service.tick(); assert.equal(calls.length, 2);
configured = true; fail = true; await service.tick(); assert.equal(calls.length, 3);
fail = false; await service.tick(); assert.equal(calls.length, 3, "uncertain failure does not immediately resend");
now += REVIEW_REMINDER_INTERVAL_MS; reviewer.wecomUserid = ""; await service.tick(); assert.equal(calls.length, 4);
assert.deepEqual(calls[3].mentions, []); assert(calls[3].content.includes(reviewer.name));
reviewer.status = "disabled"; now += REVIEW_REMINDER_INTERVAL_MS; await service.tick(); assert.equal(calls.length, 4);
reviewer.status = "active"; reviewer.id = submitter.id; await service.tick(); assert.equal(calls.length, 4, "self cannot receive reminder");
reviewer.id = "reviewer"; reviewer.name = "审核人".repeat(40);
for (let index = 0; index < 10; index++) {
  const detail = pending(`LONG-${index}`);
  db.prepare("UPDATE product_standard_versions SET customer=?,model=? WHERE id=?")
    .run("客户".repeat(50), "型号".repeat(50), detail.versions[0].id);
}
calls = [];
await service.tick();
assert(calls.length > 1); assert(calls.every(call => Buffer.byteLength(call.content, "utf8") <= 2048));
assert(calls.every(call => !call.mentions.includes("@all")));
configured = false;
let schedules = 0, stops = 0;
const fakeCron = { schedule(expression, callback, options) {
  assert.equal(expression, "* * * * *"); assert.equal(options.timezone, "Asia/Shanghai"); assert.equal(typeof callback, "function");
  schedules++; return { stop() { stops++; } };
} };
service.start(fakeCron); service.start(fakeCron); assert.equal(schedules, 1);
service.stop(); assert.equal(stops, 1);
store.closeDB();
console.log("Review reminders: time boundaries, grouping, concurrency, restart, recovery, outcome, resubmission, failure and inactive users passed.");
