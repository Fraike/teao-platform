import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'teao-wecom-directory-'));
process.env.JWT_SECRET = 'wecom-directory-test-secret-at-least-32-characters';
const { readWecomDirectory, writeWecomDirectory } = await import('../server/services/wecom-directory.ts');
const { registerUser, listUsers, getUserById, getPendingWecomSuggestion, approveUser, setUserWecomUserid } =
  await import('../server/services/users.js');

const roster = [
  { name: '陈样例', userId: 'ChenDemo' },
  { name: '测试重名', userId: 'CaseA' },
  { name: '测试重名', userId: 'CaseB' },
  { name: '占用样例', userId: 'ChenDemo' },
  { name: '留空样例', userId: 'LeaveBlank' },
  { name: '人工样例', userId: 'OverrideDemo' },
];

async function register(name, username) {
  assert.deepEqual(await registerUser({ name, username, password: 'Test1234' }), { ok: true });
  return listUsers().find(user => user.username === username).id;
}

test('directory suggests unique unbound IDs and pending users stay unbound until approval', async () => {
  writeWecomDirectory(roster.filter(row => row.name !== '占用样例'));
  const id = await register('陈样例', 'directory-example');
  assert.equal(getUserById(id).wecomUserid, '');
  assert((await setUserWecomUserid(id, 'TooEarly')).error);
  assert.deepEqual(getPendingWecomSuggestion(id), { kind: 'matched', userId: 'ChenDemo' });
  assert.deepEqual(getPendingWecomSuggestion(id, [{ employeeNo: 'TA001', name: '陈样例', userId: 'other' }]), { kind: 'ambiguous' });
  assert.deepEqual(await approveUser(id, 'ChenDemo'), { ok: true });
  assert.equal(getUserById(id).wecomUserid, 'ChenDemo');
  assert.deepEqual(await setUserWecomUserid(id, 'ChenModified'), { ok: true, wecomUserid: 'ChenModified' });
  assert.equal(getUserById(id).wecomUserid, 'ChenModified');
  assert((await approveUser(id, 'ChenDemo')).error);
  assert.equal(getUserById(id).wecomUserid, 'ChenModified');
});

test('ambiguous names and occupied accounts require a decision, with manual override and blank supported', async () => {
  const owner = await register('人工样例', 'directory-manual');
  assert.deepEqual(await approveUser(owner, 'LeaveBlank'), { ok: true });
  const colliding = await register('留空样例', 'directory-empty');
  assert.equal(getPendingWecomSuggestion(colliding).kind, 'occupied');
  assert(await approveUser(colliding, 'leaveblank').then(result => result.error));
  assert.equal(getUserById(colliding).status, 'pending');
  assert.deepEqual(await approveUser(colliding, ''), { ok: true });
  assert.equal(getUserById(colliding).wecomUserid, '');
  assert.equal(getPendingWecomSuggestion(await register('测试重名', 'directory-duplicate')).kind, 'ambiguous');
  writeWecomDirectory(roster);
  const duplicateId = await register('占用样例', 'directory-duplicate-id');
  assert.equal(getPendingWecomSuggestion(duplicateId).kind, 'ambiguous');
  assert.equal(getUserById(owner).wecomUserid, 'LeaveBlank');
});

test('admin-only routes preview an import and apply the chosen binding on approval', async () => {
  const require = createRequire(new URL('../server/package.json', import.meta.url));
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { registerAdminRoutes } = await import('../server/routes/admin.js');
  const { initDefaultAdmin } = await import('../server/services/users.js');
  process.env.INITIAL_ADMIN_PASSWORD = 'DirectoryTest1234';
  process.env.NODE_ENV = 'production';
  await initDefaultAdmin();
  const admin = listUsers().find(user => user.role === 'admin');
  const active = listUsers().find(user => user.username === 'directory-example');
  const pendingId = await register('接口样例', 'directory-http');
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  const call = async (user, path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: {
      authorization: `Bearer ${jwt.sign({ id:user.id, passwordVersion: user.passwordVersion || 0 }, process.env.JWT_SECRET)}`,
      'content-type': 'application/json',
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const toFill = await register('补填样例', 'directory-backfill');
    const duplicate = await register('重名花名册', 'directory-conflict');
    await approveUser(toFill, '');
    await approveUser(duplicate, '');
    writeFileSync(join(process.env.DATA_DIR, 'employees.json'), JSON.stringify({ employees:
      ['陈样例', '补填样例', '重名花名册', '重名花名册'].map(name => ({ name, status: 'active' })),
    }));
    const members = [
      { name: '接口样例', userId: 'HttpExample' },
      { name: '无效账号', userId: 'bad id' },
      { name: '陈样例', userId: 'DoNotOverwrite' },
      { name: '补填样例', userId: 'Backfill@example.com' },
      { name: '重名花名册', userId: 'Duplicate' },
    ];
    assert.equal((await call(active, '/wecom-directory', 'PUT', { members })).status, 403);
    const path = `/users/${pendingId}/wecom-suggestion`;
    assert.equal((await call(active, path)).status, 403);
    const preview = await call(admin, '/wecom-directory/preview', 'POST', { members });
    const { bindingRevision, ...summary } = preview.body.data;
    assert.deepEqual(summary, { count: 4, invalidRows: 1, ambiguousNames: 0, ambiguousIds: 0, fillable: 1, unchanged: 0,
      conflicts: [{ name: '陈样例', reason: '已有企微账号与通讯录不同' }, { name: '重名花名册', reason: '姓名匹配不唯一' }] });
    assert.deepEqual((await call(admin, path)).body.data, { kind: 'missing' });
    assert.equal((await call(admin, '/wecom-directory', 'PUT', { members, bindingRevision: 'stale' })).status, 409);
    assert.equal((await call(admin, '/wecom-directory', 'PUT', { members, bindingRevision })).status, 200);
    assert.equal(getUserById(toFill).wecomUserid, 'Backfill@example.com');
    assert.equal(getUserById(duplicate).wecomUserid, '');
    const again = (await call(admin, '/wecom-directory/preview', 'POST', { members })).body.data;
    assert.equal(again.fillable, 0);
    assert.equal(again.unchanged, 1);
    assert.equal((await call(admin, '/wecom-directory', 'PUT', { members, bindingRevision: again.bindingRevision })).status, 200);
    assert.deepEqual((await call(admin, path)).body.data, { kind: 'matched', userId: 'HttpExample' });
    assert.equal((await call(admin, `/users/${pendingId}/approve`, 'POST', { wecomUserid: 'ManuallySelected' })).status, 200);
    assert.equal(getUserById(pendingId).wecomUserid, 'ManuallySelected');
    assert.equal(getUserById(active.id).wecomUserid, 'ChenModified');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('a failed binding write restores the previous directory', () => {
  const previous = readWecomDirectory();
  assert.throws(() => writeWecomDirectory([{ name: '回退样例', userId: 'Rollback' }], () => {
    throw new Error('binding write failed');
  }), /binding write failed/);
  assert.deepEqual(readWecomDirectory(), previous);
});
