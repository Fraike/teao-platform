import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '../config.js';
import type { StandardMaintenanceSettings, StandardMaintenanceInput, StandardMaintenanceUser } from '../../src/types/standardMaintenance.ts';

const settingsPath = () => process.env.STANDARD_MAINTENANCE_PATH || path.join(DATA_DIR, 'standard-maintenance.json');
const failure = (message: string, status = 400) => Object.assign(new Error(message), { status });

function validate(input: unknown): asserts input is StandardMaintenanceInput {
  if (!input || typeof input !== 'object') throw failure('请提交完整校对模式参数');
  const data = input as StandardMaintenanceInput;
  if (typeof data.enabled !== 'boolean') throw failure('校对模式开关参数无效');
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw failure('校对模式版本参数无效');
}

export function readStandardMaintenance(): StandardMaintenanceSettings {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    validate(data);
    if (!('updatedAt' in data) || !('updatedBy' in data) || typeof data.updatedAt !== 'string' || typeof data.updatedBy !== 'string') throw failure('校对模式配置损坏', 503);
    return { enabled: data.enabled, revision: data.revision, updatedAt: data.updatedAt, updatedBy: data.updatedBy };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { enabled: false, revision: 0, updatedAt: '', updatedBy: '' };
  }
}

export function writeStandardMaintenance(input: unknown, user: StandardMaintenanceUser): StandardMaintenanceSettings {
  validate(input);
  const current = readStandardMaintenance();
  if (input.revision !== current.revision) throw failure('校对模式配置已更新，请刷新后重试', 409);
  if (!Number.isSafeInteger(current.revision + 1)) throw failure('校对模式版本已超出范围', 409);
  const next = { enabled: input.enabled, revision: current.revision + 1,
    updatedAt: new Date().toISOString(), updatedBy: user.name || user.username || user.id };
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return next;
}

export function canMaintainStandards(user: StandardMaintenanceUser | null | undefined): boolean {
  if (!user || user.role === 'admin' || user.status !== 'active'
    || !user.permissions?.includes('engineering_submit') || !user.permissions.includes('engineering_maintain')) return false;
  try { return readStandardMaintenance().enabled; }
  catch { return false; }
}
