import { roundAffectedMaterials } from '../server/shared/engineering-change-content.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { createEngineeringChangeStore } from '../server/services/engineering-changes.ts';

const eng = { id: 'eng', permissions: ['engineering_submit'] };
const pmc = { id: 'pmc' };
const qa = { id: 'qa' };
const prod = { id: 'prod' };
const wh = { id: 'wh' };
const admin = { id: 'admin', role: 'admin' };
const engineeringMaterial = { id: 'm1', code: 'M01', name: '材料', unit: '个' };

const proof = { verificationPhoto: {
  name: '已盖报废章.png', mime: 'image/png',
  base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2n8AAAAASUVORK5CYII=',
}, kingdeeScrapEvidence: {
  name: '金蝶报废记录.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64'),
}, kingdeeScrapBillNo: 'BF-001' };

function fixture(lookup = id => ({ id, name: id, status: 'active', permissions: ['engineering_change'] }), historical = false, combined = false) {
  const db = new Database(':memory:');
  const store = createEngineeringChangeStore(db, lookup);
  store.configure(admin, { pmc: 'pmc', warehouse: 'wh', departments: [{ name: '品质', userId: 'qa' }, { name: '生产', userId: 'prod' }] });
  let doc = store.create(eng, { draft: { title: '待补充' } });
  function act(actor, action, data = {}) {
    doc = store.act(actor, doc.id, { action, version: doc.version, ...data });
    return doc;
  }
  act(eng, 'save', { draft: { title: '更换材料', routing: { departments: ['品质', '生产'] }, reason: '客户要求', before: 'A', after: 'B', effective: '下一批', references: '', materials: [engineeringMaterial] } });
  act(eng, 'submit');
  if (!combined) doc.scrapMode = 'legacy';
  if (historical) delete doc.reviewMode;
  if (historical || !combined) {
    db.prepare('UPDATE engineering_changes SET body=? WHERE id=?').run(JSON.stringify(doc), doc.id);
  }
  return { db, store, act, current: () => doc };
}

function assess(act, quantity, stock = '10', semi = '3', wip = '2') {
  return act(pmc, 'assess', { materials: [engineeringMaterial], note: '现场确认', lines: [{ materialId: 'm1', warehouseScope: '半成品仓', warehouse: '一仓', batch: 'A', stock, semi, wip, scrap: quantity, sourceKind: '现场盘点', source: '实点', checkedAt: '2026-11-24T01:00:00.000Z', disposition: '按原用途继续使用' }] });
}

test('all departments must approve before no-scrap closure', () => {
  const { store, act, current } = fixture();
  assert.throws(() => store.get(wh, current().id), { status: 404 });
  assess(act, '0');
  assert.equal(act(qa, 'approve').status, 'review');
  assert.throws(() => act(qa, 'approve'), { status: 403 });
  assert.equal(act(prod, 'approve').status, 'closed');
});

test('batch quantities are independently validated, recorded and preserved through fresh approvals', () => {
  const { db, store, act, current } = fixture();
  const line = { materialId: 'm1', warehouseScope: '半成品仓', warehouse: '一仓', batch: 'A', stock: '10', semi: '3', wip: '2',
    scrap: '5', sourceKind: '现场盘点', source: '实点', disposition: '按原用途继续使用' };
  assert.throws(() => act(pmc, 'assess', { materials: [engineeringMaterial], lines: [line] }), /数量核对时间/);
  const batchA = { ...line, checkedAt: '2026-11-24T01:00:00.000Z' };
  assert.throws(() => act(pmc, 'assess', { materials: [engineeringMaterial], lines: [batchA, batchA] }), /批次不能重复/);
  const batchB = { ...batchA, batch: 'B', scrap: '2' };
  act(pmc, 'assess', { materials: [engineeringMaterial], lines: [batchA, batchB] });
  act(qa, 'approve');
  act(prod, 'approve');
  const old = act(pmc, 'record', { lines: [{ line: 0, quantity: '4' }, { line: 1, quantity: '2' }], evidence: '凭证 1' });
  delete old.rounds[0].affectedMaterials;
  for (const row of old.rounds[0].lines) delete row.warehouseScope;
  for (const row of old.records[0].lines) delete row.allocation.warehouseScope;
  db.prepare('UPDATE engineering_changes SET body=? WHERE id=?').run(JSON.stringify(old), old.id);
  assert.throws(() => act(pmc, 'confirm'), { status: 403 });
  act(wh, 'difference', { note: '批次 A 实点少 1' });
  const oldVersion = current().version;
  assert.throws(() => act(pmc, 'assess', { materials: [engineeringMaterial], lines: [{ ...batchA, scrap: '6' }] }), /保留已执行/);
  assert.throws(() => act(pmc, 'assess', { materials: [engineeringMaterial], lines: [
    { ...batchA, scrap: '4' }, { ...batchA, warehouseScope: '成品仓', scrap: '4' }, batchB,
  ] }), /保留已执行/);
  const reassessed = act(pmc, 'assess', { materials: [engineeringMaterial], lines: [{ ...batchA, scrap: '4' }, batchB] });
  assert.equal(reassessed.records[0].lines[0].allocation.warehouseScope, undefined);
  assert.equal(reassessed.records[0].lines[0].reconciledWarehouseScope, '半成品仓');
  assert.throws(() => store.act(qa, current().id, { version: oldVersion, action: 'approve' }), { status: 409 });
  act(qa, 'approve');
  assert.equal(act(prod, 'approve').status, 'verify');
  const closed = act(wh, 'confirm', proof);
  assert.equal(closed.status, 'closed');
  assert.deepEqual(closed.records[0].lines.map(row => [row.allocation.batch, row.quantity]), [['A', '4'], ['B', '2']]);
  assert.equal(closed.rounds[1].lines[0].checkedAt, batchA.checkedAt);
});

test('warehouse confirmation closes only after full approval and both proofs', () => {
  const { db, store, act, current } = fixture();
  assess(act, '5');
  act(qa, 'approve');
  assert.equal(store.pending(pmc).total, 0);
  const legacyScrap = act(prod, 'approve');
  delete legacyScrap.scrapMode;
  db.prepare('UPDATE engineering_changes SET body=? WHERE id=?').run(JSON.stringify(legacyScrap), legacyScrap.id);
  assert.equal(store.pending(pmc).total, 1);
  const legacyVerify = act(pmc, 'record', { evidence: '凭证 2', lines: [{ line: 0, quantity: '5' }] });
  delete legacyVerify.scrapMode;
  db.prepare('UPDATE engineering_changes SET body=? WHERE id=?').run(JSON.stringify(legacyVerify), legacyVerify.id);
  assert.equal(store.pending(wh).total, 1);
  const version = current().version;
  assert.throws(() => act(pmc, 'confirm'), { status: 403 });
  assert.throws(() => act(wh, 'confirm', { kingdeeScrapEvidence: proof.kingdeeScrapEvidence }), /报废现场照片/);
  assert.throws(() => act(wh, 'confirm', { verificationPhoto: proof.verificationPhoto }), /金蝶报废记录/);
  assert.equal(db.prepare('SELECT count(*) AS total FROM engineering_change_attachments').get().total, 0);
  assert.throws(() => act(wh, 'confirm', { verificationPhoto: { ...proof.verificationPhoto,
    mime: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64') } }), { status: 400 });
  assert.equal(store.get(wh, current().id).version, version);
  assert.equal(store.pending(wh).total, 1);
  const closed = act(wh, 'confirm', proof);
  assert.equal(closed.status, 'closed');
  assert.equal(store.attachment(eng, closed.id, closed.scrapVerificationPhoto.id).file.name, proof.verificationPhoto.name);
  assert.deepEqual(store.attachment(wh, closed.id, closed.scrapVerificationPhoto.id).bytes,
    Buffer.from(proof.verificationPhoto.base64, 'base64'));
  assert.throws(() => store.attachment({ id: 'unrelated' }, closed.id, closed.scrapVerificationPhoto.id), { status: 404 });
  assert.equal(closed.kingdeeScrapBillNo, 'BF-001');
  assert.equal(store.attachment(eng, closed.id, closed.kingdeeScrapEvidence.id).file.mime, 'application/pdf');
  assert.throws(() => store.attachment({ id: 'unrelated' }, closed.id, closed.kingdeeScrapEvidence.id), { status: 404 });
  assert.equal(store.pending(wh).total, 0);
  assert.throws(() => store.act(wh, current().id, { action: 'confirm', version }), { status: 409 });
});

test('negative and unallocated actuals leave the approved task intact', () => {
  const { store, act, current } = fixture();
  assess(act, '5');
  act(qa, 'approve');
  act(prod, 'approve');
  assert.throws(() => act(pmc, 'record', { evidence: '待核对', lines: [{ line: 0, quantity: '-1' }] }), { status: 400 });
  assert.throws(() => act(pmc, 'record', { evidence: '待核对', lines: [{ line: 1, quantity: '5' }] }), { status: 400 });
  assert.equal(store.get(pmc, current().id).version, current().version);
  assert.equal(store.pending(pmc).total, 1);
});

test('historical parallel return and reassignment preserve existing behavior', () => {
  const { store, act, current } = fixture(undefined, true);
  assess(act, '5');
  const review = current();
  const messages = [store.claimMessage(), store.claimMessage(), store.claimMessage()];
  assert.deepEqual(messages.map(row => row.userId), ['pmc', 'qa', 'prod']);
  assert.equal(store.messageCurrent(messages[0]), false);
  assert.equal(store.messageCurrent(messages[1]), true);
  const other = { id: 'other' };
  act(admin, 'reassign', { task: 'review:0', userId: other.id, note: '品质改派' });
  assert.equal(store.pending(qa).total, 0);
  assert.equal(store.pending(other).total, 1);
  assert.equal(store.messageCurrent(messages[1]), false);
  assert.equal(store.messageCurrent(messages[2]), true);
  assert.throws(() => store.act(qa, review.id, { action: 'approve', version: current().version }), { status: 404 });
  act(other, 'return', { note: '需补设计资料', target: 'engineering' });
  assert.equal(store.pending(prod).total, 0);
  assert.equal(store.pending(eng).total, 1);
  assert.equal(current().rounds[0].reviewers[0].decision, 'returned');
  assert.equal(act(eng, 'submit').status, 'assessment');
  assert.equal(current().reviewMode, 'parallel');
  assess(act, '0');
  assert.equal(store.pending(prod).total, 1);
});

test('warehouse can return a bad voucher and the corrected record supersedes it', () => {
  const { act, current } = fixture();
  assess(act, '4');
  act(qa, 'approve');
  act(prod, 'approve');
  act(pmc, 'record', { evidence: '凭证编号录错', lines: [{ line: 0, quantity: '4' }] });
  act(wh, 'correct', { note: '请补正确凭证' });
  act(pmc, 'record', { evidence: '正确凭证', lines: [{ line: 0, quantity: '4' }] });
  assert.equal(act(wh, 'confirm', proof).status, 'closed');
  assert.deepEqual(current().records.map(row => Boolean(row.superseded)), [true, false]);
});

test('an inactive future reviewer can be replaced before assessment is submitted', () => {
  const active = new Set(['eng', 'pmc', 'qa', 'prod', 'wh', 'backup']);
  const { store, act, current } = fixture(id => ({ id, status: active.has(id) ? 'active' : 'disabled', permissions: ['engineering_change'] }));
  active.delete('qa');
  assert.throws(() => assess(act, '0'), { status: 400 });
  assert.equal(current().status, 'assessment');
  act(admin, 'reassign', { task: 'review-next:0', userId: 'backup', note: '原审批人停用' });
  assert.equal(store.pending({ id: 'backup' }).total, 0);
  assess(act, '0');
  assert.equal(store.pending({ id: 'backup' }).total, 1);
  assert.equal(store.pending(qa).total, 0);
});

test('the approved total may include previously scrapped units when current stock is zero', () => {
  const { act } = fixture();
  assess(act, '5');
  act(qa, 'approve');
  act(prod, 'approve');
  act(pmc, 'record', { lines: [{ line: 0, quantity: '4' }], evidence: '凭证 3' });
  act(wh, 'difference', { note: '实点少 1' });
  assess(act, '4', '0', '0', '0');
  act(qa, 'approve');
  assert.equal(act(prod, 'approve').status, 'verify');
  assert.equal(act(wh, 'confirm', proof).status, 'closed');
});

test('a short application can be submitted, copied and approved without inventory impact', () => {
  const db = new Database(':memory:');
  const store = createEngineeringChangeStore(db, id => ({ id, name: id, status: 'active', permissions: ['engineering_change'] }));
  const cc = { id: 'cc' };
  const newCc = { id: 'new-cc' };
  store.configure(admin, { pmc: 'pmc', warehouse: 'wh', departments: [{ name: '品质', userId: 'qa' }] });
  let doc = store.create(eng, { draft: { title: '待补充' } });
  const act = (actor, action, data = {}) => {
    doc = store.act(actor, doc.id, { action, version: doc.version, ...data });
  };
  function save(recipient) {
    act(eng, 'save', { draft: { title: '调整扭矩', content: '库存用完后切换规格', ccUserId: recipient, routing: { departments: ['品质'] } } });
  }
  save(cc.id);
  assert.throws(() => store.get(cc, doc.id), { status: 404 });
  act(eng, 'submit');
  assert.equal(store.get(cc, doc.id).submittedAt, doc.submittedAt);
  assert.deepEqual(store.detail(cc, doc.id).actions, []);
  assert.equal(store.pending(cc).total, 0);
  act(pmc, 'return', { note: '补充说明' });
  assert.throws(() => store.get(cc, doc.id), { status: 404 });
  save(cc.id);
  act(eng, 'submit');
  assert.equal(store.detail(cc, doc.id).deliveries.filter(row => row.event === 'cc').length, 1);
  act(pmc, 'return', { note: '调整抄送人' });
  save(newCc.id);
  act(eng, 'submit');
  assert.throws(() => store.get(cc, doc.id), { status: 404 });
  assert.equal(store.detail(newCc, doc.id).deliveries.filter(row => row.event === 'cc').length, 2);
  act(pmc, 'assess', { noImpact: true, note: '未投产，无库存及在制' });
  assert.equal(doc.rounds[0].lines.length, 0);
  act(qa, 'approve');
  assert.equal(doc.status, 'closed');
  db.close();
});

test('multi-copy keeps existing deliveries, revokes removed readers and queues only new recipients', () => {
  const db = new Database(':memory:');
  const store = createEngineeringChangeStore(db, id => ({ id, status: 'active', permissions: ['engineering_change'] }));
  store.configure(admin, { pmc: 'pmc', warehouse: 'wh', departments: [{ name: '品质', userId: 'qa' }] });
  let doc = store.create(eng, { draft: { title: '待补充' } });
  const act = (actor, action, data = {}) => {
    doc = store.act(actor, doc.id, { action, version: doc.version, ...data });
  };
  function submit(recipients) {
    act(eng, 'save', { draft: { title: '扭矩调整', content: '新规格', routing: { departments: ['品质'] }, ...recipients } });
    act(eng, 'submit');
  }
  const first = { id: 'cc-a' };
  const second = { id: 'cc-b' };
  const third = { id: 'cc-c' };
  submit({ ccUserId: first.id });
  const legacy = { ...doc, cc: doc.ccRecipients[0], ccRecipients: undefined };
  db.prepare('UPDATE engineering_changes SET body=? WHERE id=?').run(JSON.stringify(legacy), doc.id);
  assert.deepEqual(store.detail(first, doc.id).actions, []);
  act(pmc, 'return', { note: '补充说明' });
  submit({ ccUserIds: [first.id, second.id, first.id] });
  assert.deepEqual(store.detail(second, doc.id).actions, []);
  assert.equal(store.pending(second).total, 0);
  assert.equal(store.list(second, 'all', 1).length, 1);
  act(pmc, 'return', { note: '调整抄送' });
  submit({ ccUserIds: [third.id, second.id] });
  assert.throws(() => store.get(first, doc.id), { status: 404 });
  assert.equal(store.list(first, 'all', 1).length, 0);
  assert.deepEqual(store.detail(third, doc.id).deliveries.filter(row => row.event === 'cc').map(row => row.userId),
    [third.id, second.id, first.id]);
  const messages = [];
  for (let message = store.claimMessage(); message; message = store.claimMessage()) {
    if (message.task === 'cc') messages.push([message.userId, store.messageCurrent(message)]);
  }
  assert.deepEqual(messages, [[first.id, false], [second.id, true], [third.id, true]]);
  db.close();
});

test('the applicant chooses departments and may assign the same person to PMC and warehouse', () => {
  const db = new Database(':memory:');
  const store = createEngineeringChangeStore(db, id => ({ id, status: 'active', permissions: ['engineering_change'] }));
  const departments = [{ name: '品质', userId: qa.id }, { name: '生产', userId: prod.id }];
  store.configure(admin, { pmc: pmc.id, warehouse: pmc.id, departments });
  let doc = store.create(eng, { draft: { title: '待补充' } });
  const act = (actor, action, data = {}) => {
    doc = store.act(actor, doc.id, { action, version: doc.version, ...data });
    return doc;
  };
  const draft = { title: '扭矩变更', content: '旧库存报废', materials: [engineeringMaterial] };
  act(eng, 'save', { draft });
  assert.throws(() => act(eng, 'submit'), { status: 400 });
  act(eng, 'save', { draft: { ...draft, routing: { departments: ['未知部门'] } } });
  assert.throws(() => act(eng, 'submit'), { status: 400 });
  act(eng, 'save', { draft: { ...draft, routing: { departments: ['品质'] } } });
  act(eng, 'submit');
  assert.deepEqual(doc.assignment.departments, [departments[0]]);
  assert.equal(doc.assignment.pmc, pmc.id);
  assert.equal(doc.assignment.warehouse, pmc.id);
  store.configure(admin, { pmc: wh.id, warehouse: wh.id, departments: [departments[1]] });
  assess(act, '5');
  assert.equal(store.pending(prod).total, 0);
  assert.equal(act(qa, 'approve').status, 'verify');
  assert.throws(() => act(pmc, 'confirm'), { status: 403 });
  assert.equal(act(pmc, 'recordAndVerify', { ...proof, lines: [{ line: 0, quantity: '5' }] }).status, 'closed');
  assert.equal(doc.history.at(-1).actor, pmc.id);
  db.close();
});

test('a new document needs content, refuses concurrent unfinished drafts and can be discarded with history', () => {
  const db = new Database(':memory:');
  const store = createEngineeringChangeStore(db, id => ({ id, status: 'active', permissions: ['engineering_change'] }));
  const old = { id: 'legacy-empty', number: 'EC-OLD', creator: eng.id, status: 'draft', version: 1, title: '',
    draft: { title: '', materials: [] }, updatedAt: new Date().toISOString(), rounds: [], records: [], history: [] };
  db.prepare('INSERT INTO engineering_changes(id, body, updatedAt) VALUES(?, ?, ?)').run(old.id, JSON.stringify(old), old.updatedAt);
  assert.throws(() => store.create(eng, { draft: { title: ' ', routing: { departments: ['品质'] } } }), { status: 400 });
  assert.equal(store.list(eng, 'mine', 1).length, 0);
  const one = store.create(eng, { draft: { title: '调整扭矩' } });
  assert.equal(store.openDraft(eng).id, one.id);
  assert.throws(() => store.create(eng, { draft: { content: '第二份' } }), { status: 409 });
  assert.throws(() => store.act(eng, old.id, { action: 'save', version: old.version, draft: { title: '旧标签页' } }), { status: 409 });
  assert.throws(() => store.act(qa, one.id, { action: 'discard', version: one.version }), { status: 404 });
  const archived = store.act(eng, one.id, { action: 'discard', version: one.version });
  assert.equal(archived.status, 'discarded');
  assert.equal(archived.history.at(-1).action, 'discard');
  assert.equal(store.openDraft(eng), null);
  assert.equal(store.create(eng, { draft: { content: '第二份' } }).draft.content, '第二份');
  db.close();
});


test('three ordered departments receive one task each in turn, including future reassignment', () => {
  const db = new Database(':memory:');
  const store = createEngineeringChangeStore(db, id => ({ id, status: 'active', permissions: ['engineering_change'] }));
  const changeOwner = { id: 'engineering', permissions: ['engineering_submit'] };
  store.configure(admin, { pmc: 'pmc', warehouse: 'wh',
    departments: [{ name: '品质', userId: 'qa' }, { name: '生产', userId: 'prod' }, { name: '采购', userId: 'buyer' }] });
  let doc = store.create(changeOwner, { submit: true, draft: {
    title: '顺序会签', content: '无库存影响', routing: { departments: ['采购', '生产', '品质'] },
  } });
  function act(actor, action, values = {}) {
    doc = store.act(actor, doc.id, { version: doc.version, action, ...values });
    return doc;
  }
  act(pmc, 'assess', { noImpact: true, note: '无需报废' });
  assert.deepEqual(store.detail(changeOwner, doc.id).tasks.map(task => task.userId), ['buyer']);
  assert.throws(() => act(prod, 'approve'), { status: 403 });
  act(admin, 'reassign', { task: 'review-next:2', userId: 'qa-alt', note: '主管请假' });
  assert.equal(store.pending({ id:'qa-alt' }).total, 0);
  assert.deepEqual(store.detail(changeOwner, doc.id).deliveries.map(row => row.userId).sort(), ['buyer', 'pmc']);
  const version = doc.version;
  act({ id:'buyer' }, 'approve');
  assert.throws(() => act({ id:'buyer' }, 'approve', { version }), { status: 409 });
  assert.deepEqual(store.detail(changeOwner, doc.id).tasks.map(task => task.userId), ['prod']);
  act(prod, 'approve');
  assert.deepEqual(store.detail(changeOwner, doc.id).tasks.map(task => task.userId), ['qa-alt']);
  assert.equal(act({ id:'qa-alt' }, 'approve').status, 'closed');
  assert.deepEqual(store.detail(changeOwner, doc.id).deliveries.map(row => row.userId).sort(), ['buyer', 'pmc', 'prod', 'qa-alt']);
  db.close();
});

test('a zero actual quantity corrected to no scrap closes after the new approvals without a warehouse task', () => {
  const { store, act } = fixture(undefined, false, true);
  assess(act, '1');
  act(qa, 'approve');
  act(prod, 'approve');
  act(wh, 'recordAndVerify', { note: '调整为无需报废', lines: [{ line: 0, quantity: '0' }] });
  act(pmc, 'assess', { noImpact: true, note: '重新核对，无受影响库存' });
  act(qa, 'approve');
  const closed = act(prod, 'approve');
  assert.equal(closed.status, 'closed');
  assert.equal(closed.scrapVerificationPhoto, undefined);
  assert.equal(store.pending(wh).total, 0);
});

test('warehouse submits quantities and both proofs atomically and only records outstanding batches after reapproval', () => {
  const { db, store, act, current } = fixture(undefined, false, true);
  const batch = { materialId: 'm1', warehouseScope: '半成品仓', warehouse: '一仓', batch: 'A', stock: '10', semi: '0', wip: '0',
    scrap: '5', sourceKind: '现场盘点', source: '实点', checkedAt: '2026-11-24T01:00:00.000Z', disposition: '隔离待处理' };
  assert.throws(() => act(pmc, 'assess', { materials: [engineeringMaterial], lines: [{ ...batch, disposition: '旧值' }] }), /剩余物料处置/);
  const lines = [batch, { ...batch, batch: 'B', scrap: '2' }];
  const assessBoth = () => act(pmc, 'assess', { materials: [engineeringMaterial], lines });
  assessBoth();
  act(qa, 'approve');
  const ready = act(prod, 'approve');
  assert.equal(ready.status, 'verify');
  assert.deepEqual(store.detail(eng, ready.id).tasks.map(task => task.userId), ['wh']);
  const submit = { lines: [{ line: 0, quantity: '3' }, { line: 1, quantity: '2' }] };
  assert.throws(() => act(pmc, 'recordAndVerify', { ...submit, ...proof, note: '少 2' }), { status: 403 });
  assert.throws(() => act(wh, 'recordAndVerify', { ...submit, ...proof }), /差异原因/);
  assert.throws(() => act(wh, 'recordAndVerify', { ...submit, note: '少 2', kingdeeScrapEvidence: proof.kingdeeScrapEvidence }), /报废现场照片/);
  assert.throws(() => act(wh, 'recordAndVerify', { ...submit, note: '少 2', verificationPhoto: proof.verificationPhoto }), /金蝶报废记录/);
  assert.equal(db.prepare('SELECT count(*) AS total FROM engineering_change_attachments').get().total, 0);
  assert.equal(store.get(wh, ready.id).version, ready.version);

  const returned = act(wh, 'recordAndVerify', { ...submit, ...proof, note: '少 2' });
  assert.equal(returned.status, 'assessment');
  const firstPhoto = returned.records[0].verificationPhoto;
  assert.equal(store.attachment(wh, ready.id, firstPhoto.id).file.name, proof.verificationPhoto.name);
  assert.throws(() => store.attachment({ id: 'other' }, ready.id, firstPhoto.id), { status: 404 });
  assert.throws(() => store.act(wh, ready.id, { ...submit, ...proof, action: 'recordAndVerify', version: ready.version }), { status: 409 });

  assessBoth();
  act(qa, 'approve');
  assert.equal(act(prod, 'approve').status, 'verify');
  assert.throws(() => act(wh, 'recordAndVerify', { ...submit, ...proof }), /不在待处置范围/);
  assert.equal(act(wh, 'recordAndVerify', { ...proof, lines: [{ line: 0, quantity: '2' }] }).status, 'closed');
  assert.equal(current().records.length, 2);
  assert.equal(current().records[1].kingdeeScrapEvidence.name, proof.kingdeeScrapEvidence.name);
  assert.equal(store.attachment(eng, ready.id, firstPhoto.id).file.id, firstPhoto.id);
  db.close();
});

test('reapproval closes a combined warehouse change when the new approved total matches prior execution', () => {
  const { db, store, act } = fixture(undefined, false, true);
  assess(act, '5');
  act(qa, 'approve');
  act(prod, 'approve');
  act(wh, 'recordAndVerify', { ...proof, lines: [{ line: 0, quantity: '4' }], note: '仅执行 4 件' });
  assess(act, '4', '0', '0', '0');
  act(qa, 'approve');
  const closed = act(prod, 'approve');
  assert.equal(closed.status, 'closed');
  assert.equal(closed.records.length, 1);
  assert.equal(store.pending(wh).total, 0);
  db.close();
});

test('PMC may choose a different material, and approvals and scrap retain the engineering source and the affected scope', () => {
  const { db, store, act, current } = fixture(undefined, false, true);
  const semi = { id: 's1', code: 'S01', name: '半成品', unit: '件' };
  const line = { materialId: semi.id, warehouseScope: '半成品仓', warehouse: 'A 库位', batch: 'B1',
    stock: '5', semi: '5', wip: '0', scrap: '2', sourceKind: '现场盘点', source: '',
    checkedAt: '2026-11-24T01:00:00.000Z', disposition: '隔离待处理' };
  assert.throws(() => act(pmc, 'assess', { lines:[line] }), /请选择受影响物料/);
  assert.throws(() => act(pmc, 'assess', { materials:[semi], lines:[{ ...line, materialId:'m1' }] }), /全部受影响物料/);
  assert.throws(() => act(pmc, 'assess', { materials:[semi], lines:[{ ...line, warehouseScope:'无效' }] }), /有效的仓库/);
  const review = act(pmc, 'assess', { materials:[semi], lines:[line] });
  assert.deepEqual(review.draft.materials, [engineeringMaterial]);
  assert.deepEqual(review.rounds[0].draft.materials, [engineeringMaterial]);
  assert.deepEqual(roundAffectedMaterials(review.rounds[0]), [semi]);
  act(qa, 'approve');
  act(prod, 'approve');
  act(wh, 'recordAndVerify', { ...proof, lines:[{ line:0, quantity:'1' }], note:'少 1 件' });
  assert.throws(() => act(pmc, 'assess', { materials:[semi], lines:[{ ...line, warehouse:'B 库位' }] }), /保留已执行/);
  assert.throws(() => act(pmc, 'assess', { materials:[semi], lines:[{ ...line, warehouseScope:'成品仓' }] }), /保留已执行/);
  const reassessed = act(pmc, 'assess', { materials:[semi], lines:[{ ...line, sourceKind:'金蝶库存＋人工核对', scrap:'2' },
    { ...line, warehouseScope:'成品仓', scrap:'1' }] });
  assert.equal(reassessed.rounds[0].lines[0].sourceKind, '现场盘点');
  act(qa, 'approve');
  act(prod, 'approve');
  const closed = act(wh, 'recordAndVerify', { ...proof, lines:[{ line:0, quantity:'1' }, { line:1, quantity:'1' }] });
  assert.equal(closed.status, 'closed');
  assert.deepEqual(closed.records.flatMap(record => record.lines.map(row => row.allocation.materialId)), ['s1','s1','s1']);
  assert.deepEqual(store.get(eng, current().id).draft.materials, [engineeringMaterial]);
  db.close();
});

test('compact assessment accepts both other options and an omitted half-finished subtotal', () => {
  const { db, act } = fixture();
  const assessed = act(pmc, 'assess', { materials:[engineeringMaterial], note:'继续使用', lines:[{
    materialId: engineeringMaterial.id, warehouseScope:'其他', batch:'B1', stock:'2', wip:'0', scrap:'0',
    sourceKind:'其他', checkedAt:'2026-11-24T01:00:00.000Z', disposition:'按原用途继续使用',
  }] });
  const [line] = assessed.rounds[0].lines;
  assert.equal(line.warehouse, '其他');
  assert.equal(line.semi, undefined);
  assert.equal(line.source, '');
  db.close();
});
