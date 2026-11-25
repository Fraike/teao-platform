import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { createOrganizationStore } from '../server/services/organization.ts';
import { createEngineeringChangeStore } from '../server/services/engineering-changes.ts';

const staff = (employeeNo, name, department, status = 'active', position = '员工') =>
  ({ id: `employee-${employeeNo}`, employeeNo, name, department, status, position, phone: 'private', idCard: 'private', contractEndDate: 'private' });
const user = (id, name = id, wecomUserid = '') => ({ id, name, wecomUserid, status: 'active' });

test('organization reads HR membership, projects public fields, and checks rather than applying directory differences', () => {
  const db = new Database(':memory:');
  let employees = [staff('TA-001', '甲', '财务部'), staff('TA-002', '乙', '工程部'), staff('TA-003', '丙', '其他'),
    staff('TA-004', '丁', '财务部', 'resigned')];
  const users = [user('a', '甲', 'A1')];
  const directory = [
    { name: '甲', userId: 'A1', departments: ['特澳科技/行政部', '特澳科技/特澳内部群'] },
    { name: '仅在企微', userId: 'Y', departments: ['特澳科技/装配部'] },
    { name: '仅在群里', userId: 'Z', departments: ['特澳科技/特澳内部群'] },
  ];
  const org = createOrganizationStore(db, () => employees, () => users, () => directory);
  assert.deepEqual(org.view().departments.find(row => row.name === '财务部').members, [{ name: '甲' }]);
  assert(!JSON.stringify(org.view()).includes('private'));
  const first = org.reconcile().find(row => row.employeeNo === 'TA-001');
  assert.equal(first.kind, 'department_diff');
  assert.deepEqual(first.wecomDepartments, ['行政部']);
  assert.equal(first.suggestedUserId, 'a');
  assert(!org.reconcile().some(row => row.name === '仅在群里'));
  assert(org.reconcile().some(row => row.kind === 'wecom_only'));
  org.link('TA-001', 'a');
  employees = employees.map(row => row.employeeNo === 'TA-001' ? { ...row, department: '工程部' } : row);
  assert.equal(org.reconcile().find(row => row.employeeNo === 'TA-001').linkedUserId, 'a');
  assert.deepEqual(org.view().departments.find(row => row.name === '工程部').members.map(row => row.name).sort(), ['乙', '甲']);
  db.close();
});

test('HR positions route new changes and preserve existing assignments', () => {
  const db = new Database(':memory:');
  const employees = [
    staff('TA-001', '甲', '品质部', 'active', '主管'),
    staff('TA-002', '乙', '品质部', 'active', '副主管'),
    staff('TA-003', '丙', '工程部', 'active', '主管'),
    staff('TA-004', '丁', '装配部', 'active', '装配主管'),
    staff('TA-005', '戊', '注塑部', 'active', '主管'),
    staff('TA-006', '己', '注塑部', 'active', '主管'),
    staff('TA-007', '工程', '研发部', 'active', '主管助理'),
  ];
  const accounts = [user('qa', '甲'), user('lead', '乙'), user('engineering', '丙'), user('pmc'), user('wh')]
    .map(account => ({ ...account, permissions: ['engineering_change'] }));
  const lookup = id => accounts.find(row => row.id === id);
  const org = createOrganizationStore(db, () => employees, () => accounts, () => []);
  const store = createEngineeringChangeStore(db, lookup, org.routingConfig, () => true);
  const admin = { id: 'admin', role: 'admin' };
  const engineer = { id: 'eng', permissions: ['engineering_submit'] };
  const pmc = { id: 'pmc' };
  store.configure(admin, { pmc: 'pmc', warehouse: 'wh' });
  const submit = departments => store.create(engineer, {
    draft: { title: '参数调整', content: '更新记录', routing: { departments } }, submit: true,
  });
  const invalid = Object.fromEntries(org.view().departments.map(({ name, issue }) => [name, issue]));
  assert.match(invalid['装配部'], /平台账号/);
  assert.match(invalid['注塑部'], /多位主管/);
  assert.match(invalid['研发部'], /未标明主管/);
  assert.throws(() => submit(['注塑部']), { status: 400 });
  const old = submit(['品质部', '工程部']);
  assert.deepEqual(old.assignment.departments.map(row => row.userId), ['qa', 'engineering']);
  employees[0].position = '员工';
  employees[1].position = '品质主管';
  assert.equal(org.view().departments.find(row => row.name === '品质部').leader.name, '乙');
  assert.equal(submit(['品质部']).assignment.departments[0].userId, 'lead');
  assert.deepEqual(store.get(engineer, old.id).assignment, old.assignment);
  accounts.find(row => row.id === 'lead').status = 'suspended';
  assert.match(org.view().departments.find(row => row.name === '品质部').issue, /平台账号/);
  assert.throws(() => submit(['品质部']), { status: 400 });
  let current = store.act(pmc, old.id, { action: 'assess', version: old.version, noImpact: true, note: '无在制' });
  current = store.act({ id: 'qa' }, old.id, { action: 'approve', version: current.version });
  assert.equal(current.status, 'review');
  assert.equal(store.act({ id: 'engineering' }, old.id, { action: 'approve', version: current.version }).status, 'closed');
  db.close();
});

test('authenticated organization is public within the platform, employee files stay restricted by HR permission', async () => {
  const require = createRequire(new URL('../server/package.json', import.meta.url));
  const express = require('express');
  const jwt = require('jsonwebtoken');
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'organization-route-'));
  process.env.JWT_SECRET = 'organization-test-secret-at-least-32-characters';
  const rows = [
    { id: 'ordinary', role: 'user', permissions: [] },
    { id: 'production', role: 'user', permissions: ['production'] },
    { id: 'hr', role: 'user', permissions: ['hr'] },
    { id: 'admin', role: 'admin', permissions: [] },
  ].map(row => ({ ...row, username: row.id, name: row.id, status: 'active', passwordVersion: 0, wecomUserid: 'private-wecom-' + row.id }));
  writeFileSync(join(process.env.DATA_DIR, 'users.json'), JSON.stringify({ users: rows }));
  writeFileSync(join(process.env.DATA_DIR, 'employees.json'), JSON.stringify({
    employees: [{ ...staff('TA-001', '员工甲', '工程部'), id: 'hr-file' },
      { ...staff('TA-LEGACY', '旧档案', '工程部'), employeeNo: undefined }],
  }));
  const { registerOrganizationRoutes } = await import('../server/routes/organization.ts');
  const { registerEmployeeRoutes } = await import('../server/routes/employees.js');
  const { closeDB } = await import('../server/services/standard-store.js');
  const app = express();
  app.use(express.json());
  registerOrganizationRoutes(app);
  registerEmployeeRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (id, path, method = 'GET', data) => {
    const headers = { 'content-type': 'application/json' };
    if (id) headers.authorization = 'Bearer ' + jwt.sign({ id, passwordVersion: 0 }, process.env.JWT_SECRET);
    const response = await fetch(url + path, { method, headers, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await call('', '/organization')).status, 401);
    const publicView = await call('ordinary', '/organization');
    assert.equal(publicView.status, 200);
    assert.deepEqual(publicView.body.data.departments, [{ name: '工程部', members: [{ name: '员工甲' }, { name: '旧档案' }], leader: null, issue: '花名册未标明主管' }]);
    assert.equal((await call('ordinary', '/organization/settings')).status, 403);
    assert.equal((await call('ordinary', '/organization/wecom-bindings')).status, 403);
    assert.equal((await call('hr', '/organization/wecom-bindings')).status, 200);
    assert.equal((await call('admin', '/organization/employee-link', 'PUT', { employeeNo: 'TA-001', userId: 'hr' })).status, 200);
    assert.deepEqual((await call('admin', '/organization/wecom-bindings')).body.data.find(row => row.employeeId === 'hr-file'),
      { employeeId: 'hr-file', employeeNo: 'TA-001', status: 'linked', userId: 'hr', wecomUserid: 'private-wecom-hr' });
    assert.equal((await call('ordinary', '/employees')).status, 403);
    assert.equal((await call('production', '/employees/hr-file')).status, 403);
    assert.deepEqual((await call('production', '/employees/active-names')).body, [{ name: '员工甲' }, { name: '旧档案' }]);
    assert.equal((await call('hr', '/employees')).body[0].idCard, 'private');
    const legacyPath = '/employees/employee-TA-LEGACY';
    assert.equal((await call('hr', legacyPath)).status, 200);
    assert.equal((await call('hr', legacyPath, 'PUT', { remark: '仍为空' })).status, 400);
    assert.equal((await call('hr', legacyPath, 'PUT', { employeeNo: 'TA-100' })).status, 200);
    const employeeDraft = { name: '员工乙', department: '工程部', position: '员工' };
    const absent = await call('hr', '/employees', 'POST', { ...employeeDraft, employeeNo: '  ' });
    assert.equal(absent.status, 400);
    assert.match(absent.body.error, /工号为必填/);
    assert.equal((await call('hr', '/employees', 'POST', { ...employeeDraft, employeeNo: ' ta-001 ' })).status, 400);
    const created = await call('hr', '/employees', 'POST', { ...employeeDraft, employeeNo: ' ta-002 ' });
    assert.equal(created.status, 201);
    assert.equal(created.body.employeeNo, 'TA-002');
    assert.equal((await call('hr', '/employees/hr-file', 'PUT', { employeeNo: '' })).status, 400);
    assert.equal((await call('hr', '/employees/hr-file', 'PUT', { employeeNo: 'ta-002' })).status, 400);

    const draft = { employeeNo: 'ta-003', wecomBinding: { userId: 'hr', value: 'UpdatedWx' } };
    assert.equal((await call('hr', '/employees/hr-file', 'PUT', draft)).status, 403);
    assert.equal((await call('admin', '/employees/hr-file', 'PUT', { ...draft,
      wecomBinding: { userId: 'ordinary', value: 'UnexpectedRecipient' } })).status, 409);
    assert.equal((await call('admin', '/employees/hr-file', 'PUT', { ...draft,
      wecomBinding: { userId: 'hr', value: 'private-wecom-ordinary' } })).status, 400);
    assert.equal((await call('hr', '/employees/hr-file')).body.employeeNo, 'TA-001');
    const updated = await call('admin', '/employees/hr-file', 'PUT', draft);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.employeeNo, 'TA-003');
    assert.equal(updated.body.wecomBinding, undefined);
    assert.deepEqual((await call('admin', '/organization/wecom-bindings')).body.data.find(row => row.employeeId === 'hr-file'),
      { employeeId: 'hr-file', employeeNo: 'TA-003', status: 'linked', userId: 'hr', wecomUserid: 'UpdatedWx' });

  } finally {
    await new Promise(resolve => server.close(resolve));
    closeDB();
  }
});


test('roster registration distinguishes absence, duplicate matches, pending, disabled and linked accounts', () => {
  const db = new Database(':memory:');
  const staffList = ['未入平台', '重名', '待审', '停用', '关联'].map((name, i) => staff('TA-00' + i, name, '工程部'));
  const accounts = [user('a', '重名'), user('b', '重名'), { ...user('p', '待审'), status: 'pending' },
    { ...user('d', '停用'), status: 'disabled' }, user('l', '关联', 'LinkedWx')];
  const org = createOrganizationStore(db, () => staffList, () => accounts, () => [{ name: '未入平台', userId: 'DirectoryWx' }]);
  assert.deepEqual(org.bindings(), [
    { employeeId: 'employee-TA-000', employeeNo: 'TA-000', status: 'unregistered', wecomUserid: 'DirectoryWx' },
    { employeeId: 'employee-TA-001', employeeNo: 'TA-001', status: 'unlinked', wecomUserid: '' },
    { employeeId: 'employee-TA-002', employeeNo: 'TA-002', status: 'pending', wecomUserid: '' },
    { employeeId: 'employee-TA-003', employeeNo: 'TA-003', status: 'disabled', wecomUserid: '' },
    { employeeId: 'employee-TA-004', employeeNo: 'TA-004', status: 'linked', userId: 'l', wecomUserid: 'LinkedWx' },
  ]);
  db.close();
});


test('employees without an optional work number still match unique account names independently', () => {
  const db = new Database(':memory:');
  const staffList = [
    { ...staff('TA-001', '王样例', '行政部'), employeeNo: undefined },
    { ...staff('TA-002', '李样例', '行政部'), employeeNo: '' },
    { ...staff('TA-003', '待匹配', '行政部'), employeeNo: undefined },
    { ...staff('TA-004', '待匹配', '行政部'), employeeNo: undefined },
  ];
  const accounts = [user('w', '王样例', 'WangDemo'), user('l', '李样例', 'LiDemo'), user('d', '待匹配')];
  const org = createOrganizationStore(db, () => staffList, () => accounts, () => []);
  assert.deepEqual(org.bindings().map(({ employeeId, status, wecomUserid }) => [employeeId, status, wecomUserid]), [
    ['employee-TA-001', 'linked', 'WangDemo'],
    ['employee-TA-002', 'linked', 'LiDemo'],
    ['employee-TA-003', 'unlinked', ''],
    ['employee-TA-004', 'unlinked', ''],
  ]);
  db.close();
});
