import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DATA_DIR, readConfig, writeConfig, isRestDay } from '../config.js';
import type { PushSettings, PushSettingsInput, PushSettingsActor, PushChannel } from '../../src/types/pushSettings.ts';

type StoredSettings = Pick<PushSettings, 'enabled' | 'standardPublicationEnabled' | 'standardReviewEnabled' | 'reviewTimes' | 'revision' | 'updatedAt' | 'updatedBy'>;
const listeners = new Set<(settings: PushSettings) => void>();
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const settingsPath = () => process.env.PUSH_SETTINGS_PATH || path.join(DATA_DIR, 'push-settings.json');
const failure = (message: string, status = 400) => Object.assign(new Error(message), { status });

function productionRevision(config: ReturnType<typeof readConfig>): string {
  return createHash('sha256').update(JSON.stringify([config.enabled, config.cronExpression])).digest('hex');
}

function storedSettings(): StoredSettings {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    validate({ ...data, productionEnabled: true, productionTime: null });
    if (typeof data.updatedAt !== 'string' || typeof data.updatedBy !== 'string') throw failure('配置元数据损坏', 503);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { enabled: true, standardPublicationEnabled: false, standardReviewEnabled: false, reviewTimes: ['08:10', '13:00'], revision: 0, updatedAt: '', updatedBy: '' };
  }
}

function productionTime(cron: string): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length === 6 && fields.shift() !== '0') return null;
  if (fields.length !== 5 || fields.slice(2).some(v => v !== '*')) return null;
  if (!/^\d{1,2}$/.test(fields[0]) || !/^\d{1,2}$/.test(fields[1])) return null;
  const time = `${fields[1].padStart(2, '0')}:${fields[0].padStart(2, '0')}`;
  return timePattern.test(time) ? time : null;
}

function nextTime(times: string[], config: ReturnType<typeof readConfig>): string | null {
  const now = Date.now();
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  // Search beyond all explicitly configured holidays, then one full week.
  const lastRest = [...(config.restDays || []), today].sort().at(-1)!;
  const days = Math.max(8, Math.ceil((Date.parse(lastRest) - Date.parse(today)) / 86400000) + 8);
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10);
    if (isRestDay(day, config)) continue;
    for (const time of [...times].sort()) {
      const at = Date.parse(`${day}T${time}:00+08:00`);
      if (at > now) return new Date(at).toISOString();
    }
  }
  return null;
}

export function readPushSettings(): PushSettings {
  const stored = storedSettings();
  const config = readConfig();
  const time = productionTime(config.cronExpression);
  return {
    enabled: stored.enabled, standardPublicationEnabled: stored.standardPublicationEnabled,
    standardReviewEnabled: stored.standardReviewEnabled, reviewTimes: stored.reviewTimes,
    revision: stored.revision, productionRevision: productionRevision(config), updatedAt: stored.updatedAt, updatedBy: stored.updatedBy,
    productionEnabled: Boolean(config.enabled), productionTime: time,
    productionScheduleLegacy: time === null,
    nextReviewAt: stored.enabled && stored.standardReviewEnabled ? nextTime(stored.reviewTimes, config) : null,
    nextProductionAt: stored.enabled && config.enabled && time ? nextTime([time], config) : null,
  };
}

function validate(input: unknown): asserts input is PushSettingsInput {
  if (!input || typeof input !== 'object') throw failure('请提交完整配置参数');
  const data = input as PushSettingsInput;
  for (const key of ['enabled', 'standardPublicationEnabled', 'standardReviewEnabled', 'productionEnabled'] as const) {
    if (typeof data[key] !== 'boolean') throw failure('请提交完整配置参数');
  }
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw failure('配置版本参数无效');
  if (!Array.isArray(data.reviewTimes) || !data.reviewTimes.length || data.reviewTimes.some(t => typeof t !== 'string' || !timePattern.test(t))) throw failure('审核时间必须是非空 HH:mm 列表');
  if (new Set(data.reviewTimes).size !== data.reviewTimes.length) throw failure('审核时间不能重复');
  if (data.productionTime !== null && (typeof data.productionTime !== 'string' || !timePattern.test(data.productionTime))) throw failure('日报时间必须是 HH:mm 或 null');
}

export function writePushSettings(input: unknown, user: PushSettingsActor): PushSettings {
  validate(input);
  const current = storedSettings();
  if (input.revision !== current.revision) throw failure('配置版本已更新，请刷新后重试', 409);
  if (input.productionRevision !== productionRevision(readConfig())) throw failure('生产推送配置已更新，请刷新后重试', 409);
  const next = { enabled: input.enabled, standardPublicationEnabled: input.standardPublicationEnabled,
    standardReviewEnabled: input.standardReviewEnabled, reviewTimes: [...input.reviewTimes].sort(),
    revision: current.revision + 1, updatedAt: new Date().toISOString(), updatedBy: user.name || user.username || user.id };
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, file);
  try {
    const latest = readConfig();
    const cronExpression = input.productionTime === null ? latest.cronExpression : `0 ${Number(input.productionTime.slice(3))} ${Number(input.productionTime.slice(0, 2))} * * *`;
    if (latest.enabled !== input.productionEnabled || cronExpression !== latest.cronExpression) writeConfig({ ...latest, enabled: input.productionEnabled, cronExpression });
  } catch (error) {
    // Restore the settings file if the production config did not commit.
    if (previous) { fs.writeFileSync(temporary, previous, { mode: 0o600 }); fs.renameSync(temporary, file); }
    else { fs.writeFileSync(temporary, JSON.stringify(current), { mode: 0o600 }); fs.renameSync(temporary, file); }
    throw error;
  }
  const settings = readPushSettings();
  for (const listener of listeners) {
    try { listener(settings); } catch { console.error('[push-settings] configuration committed; listener failed'); }
  }
  return settings;
}

export function onPushSettingsChange(listener: (settings: PushSettings) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function pushAllowed(channel: PushChannel): boolean {
  const settings = readPushSettings();
  const keys = { standardPublication: 'standardPublicationEnabled', standardReview: 'standardReviewEnabled', production: 'productionEnabled' } as const;
  return settings.enabled && settings[keys[channel]] === true;
}
