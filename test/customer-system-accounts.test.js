import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'teao-customer-accounts-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test-jwt-secret-for-customer-accounts';
process.env.CUSTOMER_ACCOUNTS_KEY = Buffer.alloc(32, 17).toString('base64');
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { registerCustomerAccountRoutes } = await import('../server/routes/customer-system-accounts.ts');
const { setUserPermission } = await import('../server/services/users.js');
const { closeCustomerAccounts, importCustomerAccountArchive } = await import('../server/services/customer-system-accounts.ts');

const admin = { id: 'admin', name: '管理员', username: 'admin', role: 'admin', status: 'active', permissions: [] };
const reader = { id: 'worker', username: 'worker', role: 'user', status: 'active', permissions: ['tools'] };
writeFileSync(join(dir, 'users.json'), JSON.stringify({ users: [admin, reader] }));
const login = (user) => jwt.sign({ id: user.id, passwordVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

test('customer accounts enforce live grants, preserve encrypted current passwords, and record changes atomically', async () => {
  const app = express();
  registerCustomerAccountRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/customer-system-accounts';
  const adminToken = login(admin);
  const readerToken = login(reader);
  const call = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.match(res.headers.get('cache-control'), /no-store/);
    return { status: res.status, body: await res.json() };
  };
  try {
    const initial = { company: ' 模拟公司 ', url: 'https://portal.example.test', username: '0004', password: ' original-test-secret ', note: '' };
    assert.equal((await call('GET', '', null)).status, 401);
    assert.equal((await call('GET', '', readerToken)).status, 403);
    assert.equal((await call('POST', '/passwords', readerToken, { ids: [] })).status, 403);
    assert.equal((await call('POST', '', adminToken, { ...initial, url: 'javascript:alert(1)' })).status, 400);
    assert.equal((await call('POST', '', adminToken, { ...initial, note: '临时密码 original-test-secret' })).status, 400);
    const malformed = await fetch(base, {
      method: 'POST', headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: '{"password":"malformed-test-secret", invalid}',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.text()).includes('malformed-test-secret'), false);
    const created = await call('POST', '', adminToken, initial);
    assert.equal(created.status, 201);
    const entry = created.body.data;
    assert.equal(entry.company, '模拟公司');
    assert.equal(entry.username, '0004');
    assert.equal(Object.hasOwn(entry, 'password'), false);
    const item = '/' + entry.id;
    assert.equal((await call('POST', item + '/reveal', readerToken)).status, 403);

    assert.equal((await setUserPermission(reader.id, 'customer_accounts_view', true)).ok, true);
    const list = await call('GET', '', readerToken);
    assert.deepEqual(list.body.data, [entry]);
    assert.deepEqual((await call('POST', '/passwords', readerToken, { ids: [entry.id] })).body.data, { [entry.id]: initial.password });
    assert.equal((await call('POST', '/passwords', readerToken, { ids: Array(21).fill(entry.id) })).status, 400);
    assert.equal((await call('POST', item + '/reveal', readerToken)).body.data.password, initial.password);
    assert.equal((await call('PUT', item, readerToken, entry)).status, 403);
    assert.equal((await call('GET', item + '/history', readerToken)).status, 403);

    const importResult = await call('POST', '/import', adminToken, { rows: [
      { rowNumber: 3, account: initial },
      { rowNumber: 4, account: { ...initial, username: '0005' } },
    ] });
    assert.deepEqual(importResult.body.data, { imported: 1, duplicates: [3] });

    const newPassword = 'replacement-test-secret';
    const replacement = { revision: entry.revision, password: newPassword, reason: '客户已改密' };
    assert.equal((await call('PUT', item + '/password', adminToken, { ...replacement, password: initial.password })).body.data.revision, entry.revision);
    const dbFile = join(dir, 'customer-system-accounts.db');
    const inspection = new Database(dbFile);
    inspection.exec("CREATE TRIGGER reject_history BEFORE INSERT ON customer_account_password_changes BEGIN SELECT RAISE(ABORT, 'fixture'); END");
    assert.equal((await call('PUT', item + '/password', adminToken, replacement)).status, 500);
    assert.equal((await call('PUT', item, adminToken, { ...entry, company: '不应保存', password: newPassword })).status, 500);
    assert.equal((await call('GET', '', adminToken)).body.data.find(account => account.id === entry.id).company, entry.company);
    assert.equal((await call('POST', item + '/reveal', readerToken)).body.data.password, initial.password);
    inspection.exec('DROP TRIGGER reject_history');
    inspection.close();

    assert.equal((await call('PUT', item + '/password', adminToken, replacement)).status, 200);
    assert.equal((await call('PUT', item + '/password', adminToken, replacement)).status, 409);
    assert.equal((await call('POST', item + '/reveal', readerToken)).body.data.password, newPassword);
    const history = await call('GET', item + '/history', adminToken);
    assert.equal(history.body.data.length, 1);
    assert.equal(history.body.data[0].reason, replacement.reason);
    assert.equal(history.body.data[0].actorName, admin.name);
    for (const password of [initial.password, newPassword]) {
      assert.equal(JSON.stringify(history).includes(password), false);
      assert.equal(readFileSync(dbFile).includes(password), false);
    }
    const internal = await call('POST', '', adminToken, {
      company: '保安室门禁', password: 'internal-test-password',
    });
    assert.equal(internal.status, 201);
    assert.equal(internal.body.data.url, '');
    assert.equal(internal.body.data.username, '');
    assert.equal((await call('POST', '/import', adminToken, { rows: [
      { rowNumber: 88, account: { company: '不完整导入', password: 'internal-test-password' } },
    ] })).status, 400);

    const itemPath = '/' + internal.body.data.id;
    const edit = { ...internal.body.data, company: '门禁新名称', note: '第 1 步：开门', password: 'row-update-password' };
    const edited = await call('PUT', itemPath, adminToken, edit);
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.company, edit.company);
    assert.equal((await call('POST', itemPath + '/reveal', readerToken)).body.data.password, edit.password);
    assert.equal((await call('GET', itemPath + '/history', adminToken)).body.data.length, 1);
    assert.equal((await call('PUT', itemPath, adminToken, edit)).status, 409);
    const detailsOnly = await call('PUT', itemPath, adminToken, { ...edited.body.data, note: '修改备注', password: '' });
    assert.equal(detailsOnly.status, 200);
    assert.equal((await call('GET', itemPath + '/history', adminToken)).body.data.length, 1);

    const incomplete = { company: '', url: 'invalid://url', username: 'fixture-incomplete', password: '', note: '' };
    const hash = 'a'.repeat(64);
    const archived = [34, 50].map(rowNumber => ({
      rowNumber, account: incomplete, issues: ['缺少公司名称和密码'],
      cells: [
        { column: 'G', value: '【附加凭据1】账号=fixture｜密码=private-extra-test-value｜来源行=10｜关联步骤=第2步' },
        { column: 'H', value: '需要先连接VPN 账号：vpn-test-user 密码：vpn-test-password' },
      ],
    }));
    assert.deepEqual(importCustomerAccountArchive(hash, archived), { created: 1, merged: 1, skipped: 0 });
    assert.deepEqual(importCustomerAccountArchive(hash, archived), { created: 0, merged: 0, skipped: 2 });
    const archivedList = await call('GET', '', readerToken);
    const partial = archivedList.body.data.find(row => row.username === incomplete.username);
    assert.equal(partial.hasPassword, false);
    assert.equal(partial.url, '');
    assert.deepEqual(partial.sourceRows.map(row => row.rowNumber), [34, 50]);
    assert.equal((await call('POST', '/' + partial.id + '/reveal', readerToken)).status, 404);
    assert.equal((await call('POST', '/' + partial.id + '/source', readerToken)).status, 403);
    const extra = await call('POST', '/' + partial.id + '/supplemental-passwords', readerToken);
    assert.equal(extra.status, 200);
    assert.deepEqual(extra.body.data.slice(0, 2), [
      { username: 'fixture', password: 'private-extra-test-value', step: '第2步' },
      { username: 'vpn-test-user', password: 'vpn-test-password', step: 'VPN 登录' },
    ]);
    assert.equal(JSON.stringify(archivedList).includes('private-extra-test-value'), false);
    assert.equal(readFileSync(dbFile).includes('private-extra-test-value'), false);
    assert.equal((await call('POST', '/' + partial.id + '/source', adminToken)).body.data.length, 2);
    assert.equal((await setUserPermission(reader.id, 'customer_accounts_view', false)).ok, true);
    assert.equal((await call('GET', '', readerToken)).status, 403);
    assert.equal((await call('POST', '/passwords', readerToken, { ids: [] })).status, 403);
    assert.equal((await call('POST', '/' + partial.id + '/supplemental-passwords', readerToken)).status, 403);
    assert.equal((await call('POST', item + '/reveal', readerToken)).status, 403);
    closeCustomerAccounts();
    process.env.CUSTOMER_ACCOUNTS_KEY = Buffer.alloc(32, 18).toString('base64');
    assert.equal((await call('GET', '', adminToken)).status, 503);
  } finally {
    closeCustomerAccounts();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
