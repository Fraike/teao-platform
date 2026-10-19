import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express'), jwt = require('jsonwebtoken');
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'notification-routes-'));
process.env.JWT_SECRET = 'notification-test-secret-at-least-32-characters';
let users = [
  { id: 'reviewer', name: '乙', username: 'reviewer', role: 'user', status: 'active', permissions: ['engineering_review'], passwordVersion: 0 },
  { id: 'reader', name: '丙', username: 'reader', role: 'user', status: 'active', permissions: [], passwordVersion: 0 },
];
const saveUsers = () => writeFileSync(path.join(process.env.DATA_DIR, 'users.json'), JSON.stringify({ users }));
saveUsers();
const store = await import('../server/services/standard-store.js');
const { registerNotificationRoutes } = await import('../server/routes/notifications.js');
const { productionQueryMetrics } = await import('../server/middleware/request-metrics.js');

test('real notification route caps items, excludes self/drafts, applies live permission and measures UTF-8 body', async () => {
  const editor = { id: 'editor', name: '甲' };
  const add = (serialNo, submitter, pending = true) => {
    const standard = store.createStandard({ serialNo, customer: '中文客户', model: '型号', categoryKey: 'gear_damper', fields: {} }, submitter);
    if (pending) store.submitStandard(standard.id, submitter, { versionId: standard.versions[0].id, revision: standard.versions[0].revision });
  };
  for (let i = 0; i < 25; i++) add(`SP-${i}`, editor);
  add('SELF', users[0]); add('DRAFT', editor, false);
  const app = express(); app.use(productionQueryMetrics); registerNotificationRoutes(app);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const original = console.info, logs = [];
  console.info = line => logs.push(JSON.parse(line));
  const token = jwt.sign(users[0], process.env.JWT_SECRET);
  const call = async authorization => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notifications`, { headers: authorization ? { authorization: `Bearer ${authorization}` } : {} });
    const text = await response.text(); return { status: response.status, text, body: JSON.parse(text) };
  };
  try {
    let response = await call(token);
    assert.equal(response.status, 200); assert.equal(response.body.total, 25); assert.equal(response.body.data.length, 20);
    assert(!response.text.includes('SELF')); assert(!response.text.includes('DRAFT'));
    assert.equal(logs.at(-1).responseRows, 20);
    assert.equal(logs.at(-1).responseBytes, Buffer.byteLength(response.text));
    users = users.map(user => ({ ...user, permissions: [] })); saveUsers();
    response = await call(token);
    assert.deepEqual(response.body, { ok: true, data: [], total: 0 });
    assert.equal(logs.at(-1).responseRows, 0);
    response = await call();
    assert.equal(response.status, 401);
    assert.equal(logs.at(-1).responseBytes, Buffer.byteLength(response.text));
  } finally { console.info = original; await new Promise(resolve => server.close(resolve)); store.closeDB(); }
});
