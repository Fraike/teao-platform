import { submissionDeliveries } from '../server/shared/engineering-change-content.ts';
import { matchEngineeringMaterials } from '../server/services/engineering-change-materials.ts';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { createEngineeringChangeStore } from '../server/services/engineering-changes.ts';
import { createChangeNotificationWorker } from '../server/services/engineering-change-notifications.ts';
import { readInventoryResponse } from '../server/services/engineering-change-inventory.ts';
import { canAccessNavigationItem, getNavigationItem } from '../src/lib/navigation.ts';

test('engineering change is a menu item under engineering', () => {
  const item = getNavigationItem('/engineering-changes');
  assert.equal(item?.group, 'engineering');
  assert.equal(item?.menu, true);
  assert.equal(canAccessNavigationItem(item, { role:'user', permissions:['engineering_submit'] }), false);
  assert.equal(canAccessNavigationItem(item, { role:'user', permissions:['engineering_change'] }), true);
  assert.equal(canAccessNavigationItem(item, { role:'admin', permissions:[] }), true);
});

test('inventory distinguishes unavailable data, explicit zero and a valid empty response', () => {
  assert.throws(() => readInventoryResponse({ errcode: 123, data: { rows: [] } }));
  assert.throws(() => readInventoryResponse({ errcode: 0, data: {} }));
  assert.throws(() => readInventoryResponse({ errcode: 0, data: { rows: [{ inv_stock: '一仓', inv_base_unit: '个', inv_qty: 0 }] } }));
  const result = readInventoryResponse({ errcode: 0, data: { rows: [
    { inv_stock: '一仓', inv_stock_position: 'A01', inv_base_unit: '个', inv_im_qty: '0', inv_qty: 0 },
  ] } });
  assert.deepEqual(result.data, [{ warehouse: '一仓', position: 'A01', unit: '个', stock: '0', available: '0' }]);
  assert.deepEqual(readInventoryResponse({ errcode: 0, data: { rows: [] } }).data, []);
});

test('worker checks direct recipients and records failures without losing in-app tasks', async () => {
  const db = new Database(':memory:');
  const accounts = new Map([
    ['pmc', 'pmc-binding'], ['wh', 'wh-binding'], ['qa', 'qa-binding'], ['qa2', 'qa2-binding'], ['prod', ''],
  ]);
  const lookup = id => ({ id, status: 'active', permissions: ['engineering_change'], wecomUserid: accounts.get(id) ?? '' });
  const store = createEngineeringChangeStore(db, lookup);
  const admin = { id: 'admin', role: 'admin' };
  const engineer = { id: 'eng', permissions: ['engineering_submit'] };
  const pmc = { id: 'pmc' };
  const qa2 = { id: 'qa2' };
  store.configure(admin, { origin: 'https://platform.example', pmc: 'pmc', warehouse: 'wh',
    departments: [{ name: '品质', userId: 'qa' }, { name: '生产', userId: 'prod' }] });
  let doc = store.create(engineer, { draft: { title: '待补充' } });
  const act = (actor, action, data = {}) => {
    doc = store.act(actor, doc.id, { action, version: doc.version, ...data });
  };
  act(engineer, 'save', { draft: { title: '材料变更', routing: { departments: ['品质', '生产'] }, reason: '优化', before: 'A', after: 'B', effective: '下批',
    materials: [{ id: 'm', code: '00', name: '材料', unit: '个' }] } });
  act(engineer, 'submit');
  const sent = [];
  const worker = createChangeNotificationWorker(store, lookup, async (binding, content, options, channel) => {
    assert(options.shouldSend());
    assert.equal(channel, 'engineeringChange');
    sent.push({ binding, content });
    if (binding === 'qa2-binding') throw new Error('down');
    return { status: 'sent' };
  });
  await worker.drain();
  assert.equal(sent[0].binding, 'pmc-binding');
  assert(sent[0].content.includes(`https://platform.example/engineering-changes?changeId=${doc.id}`));
  act(pmc, 'assess', { materials: [{ id: 'm', code: '00', name: '材料', unit: '个' }], note: '无需报废', lines: [{ materialId: 'm', warehouseScope: '半成品仓', warehouse: '仓', stock: '2', semi: '1', wip: '0',
    scrap: '0', sourceKind: '现场盘点', source: '现场', checkedAt: '2026-11-24T01:00:00.000Z', disposition: '按原用途继续使用' }] });
  act(admin, 'reassign', { task: 'review:0', userId: 'qa2', note: '原审批人休假' });
  await worker.drain();
  await worker.drain();
  assert.deepEqual(sent.map(row => row.binding), ['pmc-binding', 'qa2-binding']);
  assert(sent[1].content.includes('原审批人休假'));
  const detail = store.detail(qa2, doc.id);
  assert.equal(detail.deliveries.find(row => row.userId === 'qa').status, 'cancelled');
  assert.equal(detail.deliveries.find(row => row.userId === 'qa2').status, 'failed');
  assert(!detail.deliveries.some(row => row.userId === 'prod'));
  assert.equal(store.pending({ id: 'prod' }).total, 0);
  assert.equal(store.pending(qa2).total, 1);
  act(qa2, 'approve');
  await worker.drain();
  assert.equal(store.detail(qa2, doc.id).deliveries.find(row => row.userId === 'prod').status, 'unbound');
  assert.equal(store.pending(qa2).total, 0);
  assert.equal(store.pending({ id: 'prod' }).total, 1);
  db.close();
});

test('material association ranks exact internal numbers and searches finished and semi-finished names', () => {
  const catalog = [
    { id: '1', number: 'RD-100A', name: '旋转阻尼器成品', model: 'AX-3', parent_name: '成品' },
    { id: '2', number: 'RD-100', name: '旋转阻尼器半成品', parent_name: '半成品' },
    { id: '3', number: 'RD-200', name: '旋转阻尼器成品', parent_name: '成品' },
  ];
  assert.deepEqual(matchEngineeringMaterials(catalog, 'ｒｄ-１００', 2).map(item => item.id), ['2', '1']);
  assert.deepEqual(matchEngineeringMaterials(catalog, ' 旋转阻尼器 ', 30).map(item => item.id), ['1', '2', '3']);
  assert.deepEqual(matchEngineeringMaterials(catalog, '半成品', 30).map(item => item.id), ['2']);
});

test('manual reminders use the current task generation and share the cooldown across operators', async () => {
  const db = new Database(':memory:');
  const lookup = id => ({ id, status: 'active', permissions: ['engineering_change'], wecomUserid: id + '-binding' });
  const store = createEngineeringChangeStore(db, lookup);
  const engineer = { id: 'eng', permissions: ['engineering_submit'] };
  const admin = { id: 'admin', role: 'admin' };
  const pmc = { id: 'pmc' };
  store.configure(admin, { origin: 'https://platform.example', pmc: 'pmc', warehouse: 'wh',
    departments: [{ name: '品质', userId: 'qa' }] });
  let doc = store.create(engineer, { submit: true, draft: {
    title: '试验变更', content: '无库存影响', routing: { departments: ['品质'] },
  } });
  const requests = [];
  const worker = createChangeNotificationWorker(store, lookup, async (binding, content, options, channel) => {
    assert(options.shouldSend());
    assert.equal(channel, 'engineeringChange');
    requests.push({ binding, content });
    return { status: 'sent' };
  });
  const [task] = store.detail(engineer, doc.id).reminderTargets;
  const request = { task: task.key, userId: task.userId, generation: task.generation };
  assert.deepEqual(store.detail(pmc, doc.id).reminderTargets, []);
  assert.throws(() => store.remind(pmc, doc.id, request), { status: 403 });
  assert.throws(() => store.remind(engineer, doc.id, request), { status: 429 });
  await worker.drain();
  store.remind(engineer, doc.id, request);
  assert.throws(() => store.remind(admin, doc.id, request), { status: 429 });
  await worker.drain();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].binding, 'pmc-binding');
  assert.match(requests[1].content, /工程变更催办/);
  assert(requests[1].content.includes(doc.number));
  const after = store.detail(engineer, doc.id);
  assert.equal(after.deliveries.find(row => row.event === 'remind').status, 'sent');
  assert.equal(after.change.version, doc.version);
  assert.equal(after.change.status, 'assessment');

  doc = store.act(pmc, doc.id, { action: 'assess', version: doc.version, noImpact: true, note: '无影响' });
  assert.throws(() => store.remind(engineer, doc.id, request), { status: 409 });
  await worker.drain();
  const [review] = store.detail(admin, doc.id).reminderTargets;
  store.remind(admin, doc.id, { task: review.key, userId: review.userId, generation: review.generation });
  doc = store.act({ id: 'qa' }, doc.id, { action: 'approve', version: doc.version });
  await worker.drain();
  assert.equal(requests.length, 3);
  const final = store.detail(engineer, doc.id);
  assert.deepEqual(final.reminderTargets, []);
  assert.equal(final.deliveries.find(row => row.event === 'remind' && row.userId === 'qa').status, 'cancelled');
  assert.equal(final.change.status, 'closed');
  db.close();
});

test('submission alert only tracks this submission and waits for late recipients', () => {
  const row = (userId, event, generation, status) => ({ userId, event, generation, status, at: '' });
  const prior = [row('old-copy', 'cc', '2', 'failed'), row('pmc', 'remind', '6', 'failed')];
  const pmc = row('pmc', 'submit', '6', 'sent');
  const pending = row('copy', 'cc', '6', 'sending');
  const failed = { ...pending, status: 'unbound' };
  assert.deepEqual(submissionDeliveries([...prior, pmc, pending], 6), { pending: true, failures: [] });
  assert.deepEqual(submissionDeliveries([...prior, pmc, failed], 6), { pending: false, failures: [failed] });
  assert.deepEqual(submissionDeliveries([...prior, pmc, { ...pending, status: 'sent' }], 6), { pending: false, failures: [] });
});

test('a queued notice does not disclose the change after the recipient loses page permission', async () => {
  const db = new Database(':memory:');
  let revoked = false;
  const lookup = id => ({ id, status:'active', wecomUserid:id, permissions:revoked && id === 'pmc' ? [] : ['engineering_change'] });
  const store = createEngineeringChangeStore(db, lookup);
  const admin = { id:'admin', role:'admin' };
  const engineer = { id:'eng', permissions:['engineering_change','engineering_submit'] };
  store.configure(admin, { origin:'https://platform.example', pmc:'pmc', warehouse:'wh', departments:[{ name:'品质', userId:'qa' }] });
  const { id } = store.create(engineer, { submit:true, draft:{ title:'变更', content:'核对', routing:{ departments:['品质'] } } });
  revoked = true;
  const deliveries = [];
  await createChangeNotificationWorker(store, lookup, async user => { deliveries.push(user); }).drain();
  assert.deepEqual(deliveries, []);
  assert.equal(store.detail(admin,id).deliveries[0].status, 'permission_missing');
  assert.deepEqual(store.detail(admin,id).reminderTargets, []);
  assert.ok(store.detail(admin,id).reassignments.some(task => task.userId === 'pmc'));
  db.close();
});
