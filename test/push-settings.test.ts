import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-settings-'));
process.env.DATA_DIR = dir;
process.env.PRODUCTION_CONFIG_PATH = path.join(dir, 'production.json');
process.env.PUSH_SETTINGS_PATH = path.join(dir, 'push.json');
const { readConfig, writeConfig } = await import('../server/config.js');
const { readPushSettings, writePushSettings, pushAllowed, onPushSettingsChange } = await import('../server/services/push-settings.ts');
const user = { id: 'admin-1', name: '管理员' };
test('defaults, full validation, revision, live production config, private whitelist and listeners', () => {
  let calls = 0;
  const off = onPushSettingsChange(() => { calls++; });
  const initial = readPushSettings();
  assert.equal(calls, 0);
  assert.equal(initial.enabled, true);
  assert.equal(initial.standardReviewEnabled, false);
  assert.deepEqual(initial.reviewTimes, ['08:10', '13:00']);
  assert.equal(pushAllowed('standardPublication'), false);
  assert.throws(() => writePushSettings({ enabled: true }, user), /参数|完整/);
  const saved = writePushSettings({ ...initial, standardReviewEnabled: true, reviewTimes: ['13:00','08:10'], productionTime: '09:05' }, user);
  assert.equal(saved.revision, 1);
  assert.equal(calls, 1);
  assert.equal(readConfig().cronExpression, '0 5 9 * * *');
  assert.equal(fs.statSync(process.env.PUSH_SETTINGS_PATH!).mode & 0o777, 0o600);
  assert.throws(() => writePushSettings(initial, user), /版本/);
  assert.throws(() => writePushSettings({ ...saved, reviewTimes: ['08:10','08:10'] }, user), /重复/);
  writeConfig({ ...readConfig(), enabled: false, cronExpression: '*/5 * * * *', wecomWebhook: 'secret' });
  assert.throws(() => writePushSettings(saved, user), /生产推送配置已更新/);
  const live = readPushSettings();
  assert.equal(live.productionEnabled, false);
  assert.equal(live.productionTime, null);
  assert.equal(live.productionScheduleLegacy, true);
  assert.equal(pushAllowed('production'), false);
  writePushSettings({ ...live, productionEnabled: true }, user);
  assert.equal(readConfig().cronExpression, '*/5 * * * *');
  const disk = JSON.parse(fs.readFileSync(process.env.PUSH_SETTINGS_PATH!, 'utf8'));
  assert.equal('productionEnabled' in disk, false);
  assert.equal('wecomWebhook' in readPushSettings(), false);
  off();
});
test('failed atomic rename does not report success, change revision or notify', () => {
  const before = readPushSettings();
  let calls = 0;
  const off = onPushSettingsChange(() => calls++);
  const rename = fs.renameSync;
  fs.renameSync = () => { throw new Error('disk failure'); };
  try { assert.throws(() => writePushSettings({ ...before, enabled: !before.enabled }, user), /disk failure/); }
  finally { fs.renameSync = rename; off(); }
  assert.equal(readPushSettings().revision, before.revision);
  assert.equal(calls, 0);
});
test('Shanghai next times skip rest days and honor makeup workdays', () => {
  const now = Date.now;
  Date.now = () => Date.parse('2026-11-07T14:00:00+08:00');
  try {
    writeConfig({ ...readConfig(), enabled: true, restDays: ['2026-11-09'], makeupWorkdays: [] });
    const saved = writePushSettings({ ...readPushSettings(), enabled: true, standardReviewEnabled: true, productionTime: '09:05' }, user);
    assert.equal(saved.nextReviewAt, '2026-11-10T00:10:00.000Z');
    assert.equal(saved.nextProductionAt, '2026-11-10T01:05:00.000Z');
    writeConfig({ ...readConfig(), makeupWorkdays: ['2026-11-08'] });
    assert.equal(readPushSettings().nextReviewAt, '2026-11-08T00:10:00.000Z');
  } finally { Date.now = now; }
});
test('production write failure restores settings and never notifies', () => {
  const before = readPushSettings();
  const config = readConfig();
  const rename = fs.renameSync;
  let calls = 0;
  const off = onPushSettingsChange(() => calls++);
  fs.renameSync = (from, to) => {
    if (to === process.env.PRODUCTION_CONFIG_PATH) throw new Error('production disk failure');
    return rename(from, to);
  };
  try { assert.throws(() => writePushSettings({ ...before, productionEnabled: !before.productionEnabled }, user), /production disk failure/); }
  finally { fs.renameSync = rename; off(); }
  assert.equal(readPushSettings().revision, before.revision);
  assert.deepEqual(readConfig(), config);
  assert.equal(calls, 0);
});
