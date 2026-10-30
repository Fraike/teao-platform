import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express'), jwt = require('jsonwebtoken');
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'pending-overview-'));
process.env.JWT_SECRET = 'pending-overview-tests-only-secret-at-least-32';
process.env.PRODUCTION_CONFIG_PATH = path.join(process.env.DATA_DIR, 'config.json');
writeFileSync(process.env.PRODUCTION_CONFIG_PATH, JSON.stringify({ enabled: false, wecomWebhook: '' }));
const users = [
  { id: 'admin', role: 'admin', permissions: [] },
  { id: 'editor', role: 'user', permissions: ['engineering_submit'] },
  { id: 'reviewer', role: 'user', permissions: ['engineering_review', 'engineering_retire'] },
  { id: 'assigned', role: 'user', permissions: [] },
  { id: 'reader', role: 'user', permissions: [] },
].map(user => ({ ...user, name: user.id, username: user.id, status: 'active', passwordVersion: 0 }));
const save = () => writeFileSync(path.join(process.env.DATA_DIR, 'users.json'), JSON.stringify({ users })); save();
const { registerStandardRoutes } = await import('../server/routes/standards.js');
const store = await import('../server/services/standard-store.js');
const { createRetirementRequest } = await import('../server/services/standard-retirement.js');
const app = express(); app.use(express.json()); registerStandardRoutes(app);
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const call = async (user, query = '') => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/standards/pending-reviews${query}`, { headers: user ? { authorization: `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}` } : {} });
  return { status: response.status, body: await response.json() };
};
const create = (code, category = 'gear_damper', author = users[1]) => store.createStandard({ serialNo: code, customer: '客户', model: '型号', categoryKey: category, fields: {} }, author);
function pending(code, category, reviewerId = 'reviewer', author = users[1]) {
  const detail = create(code, category, author), version = detail.versions[0];
  return store.submitStandard(detail.id, author, { versionId: version.id, revision: version.revision, reviewerId, reviewerName: reviewerId });
}
try {
  for (let i = 0; i < 25; i++) pending(`SP-${i}`, i % 2 ? 'rack_damper' : 'gear_damper');
  const assigned = pending('ASSIGNED', 'barrel_damper', 'assigned');
  store.getDB().prepare('UPDATE product_standards SET category_key=? WHERE id=?').run('gear_damper', assigned.id);
  const legacy = pending('LEGACY', 'rack_damper');
  store.getDB().prepare("UPDATE product_standard_versions SET assigned_reviewer_id='',assigned_reviewer_name='' WHERE id=?").run(legacy.versions[0].id);
  const self = pending('SELF', 'gear_damper', 'assigned', users[2]);
  store.getDB().prepare('UPDATE product_standard_versions SET assigned_reviewer_id=? WHERE id=?').run('reviewer', self.versions[0].id);
  create('DRAFT');
  const published = create('RETIRE', 'barrel_damper', users[0]), version = published.versions[0];
  createRetirementRequest(published.id, { versionId: version.id, revision: version.revision, reviewerId: 'reviewer', reason: '不再使用' }, users[1]);
  assert.equal((await call(null)).status, 401);
  const first = await call(users[2]);
  assert.equal(first.status, 200); assert.equal(first.body.overallTotal, 27); assert.equal(first.body.total, 27);
  assert.equal(first.body.data.length, 20); assert.equal(first.body.categories.length, 3);
  assert.equal(first.body.categories.reduce((sum, category) => sum + category.total, 0), 27);
  assert(!first.body.data.some(item => item.serialNo === 'SELF'));
  assert(first.body.data.every(item => !('fields' in item) && !('history' in item)));
  const second = await call(users[2], '?page=2');
  assert.equal(second.body.data.length, 7);
  assert.equal(new Set([...first.body.data, ...second.body.data].map(item => item.taskId)).size, 27);
  const filtered = await call(users[2], '?category=barrel_damper&pageSize=3');
  assert.equal(filtered.body.total, 1); assert.equal(filtered.body.overallTotal, 27); assert.equal(filtered.body.categories.length, 3);
  assert.equal(filtered.body.data[0].kind, 'retirement'); assert.equal(filtered.body.data[0].categoryName, '圆筒阻尼器');
  const own = await call(users[3]); assert.equal(own.body.total, 1); assert.equal(own.body.data[0].id, assigned.id);
  assert.equal(own.body.data[0].categoryKey, 'barrel_damper', 'category comes from the pending version');
  assert.equal((await call(users[4])).body.overallTotal, 0);
  const all = await call(users[0]); assert.equal(all.body.total, 29); assert(all.body.data.every(item => 'reviewerName' in item));
  for (const query of ['?page=0', '?pageSize=-1', '?category[bad]=x']) assert.equal((await call(users[2], query)).status, 400);
  users[2].permissions = []; save();
  const revoked = await call(users[2]); assert.equal(revoked.body.total, 25, 'assigned standards remain visible, legacy and retirement require live privileges');
  users[2].status = 'disabled'; save(); assert.equal((await call(users[2])).status, 401);
  store.reviewStandard(assigned.id, { versionId: assigned.versions[0].id, revision: assigned.versions[0].revision, approve: false, comment: '修改' }, users[3]);
  assert.equal((await call(users[3])).body.total, 0);
  console.log('Cross-category pending overview: pagination, totals, live permissions, self/legacy, retirement and state changes passed.');
} finally { await new Promise(resolve => server.close(resolve)); store.closeDB(); }
