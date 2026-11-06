import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {normalizeAssemblyLine} from '../shared/assembly-lines.ts';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows = db => db.prepare('SELECT * FROM assembly_records ORDER BY id').all();
const businessHash = records => hash(records.map(record => {
  const copy = {...record}; delete copy.line; delete copy.updated_at; delete copy.updated_by; return copy;
}));
const fail = message => { throw new Error(message); };

export function previewAssemblyLineRepair(db) {
  const records = rows(db), changes = [], unknown = new Map(), counts = new Map();
  for (const record of records) {
    let line;
    try { line = normalizeAssemblyLine(record.line); }
    catch { unknown.set(record.line, (unknown.get(record.line) || 0) + 1); continue; }
    if (line === record.line) continue;
    changes.push({before: record, to: line});
    const key = JSON.stringify([record.line, line]); counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {fingerprint: hash(records), total: records.length, affected: changes.length, changes,
    mappings: [...counts].map(([key, count]) => { const [from, to] = JSON.parse(key); return {from, to, count}; }),
    unknown: [...unknown].map(([line, count]) => ({line, count}))};
}

function rollbackChanges(db, manifest) {
  if (manifest.kind !== 'assembly-line-repair-v1' || manifest.database !== path.resolve(db.name)) fail('修复清单与数据库不匹配');
  const seen = new Set(), changes = [], conflicts = [];
  const read = db.prepare('SELECT * FROM assembly_records WHERE id=?');
  for (const change of manifest.changes) {
    if (seen.has(change.before.id) || normalizeAssemblyLine(change.before.line) !== change.to) fail('修复清单无效');
    seen.add(change.before.id);
    const current = read.get(change.before.id);
    if (!current || hash(current) !== change.afterHash) conflicts.push(change.before.id);
    else changes.push({before: current, to: change.before.line});
  }
  return {changes, conflicts};
}

export function previewAssemblyLineRollback(db, manifest) {
  const result = rollbackChanges(db, manifest);
  return {...result, fingerprint: hash(rows(db)), affected: result.changes.length};
}

async function backup(db) {
  const directory = path.join(path.dirname(db.name), 'production-line-backups');
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const stem = path.join(directory, `assembly-lines-${Date.now()}-${randomUUID()}`);
  const filename = `${stem}.db`;
  await db.backup(filename); fs.chmodSync(filename, 0o600);
  const copy = new Database(filename, {readonly: true, fileMustExist: true});
  try { if (copy.pragma('quick_check', {simple: true}) !== 'ok') fail('备份完整性检查失败'); }
  finally { copy.close(); }
  return {backupPath: filename, manifestPath: `${stem}.json`};
}

function applyChanges(db, changes, actor, at, action) {
  const update = db.prepare('UPDATE assembly_records SET line=?,updated_at=?,updated_by=? WHERE id=?');
  const audit = db.prepare("INSERT INTO audit_log(record_type,record_id,action,field_name,old_value,new_value,changed_by,changed_at) VALUES('assembly',?,?,?,?,?,?,?)");
  for (const {before, to} of changes) {
    update.run(to, at, actor, before.id);
    audit.run(before.id, action, 'line', before.line, to, actor, at);
  }
}

export async function applyAssemblyLineRepair(db, fingerprint, actor) {
  if (!actor?.trim()) fail('实际执行必须提供操作人');
  const plan = previewAssemblyLineRepair(db);
  if (plan.fingerprint !== fingerprint) fail('数据已变化，请重新预览');
  if (plan.unknown.length) fail('存在未知产线，必须先确认映射');
  if (!plan.affected) return {affected: 0};
  const files = await backup(db), at = new Date().toISOString();
  const manifest = {kind: 'assembly-line-repair-v1', database: path.resolve(db.name), actor, at, ...files,
    fingerprint, changes: plan.changes.map(change => ({...change,
      afterHash: hash({...change.before, line: change.to, updated_at: at, updated_by: actor})}))};
  fs.writeFileSync(files.manifestPath, JSON.stringify(manifest, null, 2), {flag: 'wx', mode: 0o600});
  db.transaction(() => {
    const before = rows(db);
    if (hash(before) !== fingerprint) fail('备份期间数据已变化，请重新预览');
    applyChanges(db, plan.changes, actor, at, 'UPDATE');
    if (businessHash(before) !== businessHash(rows(db))) fail('业务数据校验失败，已回滚');
  }).immediate();
  return {affected: plan.affected, ...files};
}

export async function rollbackAssemblyLineRepair(db, manifest, fingerprint, actor) {
  if (!actor?.trim()) fail('实际执行必须提供操作人');
  const plan = previewAssemblyLineRollback(db, manifest);
  if (plan.fingerprint !== fingerprint) fail('数据已变化，请重新预览');
  if (plan.conflicts.length) fail(`记录已变更或缺失，不能自动回退：${plan.conflicts.join(',')}`);
  if (!plan.affected) return {affected: 0};
  const files = await backup(db);
  fs.writeFileSync(files.manifestPath, JSON.stringify({kind: 'assembly-line-rollback-v1', repairManifest: manifest.manifestPath, actor, changes: plan.changes}), {flag: 'wx', mode: 0o600});
  db.transaction(() => {
    if (hash(rows(db)) !== fingerprint) fail('备份期间数据已变化，请重新预览');
    const current = rollbackChanges(db, manifest);
    if (current.conflicts.length) fail('回退记录已变化');
    const before = rows(db);
    applyChanges(db, current.changes, actor, new Date().toISOString(), 'UPDATE');
    if (businessHash(before) !== businessHash(rows(db))) fail('业务数据校验失败，已回滚');
  }).immediate();
  return {affected: plan.affected, ...files};
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => args[args.indexOf(flag) + 1];
  if (!args.includes('--db') || !value('--db')) fail('必须提供 --db <production.db绝对路径>');
  const apply = args.includes('--apply'), database = path.resolve(value('--db'));
  const db = new Database(database, {readonly: !apply, fileMustExist: true});
  try {
    if (db.pragma('quick_check', {simple: true}) !== 'ok') fail('数据库完整性检查失败');
    const manifest = args.includes('--rollback') ? JSON.parse(fs.readFileSync(value('--rollback'), 'utf8')) : null;
    let result;
    if (apply) {
      if (!args.includes('--confirm') || !args.includes('--actor')) fail('执行必须提供 --confirm <本次指纹> --actor <操作人>');
      result = manifest ? await rollbackAssemblyLineRepair(db, manifest, value('--confirm'), value('--actor'))
        : await applyAssemblyLineRepair(db, value('--confirm'), value('--actor'));
    } else {
      const plan = manifest ? previewAssemblyLineRollback(db, manifest) : previewAssemblyLineRepair(db);
      const {changes, ...summary} = plan; result = {...summary, recordIds: changes.map(change => change.before.id)};
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { db.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
