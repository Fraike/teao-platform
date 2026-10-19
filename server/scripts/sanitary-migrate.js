import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { digest, privateJson } from './release-common.js';

export const SOURCE = '78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f';
export const OLD_SOURCE = 'f6267272947847810a542d7124f908bc03629ec243c6a65bf44719d34db89723';
export const OLD_SHEET = '客户阻力值标准一览表（智能卫浴）';
const confirmed = ['SP0009-G','SP0010-G','SP0024-G','SP0025-G','SP0011-G','SP0012-G'];
const fail = message => { throw new Error(message); };
export function normalizePayload(input, whitelist) {
  const payload = Array.isArray(input) ? { format: 'teao-sanitary-migration-v1', sourceHash: SOURCE, sourceSheet: input[0]?.sourceSheet, records: input } : input;
  if (!payload || payload.format !== 'teao-sanitary-migration-v1') fail('迁移JSON format不支持');
  if (whitelist && (whitelist.sourceHash !== OLD_SOURCE || whitelist.sourceSheet !== OLD_SHEET)) fail('旧白名单来源不匹配');
  return { ...payload, legacyWhitelist: whitelist?.records };
}
export function validatePayload(payload, xlsHash) {
  if (xlsHash !== SOURCE || payload.format !== 'teao-sanitary-migration-v1' || payload.sourceHash !== SOURCE) fail('原 XLS 或 JSON 来源 hash 不匹配');
  if (typeof payload.sourceSheet !== 'string' || !payload.sourceSheet.includes('智能卫浴') || payload.sourceSheet.length > 200) fail('需要原始智能卫浴sheet名');
  const records = payload.records;
  if (!Array.isArray(records) || records.length !== 45 || new Set(records.map(r => r.serialNo)).size !== 45) fail('必须为45个唯一产品');
  if (records.some(r => !/^SP\d+-G$/.test(r.serialNo) || r.categoryKey !== 'sanitary_damper' || r.standardType !== 'formal'
    || r.sourceHash !== SOURCE || r.sourceSheet !== payload.sourceSheet || !Number.isInteger(r.sourceRow) || r.sourceRow < 1
    || !r.customer || !r.model || !['盖', '座'].includes(r.fields?.part_type) || !Array.isArray(r.comments)
    || r.comments.some(c => !c || ['fieldKey','fieldLabel','author','text','cell','changedAt'].some(k => typeof c[k] !== 'string') || !c.text || !/^[A-Z]+\d+$/.test(c.cell)))) fail('产品字段、来源或批注格式不符合契约');
  if (records.some(r => new Set(r.comments.map(c => JSON.stringify([c.cell,c.author,c.text]))).size !== r.comments.length)) fail('产品批注重复，不能保证50条独立归档');
  if (records.filter(r => r.fields.part_type === '盖').length !== 25 || records.filter(r => r.fields.part_type === '座').length !== 20) fail('必须为25盖20座');
  if (records.reduce((n, r) => n + r.comments.length, 0) !== 50) fail('必须保留50条产品批注归档');
  for (const serial of confirmed) {
    const r = records.find(item => item.serialNo === serial);
    if (!r || r.model !== 'RD-V088' || !String(r.fields.import_note).includes('原表产品型号为空') || !r.fields.import_note.includes('2026-10-17')) fail('六个确认型号缺少来源依据');
  }
  if (payload.legacyWhitelist !== undefined && (!Array.isArray(payload.legacyWhitelist) || payload.legacyWhitelist.length !== 70
    || new Set(payload.legacyWhitelist.map(r => r.serialNo)).size !== 70
    || payload.legacyWhitelist.some(r => !/^WY-/.test(r.serialNo) || !r.customer || !r.model || !Number.isInteger(r.sourceRow) || !/^[a-f0-9]{64}$/.test(r.fieldsSha256)))) fail('需要完整70条旧配对白名单及字段hash');
  return records;
}
export function databaseState(db) {
  const tables = ['product_standards', 'product_standard_versions', 'product_standard_import_sources', 'product_standard_excel_comments', 'product_standard_changes'];
  return tables.map(table => ({ table, rows: db.prepare(`SELECT * FROM ${table}`).all().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }));
}
export function migrationPlan(db, payload) {
  const all = db.prepare(`SELECT v.*, s.source_hash, s.source_sheet, s.source_row FROM product_standard_versions v
    LEFT JOIN product_standard_import_sources s ON s.version_id=v.id WHERE v.category_key='sanitary_damper' ORDER BY v.id`).all();
  const paired = all.filter(row => !JSON.parse(row.fields).part_type && Object.keys(JSON.parse(row.fields)).some(k => /^(lid|seat)_/.test(k)));
  if (paired.length !== 0 && paired.length !== 70) fail('旧配对不是完整70条，拒绝部分停用');
  if (paired.length && !payload.legacyWhitelist) fail('目标库存在旧70配对，必须提供 --legacy-whitelist 完整白名单');
  const ids = [];
  for (const row of paired) {
    const allowed = payload.legacyWhitelist.find(r => r.serialNo === row.serial_no);
    if (!allowed || row.source_hash !== OLD_SOURCE || row.source_sheet !== OLD_SHEET || row.version_no !== 1
      || row.customer !== allowed.customer || row.model !== allowed.model || row.source_row !== allowed.sourceRow
      || digest(row.fields) !== allowed.fieldsSha256
      || db.prepare('SELECT count(*) n FROM product_standard_versions WHERE standard_id=?').get(row.standard_id).n !== 1) fail('旧配对来源、白名单或版本已变化');
    if (row.status === 'published' && row.revision === 1) ids.push(row.standard_id);
    else if (row.status !== 'obsolete' || row.revision !== 2
      || !db.prepare("SELECT 1 FROM product_standard_changes WHERE standard_id=? AND description LIKE '%2026-10-17用户确认%'").get(row.standard_id)) fail('旧配对已修订或停用依据不匹配');
  }
  if (new Set(paired.map(r => r.serial_no)).size !== paired.length || ids.length !== 0 && ids.length !== 70) fail('旧配对白名单重复或停用状态不完整');
  let skipped = 0;
  for (const record of payload.records) {
    const existing = all.filter(r => r.serial_no === record.serialNo);
    if (!existing.length) continue;
    if (existing.length !== 1) fail('新SP编码已有后续修订，需人工复核');
    const row = existing[0];
    if (row.source_hash !== SOURCE || row.source_sheet !== record.sourceSheet || row.source_row !== record.sourceRow
      || row.customer !== record.customer || row.model !== record.model || row.category_key !== record.categoryKey
      || row.version_no !== 1 || row.revision !== 1 || row.status !== 'published'
      || JSON.stringify(JSON.parse(row.fields)) !== JSON.stringify(record.fields)) fail('已存在SP与本次payload不一致');
    const comments = db.prepare('SELECT source_cell,field_key,field_label,author,text,changed_at,source_hash FROM product_standard_excel_comments WHERE version_id=?').all(row.id);
    const expected = record.comments.map(c => ({source_cell:c.cell,field_key:c.fieldKey,field_label:c.fieldLabel,author:c.author,text:c.text,changed_at:c.changedAt,source_hash:SOURCE}));
    const canonical = rows => rows.map(r => JSON.stringify(r)).sort().join('\n');
    if (canonical(comments) !== canonical(expected)) fail('已存在SP的批注归档不一致');
    skipped++;
  }
  if (skipped !== 0 && skipped !== 45) fail('45条产品不是完整导入状态，需人工复核');
  if (skipped === 0 && paired.length && ids.length === 0) fail('旧70已停用但45条新产品缺失');
  return { insert: 45 - skipped, skipped, retire: ids.length, retirePairedSanitaryIds: ids };
}
export function previewMigration(dataDir, payload, payloadHash) {
  const db = new DatabaseSync(path.join(dataDir, 'standards.db'), { readOnly: true });
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') fail('标准库校验失败');
    const plan = migrationPlan(db, payload);
    const fingerprint = digest(JSON.stringify({ payloadHash, dataDir: fs.realpathSync(dataDir), plan, state: databaseState(db) }));
    return { ...plan, fingerprint };
  } finally { db.close(); }
}
function requireOffline(stateRoot) {
  if (!fs.existsSync(path.join(stateRoot, 'maintenance'))) fail('需由运维先开启已生效的nginx维护窗口');
  const result = spawnSync('systemctl', ['is-active', 'teao-api'], { encoding: 'utf8' });
  if (result.status !== 3 || result.stdout.trim() !== 'inactive') fail('必须先停止 teao-api，避免并发写及定时任务');
}
export async function migrate(options, dependencies = {}) {
  const raw = fs.readFileSync(options.payload);
  if (raw.length > 10 * 1024 * 1024 || fs.statSync(options.xls).size > 10 * 1024 * 1024) fail('输入超过10MB');
  const whitelistRaw = options.legacyWhitelist ? fs.readFileSync(options.legacyWhitelist) : null;
  if (whitelistRaw?.length > 1024 * 1024) fail('白名单文件超过1MB');
  const payload = normalizePayload(JSON.parse(raw), whitelistRaw ? JSON.parse(whitelistRaw) : undefined);
  validatePayload(payload, digest(fs.readFileSync(options.xls)));
  return executeMigration(payload, digest(Buffer.concat([raw, whitelistRaw || Buffer.alloc(0)])), options, dependencies);
}
// Separate from file transport so isolated tests can exercise transaction behavior
// without pretending that a synthetic fixture has the production XLS hash.
export async function executeMigration(payload, payloadHash, options, dependencies = {}) {
  validatePayload(payload, SOURCE);
  const plan = previewMigration(options.dataDir, payload, payloadHash);
  if (!options.apply) return { mode: 'preview', payloadHash, ...plan };
  if (options.confirm !== plan.fingerprint) fail('需 --confirm 匹配预览 fingerprint');
  (dependencies.requireOffline || requireOffline)(options.stateRoot);
  const lock = path.join(options.stateRoot, 'lock'); fs.mkdirSync(lock, { mode: 0o700 });
  let store;
  try {
    const fresh = previewMigration(options.dataDir, payload, payloadHash);
    if (fresh.fingerprint !== plan.fingerprint) fail('预览后数据库发生变化');
    if (!plan.insert && !plan.retire) return { mode: 'unchanged', ...plan };
    process.env.DATA_DIR = options.dataDir;
    store = await import('../services/standard-store.js');
    // Do not run initDB: production schema must already be deployed and reviewed.
    const actor = { id: 'sanitary-migration-20261019', name: '2026-10-19受控卫浴迁移', role: 'admin' };
    const p = store.previewStandardImport(payload.records, actor);
    if (p.errors.length || p.skipped !== plan.skipped) fail('服务层导入预览与审阅摘要不符');
    const reportFile = path.join(options.stateRoot, `sanitary-${Date.now()}-${process.pid}.json`);
    privateJson(reportFile, { status: 'prepared', payloadHash, fingerprint: plan.fingerprint, sourceHash: SOURCE, plan });
    const result = await store.confirmStandardImport(payload.records, actor, p.token, () => {
      (dependencies.requireOffline || requireOffline)(options.stateRoot);
      if (previewMigration(options.dataDir, payload, payloadHash).fingerprint !== plan.fingerprint) fail('事务前数据指纹变化');
    }, { retirePairedSanitaryIds: plan.retirePairedSanitaryIds });
    try {
      privateJson(reportFile + '.completed', { status: 'committed', payloadHash, fingerprint: plan.fingerprint, result, sourceHash: SOURCE });
    } catch { fail('迁移事务已提交，但结果报告写入失败；请只读预览核对，不要手工重复导入'); }
    return { mode: 'applied', ...result, reportFile: reportFile + '.completed' };
  } finally {
    store?.closeDB();
    fs.renameSync(lock, path.join(options.stateRoot, `sanitary-lock-${Date.now()}-${process.pid}`));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = { stateRoot: '/var/lib/teao-platform/releases' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true;
    else if (['--payload','--xls','--data-dir','--state-root','--legacy-whitelist','--confirm'].includes(args[i])) options[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
    else fail('未知参数');
  }
  try {
    if (!options.payload || !options.xls || !options.dataDir || !path.isAbsolute(options.dataDir)) fail('usage: sanitary-migrate.js --payload JSON --xls ORIGINAL_XLS --data-dir ABSOLUTE_DIR [--apply --confirm FINGERPRINT]');
    console.log(JSON.stringify(await migrate(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
