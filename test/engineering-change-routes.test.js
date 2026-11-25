import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'engineering-change-routes-'));
process.env.JWT_SECRET = 'engineering-change-integration-test-secret';
const users = ['eng', 'pmc', 'qa', 'wh', 'admin', 'stranger', 'noAccess'].map(id => ({
  id, username: id, name: id, status: 'active', role: id === 'admin' ? 'admin' : 'user',
  permissions: id === 'admin' || id === 'noAccess' ? [] : ['engineering_change', ...(id === 'eng' ? ['engineering_submit'] : [])], passwordVersion: 0,
}));
writeFileSync(path.join(process.env.DATA_DIR, 'users.json'), JSON.stringify({ users }));
writeFileSync(path.join(process.env.DATA_DIR, 'employees.json'), JSON.stringify({ employees: [
  { id: 'qa', employeeNo: 'TA-001', name: 'qa', department: '品质', position: '主管', status: 'active' },
  { id: 'other', employeeNo: 'TA-002', name: 'other', department: '工程', position: '工程师', status: 'active' },
] }));
const { registerEngineeringChangeRoutes } = await import('../server/routes/engineering-changes.ts');
const { registerNotificationRoutes } = await import('../server/routes/notifications.js');
const { closeDB } = await import('../server/services/standard-store.js');
const { setUserPermission } = await import('../server/services/users.js');

test('authenticated engineering change routes and notification endpoint honor cross-department assignment', async () => {
  const app = express();
  app.use(express.json());
  const worker = registerEngineeringChangeRoutes(app);
  registerNotificationRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = '/api/engineering-changes';
  const tokens = new Map(users.map(user => [user.id, jwt.sign(user, process.env.JWT_SECRET)]));
  async function call(user, url, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: { authorization: `Bearer ${tokens.get(user)}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const config = { pmc: 'pmc', warehouse: 'wh', departments: [{ name: '品质', userId: 'qa' }] };
    assert.equal((await call('stranger', `${base}/settings`, 'PUT', config)).status, 403);
    assert.equal((await call('admin', `${base}/settings`, 'PUT', config)).status, 200);
    assert.equal((await call('admin', `${base}/settings`, 'PUT', { ...config, pmc: 'noAccess' })).status, 400);
    const draftOptions = (await call('eng', `${base}/draft-options`)).body.data;
    assert.equal(draftOptions.people.find(row => row.id === 'noAccess').canAccess, false);
    assert.equal((await call('noAccess', `${base}?scope=pending`)).status, 403);
    assert.equal((await call('pmc', base, 'POST')).status, 403);
    const created = await call('eng', base, 'POST', { draft: { title: '待补充' } });
    assert.equal(created.status, 200);
    const url = `${base}/${created.body.data.id}`;
    const save = await call('eng', `${url}/actions`, 'POST', { action: 'save', version: 1,
      draft: { title: '工程变更', routing: { departments: ['品质'] }, reason: '测试', before: 'A', after: 'B', effective: '下批',
        materials: [{ id: 'm', name: '样品', code: 'M1', unit: '个' }] } });
    assert.equal(save.status, 200);
    assert.equal((await call('eng', `${url}/actions`, 'POST', { action: 'submit', version: 2 })).status, 200);
    assert.equal((await call('stranger', url)).status, 404);
    assert.equal((await call('noAccess', url)).status, 403);
    assert.equal((await call('noAccess', `${url}/attachments/missing`)).status, 403);
    assert.equal((await call('noAccess', `${url}/actions`, 'POST', { action:'approve', version:3 })).status, 403);
    assert.equal((await call('admin', `${url}/actions`, 'POST', { action:'reassign', version:3,
      task:'assessment', userId:'noAccess', note:'测试改派' })).status, 400);
    try {
      assert.equal((await setUserPermission('pmc', 'engineering_change', false)).ok, true);
      assert.equal((await call('pmc', url)).status, 403);
      assert.equal((await call('pmc', '/api/notifications')).body.total, 0);
    } finally {
      assert.equal((await setUserPermission('pmc', 'engineering_change', true)).ok, true);
    }
    assert.equal((await call('pmc', url)).status, 200);
    assert.equal((await call('pmc', `${url}/inventory?materialId=other`)).status, 400);
    assert.equal((await call('eng', `${url}/inventory?materialId=m`)).status, 403);
    const notices = await call('pmc', '/api/notifications');
    assert.equal(notices.body.total, 1);
    assert.equal(notices.body.data[0].link, `/engineering-changes?changeId=${created.body.data.id}`);
    const assessment = { action: 'assess', version: 3, note: '无报废', materials: save.body.data.change.draft.materials,
      lines: [{ materialId: 'm', warehouseScope: '半成品仓', warehouse: '仓', stock: '0', semi: '0', wip: '0', scrap: '0', sourceKind: '现场盘点', source: '人工', checkedAt: '2026-11-24T01:00:00.000Z', disposition: '无剩余物料' }] };
    assert.equal((await call('pmc', `${url}/actions`, 'POST', assessment)).status, 200);
    assert.equal((await call('qa', `${base}?scope=pending`)).body.data.rows.length, 1);
    assert.equal((await call('qa', `${url}/actions`, 'POST', { action: 'approve', version: 4 })).body.data.change.status, 'closed');
    assert.equal((await call('qa', '/api/notifications')).body.total, 0);
    assert.equal((await call('eng', `${base}/draft-check`)).body.data, null);
    assert.equal((await call('eng', base, 'POST', { draft: { title: ' ' } })).status, 400);
    assert.equal((await call('eng', base, 'POST', { submit: true, draft: { title: '未填正文' } })).status, 400);
    assert.equal((await call('eng', `${base}/draft-check`)).body.data, null);
    const attempts = await Promise.all(['一号草稿', '二号草稿'].map(title => call('eng', base, 'POST', { draft: { title } })));
    assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
    const savedDraft = attempts.find(result => result.status === 200).body.data;
    assert.equal((await call('eng', `${base}/draft-check`)).body.data.id, savedDraft.id);
    const discard = await call('eng', `${base}/${savedDraft.id}/actions`, 'POST', { action: 'discard', version: savedDraft.version });
    assert.equal(discard.body.data.change.status, 'discarded');
    assert.equal((await call('eng', `${base}/draft-check`)).body.data, null);
  } finally {
    await worker.drain();
    await new Promise(resolve => server.close(resolve));
  }
});

test('short application supports protected attachments, single-recipient CC and PMC-added materials', async () => {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  const worker = registerEngineeringChangeRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/engineering-changes`;
  const tokens = new Map(users.map(user => [user.id, jwt.sign(user, process.env.JWT_SECRET)]));
  const call = (user, path, method = 'GET', body) => fetch(url + path, {
    method, headers: { authorization: `Bearer ${tokens.get(user)}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = async response => {
    const payload = await response.json();
    assert.equal(response.status, 200, payload.error);
    return payload.data;
  };
  try {
    await data(await call('admin', '/settings', 'PUT', { origin: 'https://platform.example', pmc: 'pmc', warehouse: 'wh',
      departments: [{ name: '品质', userId: 'qa' }] }));
    const doc = await data(await call('eng', '', 'POST', { draft: { title: '待补充' } }));
    const id = '/' + doc.id;
    async function act(user, action, version, values = {}) {
      return data(await call(user, id + '/actions', 'POST', { action, version, ...values }));
    }
    const options = await data(await call('eng', id + '/draft-options'));
    assert.deepEqual(options.defaults, { pmc: 'pmc', warehouse: 'wh' });
    assert.deepEqual(options.departments, [{ name: '工程', unavailableReason: '花名册未标明主管' }, { name: '品质', userId: 'qa' }]);
    const picker = await data(await call('eng', id + '/cc-options'));
    assert(picker.some(row => row.id === 'wh'));
    assert(!picker.some(row => row.id === 'eng'));
    assert.equal((await call('pmc', id + '/cc-options')).status, 404);
    const draft = { title: '调整扭矩', content: '改为 1.0，旧库存用完后切换', ccUserId: 'wh', routing: { departments: ['品质'], warehouse: 'qa' } };
    assert.equal((await call('eng', id + '/actions', 'POST', { action: 'save', version: 1, draft,
      uploads: [{ name: '客户通知.pdf', mime: 'application/pdf', base64: Buffer.from('<html>').toString('base64') }],
    })).status, 400);
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2n8AAAAASUVORK5CYII=', 'base64');
    const saved = await act('eng', 'save', 1, { draft,
      uploads: [{ name: '库存.png', mime: 'image/png', base64: bytes.toString('base64') }] });
    const file = saved.change.draft.attachments[0];
    const download = id + '/attachments/' + file.id;
    assert.equal((await call('wh', download)).status, 404);
    const submitted = await act('eng', 'submit', 2);
    assert.equal(submitted.change.assignment.warehouse, 'qa');
    await worker.drain();
    const copied = await data(await call('wh', id));
    assert.deepEqual(copied.actions, []);
    assert.equal(copied.deliveries.find(row => row.event === 'cc').status, 'unbound');
    assert.equal((await call('stranger', download)).status, 404);
    const fileResponse = await call('wh', download);
    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get('content-type'), 'image/png');
    assert.equal(fileResponse.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), bytes);
    assert.equal((await call('wh', id + '/materials?search=M')).status, 403);
    assert.deepEqual(await data(await call('pmc', id + '/materials')), []);
    const assessment = await act('pmc', 'assess', 3, { note: '旧库存正常消耗',
      materials: [{ id: 'm', code: 'M1', name: '样品', unit: '个' }],
      lines: [{ materialId: 'm', warehouseScope: '半成品仓', warehouse: '仓', stock: '3', semi: '1', wip: '1', scrap: '0', sourceKind: '现场盘点', source: '人工', checkedAt: '2026-11-24T01:00:00.000Z', disposition: '按原用途继续使用' }] });
    assert.deepEqual(assessment.change.draft.materials, []);
    assert.equal(assessment.change.rounds[0].affectedMaterials[0].id, 'm');
    assert.equal(assessment.change.rounds[0].draft.attachments[0].id, file.id);
    await act('qa', 'return', 4, { target: 'engineering', note: '请补客户通知' });
    await act('eng', 'save', 5, { draft: { ...draft, ccUserId: 'stranger' }, attachmentIds: [] });
    await act('eng', 'submit', 6);
    assert.equal((await call('wh', download)).status, 404);
    assert.equal((await call('stranger', download)).status, 200, '附件随原会签轮次保存');
  } finally {
    await worker.drain();
    await new Promise(resolve => server.close(resolve));
  }
});

test('list includes applicant and current assignment, inventory follows assessment and approved scrap permissions', async () => {
  const app = express();
  app.use(express.json());
  let unavailable = false;
  const worker = registerEngineeringChangeRoutes(app, async id => {
    assert.equal(id, 'm');
    if (unavailable) throw new Error('offline');
    return { data: [{ warehouseScope: '半成品仓', warehouse: '样本仓', position: '', unit: '个', stock: '12', available: '10' }], fetchedAt: '2026-11-23T00:00:00Z' };
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/engineering-changes`;
  const tokens = new Map(users.map(user => [user.id, jwt.sign(user, process.env.JWT_SECRET)]));
  async function call(user, path, method = 'GET', body) {
    const response = await fetch(url + path, { method, body: JSON.stringify(body),
      headers: { authorization: `Bearer ${tokens.get(user)}`, 'content-type': 'application/json' } });
    return { status: response.status, body: await response.json() };
  }

  try {
    assert.equal((await call('admin', '/settings', 'PUT', { pmc: 'pmc', warehouse: 'wh' })).status, 200);
    const created = await call('eng', '', 'POST', { submit: true, draft: {
      title: '报废库存参考', content: '需要核对', routing: { departments: ['品质'] },
      materials: [{ id: 'm', code: 'S001', name: '样品', unit: '个' }],
    } });
    assert.equal(created.status, 200);
    const doc = created.body.data;
    const id = '/' + doc.id;
    const inventory = id + '/inventory?materialId=m';
    assert.equal((await call('pmc', inventory)).body.data.data[0].available, '10');
    unavailable = true;
    assert.equal((await call('pmc', inventory)).status, 503);
    unavailable = false;
    const assessment = await call('pmc', id + '/actions', 'POST', { action: 'assess', version: doc.version, materials: doc.draft.materials,
      lines: [{ materialId: 'm', warehouseScope: '半成品仓', warehouse: '样本仓', stock: '12', semi: '0', wip: '0', scrap: '1', sourceKind: '现场盘点', source: '核对', checkedAt: '2026-11-24T01:00:00.000Z', disposition: '隔离待处理' }],
    });
    assert.equal(assessment.status, 200);
    const approved = await call('qa', id + '/actions', 'POST', { action: 'approve', version: assessment.body.data.change.version });
    assert.equal(approved.body.data.change.status, 'verify');
    assert.deepEqual(approved.body.data.tasks.map(task => task.userId), ['wh']);
    assert.equal((await call('qa', inventory)).status, 403);
    assert.equal((await call('pmc', inventory)).status, 403);
    assert.ok((await call('wh', id)).body.data.actions.includes('recordAndVerify'));
    const mine = (await call('eng', '?scope=mine')).body.data.rows.find(row => row.id === doc.id);
    assert.equal(mine.creatorName, 'eng');
    assert.equal(mine.submittedAt, doc.submittedAt);
    assert.equal(mine.materials[0].code, 'S001');
    assert.equal(mine.tasks[0].assignee, 'wh');
    assert.equal(mine.status, 'verify');
  } finally {
    await worker.drain();
    await new Promise(resolve => server.close(resolve));
    closeDB();
  }
});
