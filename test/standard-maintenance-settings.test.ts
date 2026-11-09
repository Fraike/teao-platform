import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'standard-maintenance-'));
process.env.STANDARD_MAINTENANCE_PATH = path.join(directory, 'settings.json');
const { readStandardMaintenance, writeStandardMaintenance, canMaintainStandards } = await import('../server/services/standard-maintenance.ts');
const actor = { id: 'admin', name: '管理员', role: 'admin', status: 'active', permissions: [] };
const employee = { id: 'employee', role: 'user', status: 'active', permissions: ['engineering_submit', 'engineering_maintain'] };
test('isolated settings default off, validate input, persist privately and reject stale revisions', () => {
  try {
    assert.deepEqual(readStandardMaintenance(), { enabled: false, revision: 0, updatedAt: '', updatedBy: '' });
    assert.equal(fs.existsSync(process.env.STANDARD_MAINTENANCE_PATH!), false);
    assert.equal(canMaintainStandards(employee), false);
    for (const input of [null, {}, { enabled: 1, revision: 0 }, { enabled: true, revision: -1 }, { enabled: true, revision: 0.5 }]) {
      assert.throws(() => writeStandardMaintenance(input, actor), { status: 400 });
    }
    const next = writeStandardMaintenance({ enabled: true, revision: 0 }, actor);
    assert.equal(next.revision, 1);
    assert.equal(next.updatedBy, '管理员');
    assert.ok(Date.parse(next.updatedAt));
    assert.equal(fs.statSync(process.env.STANDARD_MAINTENANCE_PATH!).mode & 0o777, 0o600);
    assert.deepEqual(readStandardMaintenance(), next);
    assert.throws(() => writeStandardMaintenance({ enabled: false, revision: 0 }, actor), { status: 409 });
    assert.equal(canMaintainStandards(employee), true);
    for (const user of [null, actor, { ...employee, status: 'disabled' }, { ...employee, permissions: ['engineering_maintain'] }, { ...employee, permissions: ['engineering_submit'] }]) assert.equal(canMaintainStandards(user), false);
    writeStandardMaintenance({ enabled: false, revision: 1 }, actor);
    assert.equal(canMaintainStandards(employee), false);
    fs.writeFileSync(process.env.STANDARD_MAINTENANCE_PATH!, '{broken');
    assert.throws(() => readStandardMaintenance());
    assert.equal(canMaintainStandards(employee), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
