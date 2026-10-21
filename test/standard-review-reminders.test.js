import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "standard-reminders-"));
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "reminder-tests-only-secret-at-least-32-characters";
const store = await import("../server/services/standard-store.js");
store.initDB();
const { createStandardReviewReminders } = await import("../server/services/standard-review-reminders.js");
const db = store.getDB();
const submitter = { id: "submitter", name: "提交人" };
const reviewer = { id: "reviewer", name: "审核人", status: "active", wecomUserid: "reviewer-wecom" };
const users = [reviewer];
const submitted = Date.parse("2026-10-18T23:59:00.000Z");
let now = submitted;
let configured = true;
const calendar = { restDays: [], makeupWorkdays: [] };
let fail = false;
let calls = [];
function pending(code) {
  let detail = store.createStandard({ serialNo: code, categoryKey: "gear_damper", customer: "客户", model: "RD-TEST", fields: {} }, submitter);
  detail = store.submitStandard(detail.id, submitter, { versionId: detail.versions[0].id, revision: detail.versions[0].revision, reviewerId: reviewer.id, reviewerName: reviewer.name });
  db.prepare("UPDATE product_standard_versions SET submitted_at=? WHERE id=?").run(new Date(submitted).toISOString(), detail.versions[0].id);
  return store.getStandard(detail.id);
}
const dependencies = {
  now: () => now, users: () => users, config: () => ({ ...calendar, wecomWebhook: configured ? "https://example.invalid/mock" : "" }),
  send: async (_webhook, content, mentions, options) => { calls.push({ content, mentions, shouldSend: options?.shouldSend }); if (fail) throw new Error("test send failure"); },
};
const first = pending("TEST-ONE"), second = pending("TEST-TWO");
const service = createStandardReviewReminders(dependencies);
const at = (value) => { now = Date.parse(value + '+08:00'); };
at('2026-10-19T07:59:59'); await service.tick(); assert.equal(calls.length, 0);
at('2026-10-19T08:00:00');
await Promise.all([service.tick(), createStandardReviewReminders(dependencies).tick()]);
assert.equal(calls.length, 1, "one grouped reminder per reviewer per day across workers");
assert(calls[0].content.includes("TEST-ONE") && calls[0].content.includes("TEST-TWO"));
assert.deepEqual(calls[0].mentions, ["reviewer-wecom"]);
assert(!calls[0].content.includes('两小时'));
await createStandardReviewReminders(dependencies).tick(); assert.equal(calls.length, 1, "restart preserves daily deduplication");
at('2026-10-19T08:01:00');await service.tick();assert.equal(calls.length,1);
at('2026-10-19T22:00:00'); await service.tick(); assert.equal(calls.length, 1, "no night catch-up");
at('2026-10-20T08:00:00'); await service.tick(); assert.equal(calls.length, 2);
store.reviewStandard(first.id, { versionId: first.versions[0].id, revision: first.versions[0].revision, approve: true }, reviewer);
store.reviewStandard(second.id, { versionId: second.versions[0].id, revision: second.versions[0].revision, approve: false, comment: "修改" }, reviewer);
at('2026-10-21T08:00:00'); await service.tick(); assert.equal(calls.length, 2, "completed reviews stop reminders");
let resubmitted = store.getStandard(second.id);
resubmitted = store.submitStandard(second.id, submitter, { versionId: resubmitted.versions[0].id, revision: resubmitted.versions[0].revision, reviewerId: reviewer.id, reviewerName: reviewer.name });
db.prepare("UPDATE product_standard_versions SET submitted_at=? WHERE id=?").run('2026-10-20T00:00:00.000Z', resubmitted.versions[0].id);
calendar.restDays=['2026-10-21']; await service.tick(); assert.equal(calls.length, 2, "configured rest day skipped");
calendar.makeupWorkdays=['2026-10-21']; await service.tick(); assert.equal(calls.length, 3, "makeup day overrides rest day");
at('2026-10-24T08:00:00'); await service.tick(); assert.equal(calls.length, 4, "Saturday follows production workday rules");
at('2026-10-25T08:00:00'); await service.tick(); assert.equal(calls.length, 4, "Sunday skipped");
calendar.makeupWorkdays.push('2026-10-25'); await service.tick(); assert.equal(calls.length, 5, "Sunday makeup day sends");
at('2026-10-26T08:00:00'); configured=false; await service.tick(); assert.equal(calls.length,5);
configured=true; fail=true; await service.tick(); assert.equal(calls.length,6);
fail=false; await service.tick(); assert.equal(calls.length,6,'uncertain failure does not resend the same day');
at('2026-10-27T08:00:00'); reviewer.wecomUserid=''; await service.tick(); assert.equal(calls.length,7);
assert.deepEqual(calls.at(-1).mentions,[]);
at('2026-10-28T08:00:00'); reviewer.status='disabled'; await service.tick(); assert.equal(calls.length,7);
reviewer.status='active'; reviewer.id=submitter.id; await service.tick(); assert.equal(calls.length,7);
reviewer.id='reviewer'; reviewer.name='审核人'.repeat(40);
for (let index=0;index<205;index++) {
 const detail=pending(`LONG-${index}`);
 db.prepare("UPDATE product_standard_versions SET customer=?,model=? WHERE id=?").run('客户'.repeat(50),'型号'.repeat(50),detail.versions[0].id);
}
calls=[]; await service.tick(); assert(calls.length>1);
assert(calls.some(call=>call.content.includes('LONG-204')),'daily grouping must not silently truncate after 200 items');
assert(calls.every(call=>Buffer.byteLength(call.content,'utf8')<=2048));
assert(calls.every(call=>!call.mentions.includes('@all')));
let schedules=0,stops=0,callback;
const count=calls.length;
const fakeCron={schedule(expression,handler,options){
 assert.equal(expression,'0 8,13 * * *');assert.equal(options.timezone,'Asia/Shanghai');callback=handler;
 schedules++;return {stop(){stops++;}};
}};
service.start(fakeCron);service.start(fakeCron);assert.equal(schedules,1);
await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,count,'start does not send a catch-up');
at('2026-10-29T08:00:00');await callback();assert(calls.length>count);
service.stop();assert.equal(stops,1);
const { withPublicationQueue } = await import('../server/services/standard-notification-queue.js');
let release;
const blocking = withPublicationQueue('https://example.invalid/mock', () => new Promise(resolve => { release=resolve; }));
await new Promise(resolve=>setImmediate(resolve));
at('2026-10-30T08:00:00');const queued=service.tick();
await new Promise(resolve=>setImmediate(resolve));
const beforeDelayed=calls.length;at('2026-10-30T22:00:00');release();await blocking;await queued;
assert.equal(calls.length,beforeDelayed,'an automatic reminder blocked in the queue must never send at night');
at('2026-10-31T08:00:00');await service.tick();assert(calls.length>beforeDelayed);
const guard=calls.at(-1).shouldSend;assert.equal(typeof guard,'function');assert.equal(guard(),true);
at('2026-10-31T22:00:00');assert.equal(guard(),false,'rate-limit waits also revalidate before a network request');
store.closeDB();
console.log("Review reminders: time boundaries, grouping, concurrency, restart, recovery, outcome, resubmission, failure and inactive users passed.");
