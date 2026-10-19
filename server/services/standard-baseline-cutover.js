// Offline only: no standard-store singleton, DATA_DIR discovery or builder/TS imports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { integer: String(v) } : v);
const fail = message => { throw new Error(message); };
const suffixes = ['', '-wal', '-shm'];
const requiredTables = ['product_standards', 'product_standard_versions', 'product_standard_excel_comments',
  'product_standard_changes', 'product_standard_import_sources', 'standard_query_state', 'standard_publication_outbox', 'standard_review_reminders'];
const approvedSources = {
  'main.xls': 'b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0',
  'sanitary.xls': '78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f',
};
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const exists = file => {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const fileHash = file => sha(fs.readFileSync(file));
const isInside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

// Reject links in every ancestor; do not silently redirect a standards path elsewhere.
function safePath(value, type = 'file') {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('absolute path required');
  const absolute = path.resolve(value);
  for (let part = absolute; ; part = path.dirname(part)) {
    const stat = fs.lstatSync(part);
    if (stat.isSymbolicLink()) fail('symlink paths forbidden');
    if (part === absolute && !(type === 'directory' ? stat.isDirectory() : stat.isFile())) fail('unexpected path type');
    if (part === path.dirname(part)) break;
  }
  return absolute;
}
function databasePath(value) {
  const file = safePath(value);
  if (path.basename(file) !== 'standards.db') fail('only standards.db is allowed');
  if (fs.statSync(file).nlink !== 1) fail('hardlinked database forbidden');
  if (exists(file + '-journal')) fail('hot/rollback journal present; recover offline before cutover');
  return file;
}
function runtimeSet(file) {
  return suffixes.filter(suffix => exists(file + suffix)).map(suffix => {
    safePath(file + suffix);
    if (fs.statSync(file + suffix).nlink !== 1) fail('hardlinked runtime file forbidden');
    return { suffix, sha256: fileHash(file + suffix), bytes: fs.statSync(file + suffix).size };
  });
}
function maintenance(file) { return safePath(file); }

// A failed/missing/permission-limited lsof is not evidence of quiescence.
// No injected guard or environment switch exists in the production API/CLI.
function quiescent(files, service) {
  if (service !== undefined) {
    if (service !== 'teao-api' && service !== 'teao-api.service') fail('service must be teao-api');
    const result = cp.spawnSync('systemctl', ['show', 'teao-api.service', '--property=LoadState,ActiveState,SubState,MainPID'], { encoding: 'utf8', timeout: 10000 });
    const state = Object.fromEntries((result.stdout || '').trim().split('\n').map(line => line.split('=')));
    if (result.error || result.status !== 0 || result.stderr?.trim() || state.LoadState !== 'loaded'
      || state.ActiveState !== 'inactive' || state.SubState !== 'dead' || state.MainPID !== '0') fail('service must be stopped (inactive/dead, MainPID=0)');
  }
  // lsof must run as root in real operation to see all users' handles.
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) fail('quiescence requires root for complete lsof visibility');
  const names = files.flatMap(file => suffixes.map(suffix => file + suffix)).filter(file => exists(file));
  const result = cp.spawnSync('lsof', ['-nP', '-t', '--', ...names], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  if (result.error || result.stderr?.trim() || ![0, 1].includes(result.status)) fail('lsof quiescence inspection unavailable/incomplete');
  if (result.status === 0 || result.stdout?.trim()) fail('database held by process; stop every writer/reader first');
}
function syncFile(file) {
  const fd = fs.openSync(file, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function syncDirectory(directory) { syncFile(directory); }
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  syncFile(file); syncDirectory(path.dirname(file));
}
function copySet(source, destination) {
  for (const item of runtimeSet(source)) fs.copyFileSync(source + item.suffix, destination + item.suffix, fs.constants.COPYFILE_EXCL);
}
function checkpoint(db) {
  const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  if (result.busy !== 0 || (result.log !== -1 && result.log !== result.checkpointed)) fail('SQLite checkpoint busy/incomplete');
  if (db.prepare('PRAGMA journal_mode=DELETE').get().journal_mode !== 'delete') fail('SQLite journal close mode failed');
}
// Tokenize SQL instead of collapsing whitespace inside string literals.
function sqlTokens(sql) {
  return (String(sql || '').match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|[0-9]+(?:\.[0-9]+)?|[^\s]/g) || [])
    .filter(token => !token.startsWith('--') && !token.startsWith('/*'))
    .map(token => /^[A-Za-z_]/.test(token) ? token.toLowerCase() : token);
}
const normalizedSQL = sql => json(sqlTokens(sql));
function checks(sql) {
  const tokens = sqlTokens(sql), result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'check' || tokens[i + 1] !== '(') continue;
    let depth = 0; const clause = [];
    do { const token = tokens[++i]; clause.push(token); if (token === '(') depth++; if (token === ')') depth--; }
    while (depth && i + 1 < tokens.length);
    result.push(json(clause));
  }
  return result.sort();
}
function semanticSchema(db, schema) {
  return schema.filter(row => row.type === 'table' && row.name !== 'standard_baseline_metadata').map(table => {
    const name = table.name;
    const columns = db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all().map(c => ({
      name: c.name, type: normalizedSQL(c.type), notnull: c.notnull, dflt_value: normalizedSQL(c.dflt_value), pk: c.pk, hidden: c.hidden,
    })).sort((a, b) => a.name.localeCompare(b.name));
    const groups = new Map();
    for (const { id, ...fk } of db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all()) {
      if (!groups.has(id)) groups.set(id, []); groups.get(id).push(fk);
    }
    const foreignKeys = [...groups.values()].map(group => json(group.sort((a, b) => a.seq - b.seq))).sort();
    const indexes = db.prepare(`PRAGMA index_list(${quote(name)})`).all().map(index => ({
      unique: index.unique, origin: index.origin, partial: index.partial,
      columns: db.prepare(`PRAGMA index_xinfo(${quote(index.name)})`).all().map(({ seqno, cid, ...column }) => ({
        ...column, name: column.name ?? (cid === -1 ? '$rowid' : '$expression'),
      })),
      expression: index.partial || db.prepare(`PRAGMA index_info(${quote(index.name)})`).all().some(c => c.cid === -2)
        ? normalizedSQL(schema.find(row => row.type === 'index' && row.name === index.name)?.sql) : null,
    })).map(index => json(index)).sort();
    const extra = schema.filter(row => row.tbl_name === name && row.type === 'trigger').map(row => normalizedSQL(row.sql)).sort();
    // Generated columns/virtual tables need their expression definitions as well.
    return { name, columns, foreignKeys, indexes, triggers: extra, checks: checks(table.sql),
      withoutRowid: /without\s+rowid/i.test(table.sql), strict: /\)\s*(?:without\s+rowid\s*,\s*)?strict\s*$/i.test(table.sql),
      expressions: columns.some(c => c.hidden) || /^create\s+virtual/i.test(table.sql) ? normalizedSQL(table.sql) : null };
  }).concat(schema.filter(row => row.type === 'view').map(row => ({ view: row.name, sql: normalizedSQL(row.sql) })));
}
function inspectConnection(db) {
  if (db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')) fail('SQLite integrity check failed');
  if (db.prepare('PRAGMA foreign_key_check').all().length) fail('SQLite foreign key check failed');
  const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name').all();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
  if (requiredTables.some(name => !tables.includes(name))) fail('required standards schema missing');
  const counts = {}, tableHashes = {};
  for (const name of tables) {
    const query = db.prepare(`SELECT * FROM ${quote(name)}`); query.setReadBigInts(true);
    const rows = query.all().map(row => json(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).sort();
    counts[name] = rows.length; tableHashes[name] = sha(rows.join('\n'));
  }
  const revision = db.prepare('SELECT revision FROM standard_query_state WHERE id=1').get()?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0 || counts.standard_query_state !== 1) fail('invalid query revision');
  const statuses = Object.fromEntries(db.prepare('SELECT status,count(*) n FROM product_standard_versions GROUP BY status ORDER BY status').all().map(r => [r.status, r.n]));
  const pragmas = { userVersion: db.prepare('PRAGMA user_version').get().user_version, applicationId: db.prepare('PRAGMA application_id').get().application_id };
  const schemaHash = sha(JSON.stringify(schema));
  const semantic = semanticSchema(db, schema);
  const semanticSchemaHash = sha(json(semantic));
  const comparableSchemaHash = semanticSchemaHash;
  let metadata;
  if (tables.includes('standard_baseline_metadata')) {
    if (counts.standard_baseline_metadata !== 1) fail('baseline metadata row count');
    metadata = JSON.parse(db.prepare('SELECT payload FROM standard_baseline_metadata WHERE id=1').get()?.payload || 'null');
  }
  const contentHashes = { ...tableHashes }; delete contentHashes.standard_query_state;
  return { schemaHash, semanticSchemaHash, comparableSchemaHash, revision, counts, statuses, metadata, pragmas,
    logicalHash: sha(json({ schema, tableHashes, pragmas })), contentHash: sha(json({ schema: semantic, tableHashes: contentHashes, pragmas })) };
}

// Inspect a private copy, checkpoint and close it; never let SQLite alter original WAL/SHM.
// Caller must stop writers before invoking this lower-level inspection utility.
export function inspectSQLite(file) {
  file = databasePath(file);
  const before = runtimeSet(file), temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teao-cutover-inspect-')));
  const snapshot = path.join(temporary, 'standards.db');
  try {
    copySet(file, snapshot);
    for (const item of runtimeSet(snapshot)) fs.chmodSync(snapshot + item.suffix, 0o600);
    const db = new DatabaseSync(snapshot);
    let info;
    try { checkpoint(db); db.exec('BEGIN'); info = inspectConnection(db); db.exec('COMMIT'); } finally { db.close(); }
    if (runtimeSet(snapshot).some(item => item.suffix)) fail('SQLite sidecars remain after checkpoint/close');
    if (json(before) !== json(runtimeSet(file))) fail('database changed during snapshot');
    return { ...info, files: before };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
function validateManifest(staged, info) {
  const manifestFile = safePath(path.join(path.dirname(staged), 'baseline-manifest.json'));
  const raw = fs.readFileSync(manifestFile), manifest = JSON.parse(raw);
  const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (manifest.format !== 'teao-standard-baseline-build-v1' || !validHash(manifest.recordsHash)
    || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.tableNotes) || !Array.isArray(manifest.transformations)
    || manifest.records !== 809 || manifest.comments !== 1264 || !Number.isSafeInteger(manifest.sourceHistory) || manifest.sourceHistory < 0
    || manifest.revision !== info.revision || manifest.database?.sha256 !== info.files[0].sha256
    || manifest.database?.schemaHash !== info.schemaHash) fail('manifest format/counts/database/schema mismatch');
  if (fs.readFileSync(staged)[18] !== 1 || fs.readFileSync(staged)[19] !== 1) fail('staged journal must be DELETE');
  if (info.files.length !== 1) fail('staged must be closed journal DELETE without WAL/SHM');
  for (const name of ['product_standards', 'product_standard_versions', 'product_standard_import_sources'])
    if (info.counts[name] !== 809) fail('manifest records mismatch');
  if (info.counts.product_standard_excel_comments !== 1264 || info.counts.product_standard_changes !== 809 + manifest.sourceHistory
    || info.statuses.published !== 808 || info.statuses.obsolete !== 1 || Object.keys(info.statuses).length !== 2) fail('manifest counts/statuses mismatch');
  if (info.counts.standard_publication_outbox || info.counts.standard_review_reminders) fail('outbox/reminder queue must be empty');
  const expectedMetadata = { format: 'teao-standard-baseline-v1', recordsHash: manifest.recordsHash, createdAt: manifest.createdAt,
    tableNotes: manifest.tableNotes, transformations: manifest.transformations };
  if (!info.metadata || Object.entries(expectedMetadata).some(([key, value]) => json(value) !== json(info.metadata[key]))) fail('manifest metadata mismatch');
  if (!Array.isArray(manifest.sources) || manifest.sources.length !== 2
    || new Set(manifest.sources.map(source => source.file)).size !== 2) fail('manifest sources missing/duplicate');
  const sources = manifest.sources.map(source => {
    if (!Object.hasOwn(approvedSources, source.file) || source.sha256 !== approvedSources[source.file]
      || !Number.isSafeInteger(source.bytes) || source.bytes <= 0 || typeof source.sheet !== 'string' || !source.sheet
      || typeof source.range !== 'string' || !source.range) fail('manifest official source hashes invalid');
    const file = safePath(path.join(path.dirname(staged), 'sources', source.file));
    const sha256 = fileHash(file);
    if (sha256 !== source.sha256 || fs.statSync(file).size !== source.bytes) fail('manifest source file hash/bytes mismatch');
    return { ...source, path: file, sha256 };
  });
  const payloadPath = safePath(path.join(path.dirname(staged), 'source-records.json'));
  const payloadBytes = fs.statSync(payloadPath).size;
  if (payloadBytes > 10 * 1024 * 1024) fail('source-records payload exceeds 10MB');
  const payloadHash = fileHash(payloadPath);
  if (payloadHash !== manifest.recordsHash) fail('source-records payload recordsHash mismatch');
  const sourceRecords = { path: payloadPath, bytes: payloadBytes, sha256: payloadHash };
  return { path: manifestFile, sha256: sha(raw), manifest, sources, sourceRecords };
}
function configuration(options) {
  const target = databasePath(options.target), staged = databasePath(options.staged);
  if (target === staged || fs.statSync(target).ino === fs.statSync(staged).ino && fs.statSync(target).dev === fs.statSync(staged).dev) fail('target/staged must be distinct');
  const archiveRoot = safePath(options.archiveRoot, 'directory');
  const dirs = [path.dirname(target), path.dirname(staged)];
  if (dirs.some(dir => isInside(dir, archiveRoot) || isInside(archiveRoot, dir))) fail('archive overlap with database directories');
  if (fs.statSync(archiveRoot).dev !== fs.statSync(target).dev) fail('archiveRoot must be on target filesystem for recoverable rename');
  const maintenanceFile = maintenance(options.maintenanceFile);
  if ([target, staged].some(file => suffixes.some(s => file + s === maintenanceFile))
    || isInside(archiveRoot, maintenanceFile) || isInside(path.dirname(staged), maintenanceFile)) fail('maintenance path overlaps database/artifact');
  return { target, staged, archiveRoot, maintenanceFile, ...(options.service ? { service: options.service } : {}) };
}
export function previewBaselineCutover(options) {
  const config = configuration(options);
  quiescent([config.target, config.staged], config.service);
  const target = inspectSQLite(config.target), staged = inspectSQLite(config.staged);
  const manifest = validateManifest(config.staged, staged);
  if (target.comparableSchemaHash !== staged.comparableSchemaHash) fail('target/staged schema mismatch');
  const newRevision = Math.max(target.revision, staged.revision) + 1;
  if (!Number.isSafeInteger(newRevision)) fail('query revision overflow');
  const plan = { format: 'teao-standard-baseline-cutover-v1', ...config, targetState: target, stagedState: staged, manifest, newRevision };
  return { ...plan, fingerprint: sha(json(plan)) };
}
function lockTarget(target, callback) {
  const lock = path.join(path.dirname(target), '.standards-baseline-cutover.lock');
  fs.mkdirSync(lock, { mode: 0o700 });
  try { return callback(); } finally { fs.rmdirSync(lock); }
}
function moveSet(source, directory, items = runtimeSet(source)) {
  const moved = [];
  try {
    for (const item of items) {
      const destination = path.join(directory, 'standards.db' + item.suffix);
      if (exists(destination)) fail('refuse overwrite archived runtime file');
      fs.renameSync(source + item.suffix, destination); moved.push(item);
    }
    for (const item of moved) syncFile(path.join(directory, 'standards.db' + item.suffix));
    syncDirectory(path.dirname(source)); syncDirectory(directory);
  } catch (error) {
    for (const item of moved.reverse()) fs.renameSync(path.join(directory, 'standards.db' + item.suffix), source + item.suffix);
    throw error;
  }
}
function restoreSet(directory, target, items) {
  for (const item of items) {
    if (exists(target + item.suffix)) fail('restore destination occupied; keep maintenance and inspect archive');
    fs.renameSync(path.join(directory, 'standards.db' + item.suffix), target + item.suffix);
  }
  syncDirectory(directory); syncDirectory(path.dirname(target));
}
function same(actual, expected, message) { if (json(actual) !== json(expected)) fail(message); }

export function applyBaselineCutover(options) {
  if (typeof options.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(options.fingerprint)) fail('exact preview fingerprint required');
  const target = databasePath(options.target);
  return lockTarget(target, () => {
    const plan = previewBaselineCutover(options);
    if (plan.fingerprint !== options.fingerprint) fail('fingerprint changed; preview and confirm again');
    const archive = path.join(plan.archiveRoot, 'cutover-' + randomUUID());
    fs.mkdirSync(archive, { mode: 0o700 });
    for (const dir of ['original', 'failed', 'rejected']) fs.mkdirSync(path.join(archive, dir), { mode: 0o700 });
    writeJson(path.join(archive, 'plan.json'), plan);
    const prepared = path.join(path.dirname(target), '.standards.db.prepared-' + randomUUID());
    let moved = false, installed = false;
    try {
      fs.copyFileSync(plan.staged, prepared, fs.constants.COPYFILE_EXCL);
      const owner = fs.statSync(target); fs.chmodSync(prepared, owner.mode & 0o777); fs.chownSync(prepared, owner.uid, owner.gid);
      const db = new DatabaseSync(prepared);
      try {
        checkpoint(db);
        db.prepare('UPDATE standard_query_state SET revision=? WHERE id=1').run(plan.newRevision);
        checkpoint(db);
        const check = inspectConnection(db);
        if (check.contentHash !== plan.stagedState.contentHash || check.revision !== plan.newRevision) fail('prepared content/revision verification failed');
      } finally { db.close(); }
      if (suffixes.slice(1).some(s => exists(prepared + s))) fail('prepared sidecars after close');
      syncFile(prepared);
      // Reinspect after preparation, immediately before moving any old files.
      const current = previewBaselineCutover(options);
      if (current.fingerprint !== plan.fingerprint) fail('fingerprint changed during preparation');
      maintenance(plan.maintenanceFile); quiescent([target, plan.staged], plan.service);
      moveSet(target, path.join(archive, 'original'), plan.targetState.files); moved = true;
      if (exists(target)) fail('target reappeared during offline replacement');
      fs.renameSync(prepared, target); installed = true; syncDirectory(path.dirname(target));
      const installedState = inspectSQLite(target);
      if (installedState.contentHash !== plan.stagedState.contentHash || installedState.revision !== plan.newRevision) fail('installed verification failed');
      const receipt = { format: 'teao-standard-baseline-cutover-receipt-v1', target, archive, maintenanceFile: plan.maintenanceFile,
        ...(plan.service ? { service: plan.service } : {}), previewFingerprint: plan.fingerprint, originalFiles: plan.targetState.files, installedState };
      const rollbackFingerprint = sha(json(receipt));
      writeJson(path.join(archive, 'receipt.json'), { ...receipt, rollbackFingerprint });
      return { target, archive, revision: plan.newRevision, fingerprint: plan.fingerprint, rollbackFingerprint, maintenance: true };
    } catch (error) {
      try {
        if (installed) moveSet(target, path.join(archive, 'failed'));
        if (moved) restoreSet(path.join(archive, 'original'), target, plan.targetState.files);
        if (exists(prepared)) moveSet(prepared, path.join(archive, 'failed'));
        writeJson(path.join(archive, 'failure.json'), { error: error.message, restored: moved, maintenance: true });
      } catch (recoveryError) { throw new AggregateError([error, recoveryError], `cutover recovery incomplete: ${archive}; keep maintenance`); }
      throw error;
    }
  });
}

export function rollbackBaselineCutover(options) {
  const target = databasePath(options.target), archive = safePath(options.archive, 'directory');
  return lockTarget(target, () => {
    const receiptPath = safePath(path.join(archive, 'receipt.json'));
    const { rollbackFingerprint, ...receipt } = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.format !== 'teao-standard-baseline-cutover-receipt-v1' || sha(json(receipt)) !== rollbackFingerprint
      || options.fingerprint !== rollbackFingerprint) fail('rollback fingerprint mismatch');
    if (receipt.target !== target || receipt.archive !== archive || options.maintenanceFile !== receipt.maintenanceFile
      || (options.service || undefined) !== receipt.service) fail('rollback configuration mismatch');
    maintenance(receipt.maintenanceFile);
    const original = databasePath(path.join(archive, 'original/standards.db'));
    quiescent([target, original], receipt.service);
    same(runtimeSet(original), receipt.originalFiles, 'original archive changed');
    const current = inspectSQLite(target);
    if (current.contentHash !== receipt.installedState.contentHash || current.semanticSchemaHash !== receipt.installedState.semanticSchemaHash
      || json(current.pragmas) !== json(receipt.installedState.pragmas)) fail('installed business content/schema/pragmas changed; rollback would lose new writes');
    if (current.revision < receipt.installedState.revision) fail('installed revision rewound; rollback refused');
    const revision = Math.max(current.revision, receipt.installedState.revision) + 1;
    if (!Number.isSafeInteger(revision)) fail('rollback revision overflow');
    if (fs.readdirSync(path.join(archive, 'rejected')).length) fail('rollback already attempted');
    const originalState = inspectSQLite(original);
    const prepared = path.join(path.dirname(target), '.standards.db.rollback-prepared-' + randomUUID());
    let moved = false, installed = false;
    try {
      copySet(original, prepared);
      const owner = fs.statSync(original); fs.chmodSync(prepared, owner.mode & 0o777); fs.chownSync(prepared, owner.uid, owner.gid);
      const db = new DatabaseSync(prepared);
      try {
        checkpoint(db); db.prepare('UPDATE standard_query_state SET revision=? WHERE id=1').run(revision); checkpoint(db);
        const check = inspectConnection(db);
        if (check.contentHash !== originalState.contentHash || check.revision !== revision) fail('rollback prepared content/revision mismatch');
      } finally { db.close(); }
      if (suffixes.slice(1).some(suffix => exists(prepared + suffix))) fail('rollback prepared sidecars after close');
      syncFile(prepared);
      maintenance(receipt.maintenanceFile); quiescent([target, original], receipt.service);
      same(runtimeSet(original), receipt.originalFiles, 'original archive changed');
      same(inspectSQLite(target), current, 'installed database changed during rollback preparation');
      moveSet(target, path.join(archive, 'rejected')); moved = true;
      if (exists(target)) fail('target reappeared during offline replacement');
      fs.renameSync(prepared, target); installed = true; syncDirectory(path.dirname(target));
      const restored = inspectSQLite(target);
      if (restored.contentHash !== originalState.contentHash || restored.revision !== revision) fail('rollback installed verification failed');
      writeJson(path.join(archive, 'rollback.json'), { rollbackFingerprint, revision, maintenance: true });
    } catch (error) {
      try {
        const failed = path.join(archive, 'rollback-failed-' + randomUUID()); fs.mkdirSync(failed, { mode: 0o700 });
        if (installed) moveSet(target, failed);
        if (moved) restoreSet(path.join(archive, 'rejected'), target, current.files);
        if (exists(prepared)) moveSet(prepared, failed);
      } catch (recoveryError) { throw new AggregateError([error, recoveryError], `rollback recovery incomplete: ${archive}; keep maintenance`); }
      throw error;
    }
    return { target, archive, revision, maintenance: true, rolledBack: true };
  });
}
