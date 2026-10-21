import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'standard-slots-'));
process.env.JWT_SECRET = 'slot-tests-only-secret-at-least-32-characters';
const store = await import('../server/services/standard-store.js');
store.initDB();
const { createStandardReviewReminders } = await import('../server/services/standard-review-reminders.js');
const { initializeReminderSchema } = await import('../server/services/standard-reminder-schema.js');
const { withPublicationQueue } = await import('../server/services/standard-notification-queue.js');
const db = store.getDB();
const submitter = { id: 'submitter', name: '提交人' };
const reviewer = { id: 'reviewer', name: '审核人', status: 'active', wecomUserid: 'wecom-reviewer' };
let now, fail = false;
const calls = [];
const calendar = { wecomWebhook: 'https://example.invalid/slots', restDays: [], makeupWorkdays: [] };
const at = value => { now = Date.parse(value + '+08:00'); };
const dependencies = { now: () => now, config: () => calendar, users: () => [reviewer],
  send: async (_url, content, mentions, options) => {
    calls.push({ content, mentions, guard: options?.shouldSend });
    if (fail) throw Object.assign(new Error('mock rejection'), { code: 'SEND_REJECTED' });
  } };
const service = createStandardReviewReminders(dependencies);
function pending(serialNo) {
  let detail = store.createStandard({ serialNo, categoryKey: 'rack_damper', customer: '客户▲', model: 'RD-V128', fields: {} }, submitter);
  detail = store.submitStandard(detail.id, submitter, { versionId: detail.versions[0].id, revision: detail.versions[0].revision, reviewerId: reviewer.id, reviewerName: reviewer.name });
  db.prepare('UPDATE product_standard_versions SET submitted_at=? WHERE id=?').run(new Date(now - 60000).toISOString(), detail.versions[0].id);
  return detail;
}

try {
  at('2026-10-19T07:59:00');
  const first = pending('SLOT-FIRST');
  db.prepare('UPDATE product_standards SET category_key=? WHERE id=?').run('gear_damper', first.id);
  at('2026-10-19T08:00:00');
  await Promise.all([service.tick(), createStandardReviewReminders(dependencies).tick()]);
  assert.equal(calls.length, 1);
  assert(calls[0].content.includes('齿条阻尼器'));
  assert(calls[0].content.includes(`standardId=${first.id}`));
  assert.deepEqual(calls[0].mentions, ['wecom-reviewer']);
  at('2026-10-19T12:59:00'); const second = pending('SLOT-NOON');
  at('2026-10-19T13:00:00');
  await Promise.all([service.tick(), createStandardReviewReminders(dependencies).tick()]);
  assert.equal(calls.length, 2, 'morning claim must not block afternoon');
  assert(calls[1].content.includes('SLOT-FIRST') && calls[1].content.includes('SLOT-NOON'));
  await createStandardReviewReminders(dependencies).tick(); assert.equal(calls.length, 2);
  for (const detail of [first, second]) store.reviewStandard(detail.id, { versionId: detail.versions[0].id, revision: detail.versions[0].revision, approve: false, comment: '修改' }, reviewer);
  at('2026-10-20T08:00:00'); await service.tick(); assert.equal(calls.length, 2);

  const migrated = pending('SLOT-LEGACY');
  db.prepare('INSERT INTO standard_review_daily_reminders VALUES(?,?,?)').run(reviewer.id, '2026-10-20', now);
  initializeReminderSchema(db); initializeReminderSchema(db);
  await createStandardReviewReminders(dependencies).tick(); assert.equal(calls.length, 2, 'legacy claim maps to morning');
  at('2026-10-20T13:00:00'); await service.tick(); assert.equal(calls.length, 3);
  store.reviewStandard(migrated.id, { versionId: migrated.versions[0].id, revision: migrated.versions[0].revision, approve: true }, reviewer);
  at('2026-10-21T07:59:00'); const completed = pending('SLOT-COMPLETED');
  const approved = pending('SLOT-APPROVED');
  at('2026-10-21T08:00:00'); await service.tick();
  store.withdrawStandard(completed.id, { versionId: completed.versions[0].id, revision: completed.versions[0].revision }, submitter);
  store.reviewStandard(approved.id, { versionId: approved.versions[0].id, revision: approved.versions[0].revision, approve: true }, reviewer);
  const beforeComplete = calls.length;
  at('2026-10-21T13:00:00'); await service.tick(); assert.equal(calls.length, beforeComplete);

  at('2026-10-22T07:59:00'); pending('SLOT-FAILED');
  at('2026-10-22T08:00:00'); fail = true; await service.tick();
  const beforeRetry = calls.length;
  fail = false; await service.tick(); assert.equal(calls.length, beforeRetry, 'same failed slot does not retry');
  at('2026-10-22T13:00:00'); await service.tick(); assert.equal(calls.length, beforeRetry + 1);
  const manual = await service.remind(db.prepare("SELECT id FROM product_standards WHERE serial_no='SLOT-FAILED'").get().id, { role: 'admin' }, { versionNo: 1 });
  assert.equal(manual.nextReminderAt, '2026-10-23T00:00:00.000Z');
  at('2026-10-23T09:00:00');
  const next = await service.remind(db.prepare("SELECT id FROM product_standards WHERE serial_no='SLOT-FAILED'").get().id, { role: 'admin' }, { versionNo: 1 });
  assert.equal(next.nextReminderAt, '2026-10-23T05:00:00.000Z');

  let release;
  const blocker = withPublicationQueue(calendar.wecomWebhook, () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  at('2026-10-24T08:00:00'); const queued = service.tick();
  await new Promise(resolve => setImmediate(resolve));
  const beforeQueue = calls.length;
  at('2026-10-24T13:00:00'); const afternoon = service.tick();
  await new Promise(resolve => setImmediate(resolve));
  release(); await blocker; await queued;
  await afternoon;
  assert.equal(calls.length, beforeQueue + 1, 'afternoon cron must run while the morning job is still blocked');
  // Morning job was cancelled; only the independently claimed afternoon job was sent.
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM standard_review_scheduled_reminders WHERE reminder_date='2026-10-24' AND reminder_slot=8").get().count, 0);
  await service.tick(); assert.equal(calls.length, beforeQueue + 1);
  const guard = calls.at(-1).guard; assert.equal(guard(), true);
  at('2026-10-24T14:00:00'); assert.equal(guard(), false);
  at('2026-10-25T13:00:00'); await service.tick(); assert.equal(calls.length, beforeQueue + 1);
  calendar.makeupWorkdays.push('2026-10-25'); await service.tick(); assert.equal(calls.length, beforeQueue + 2);
  at('2026-10-26T13:00:00'); reviewer.status = 'disabled'; await service.tick(); assert.equal(calls.length, beforeQueue + 2);
  reviewer.status = 'active';
  const blockedReviewer = withPublicationQueue(calendar.wecomWebhook, () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  at('2026-10-27T08:00:00'); const invalidated = service.tick();
  await new Promise(resolve => setImmediate(resolve));
  const beforeInvalidated = calls.length;
  reviewer.status = 'disabled'; release(); await blockedReviewer; await invalidated;
  assert.equal(calls.length, beforeInvalidated, 'deactivated reviewer is checked again after queue wait');
  reviewer.status = 'active';
  let delivered = 0;
  for (const [index, decision] of ['approve', 'reject', 'withdraw'].entries()) {
    at(`2026-10-${28 + index}T08:00:00`);
    const target = index === 0
      ? store.getStandard(db.prepare("SELECT id FROM product_standards WHERE serial_no='SLOT-FAILED'").get().id)
      : pending(`RATE-${decision}`);
    let releaseLimiter, entered;
    const gate = new Promise(resolve => { releaseLimiter = resolve; });
    const reachedLimiter = new Promise(resolve => { entered = resolve; });
    const guarded = createStandardReviewReminders({ ...dependencies, send: async (_url, _content, _mentions, options) => {
      entered(); await gate;
      if (!options.shouldSend()) throw Object.assign(new Error('cancelled'), { code: 'SEND_CANCELLED' });
      delivered++;
    } });
    const waiting = guarded.tick(); await reachedLimiter;
    const expected = { versionId: target.versions[0].id, revision: target.versions[0].revision };
    if (decision === 'withdraw') store.withdrawStandard(target.id, expected, submitter);
    else store.reviewStandard(target.id, { ...expected, approve: decision === 'approve', comment: '修改' }, reviewer);
    releaseLimiter(); await waiting;
    assert.equal(delivered, 0, `${decision} during rate-limit wait must prevent network delivery`);
    assert.equal(db.prepare('SELECT status FROM standard_review_reminders WHERE version_id=?').get(target.versions[0].id).status, 'cancelled');
  }
  assert(calls.every(call => Buffer.byteLength(call.content) <= 2048));
  console.log('Reminder slots: independent cadence, identity, migration, completion, failure, queue and calendar passed.');
} finally { store.closeDB(); }
