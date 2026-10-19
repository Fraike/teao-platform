import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { createHash as realCreateHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const syntheticSources = [
  { file: 'main.xls', bytes: Buffer.from('teao-cutover-synthetic-main-v1\n'), hash: 'b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0' },
  { file: 'sanitary.xls', bytes: Buffer.from('teao-cutover-synthetic-sanitary-v1\n'), hash: '78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f' },
];
// Only these two exact synthetic byte strings stand in for private approved XLS.
// Every DB, schema, payload, fingerprint and tampered source uses genuine SHA256.
function createHash(algorithm, options) {
  const hash = realCreateHash(algorithm, options);
  if (algorithm !== 'sha256') return hash;
  const chunks = [], update = hash.update.bind(hash), digest = hash.digest.bind(hash);
  hash.update = (data, encoding) => { chunks.push(Buffer.from(data, encoding)); update(data, encoding); return hash; };
  hash.digest = encoding => {
    const bytes = Buffer.concat(chunks), source = syntheticSources.find(item => item.bytes.equals(bytes));
    if (!source) return digest(encoding);
    digest(); const replacement = Buffer.from(source.hash, 'hex');
    return encoding ? replacement.toString(encoding) : replacement;
  };
  return hash;
}
test.mock.module('node:crypto', { namedExports: { createHash, randomUUID } });
const service = await import('../server/services/standard-baseline-cutover.js');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-cutover-test-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['live', 'staged', 'archives']) fs.mkdirSync(path.join(root, dir));
  const target = path.join(root, 'live/standards.db'), staged = path.join(root, 'staged/standards.db');
  const recordsPayload = JSON.stringify([{ fixture: 'synthetic parsed records' }]);
  const recordsHash = realCreateHash('sha256').update(recordsPayload).digest('hex');
  fs.writeFileSync(path.join(root, 'staged/source-records.json'), recordsPayload);
  for (const [file, revision, name] of [[target, 100, 'old'], [staged, 1, 'new']]) {
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE standard_categories(key TEXT PRIMARY KEY,name TEXT);
      INSERT INTO standard_categories VALUES('one','One');
      CREATE TABLE product_standards(id TEXT PRIMARY KEY);
      CREATE TABLE product_standard_versions(id TEXT PRIMARY KEY, standard_id TEXT REFERENCES product_standards(id),status TEXT);
      CREATE TABLE product_standard_excel_comments(id INTEGER PRIMARY KEY);
      CREATE TABLE product_standard_import_sources(id INTEGER PRIMARY KEY);
      CREATE TABLE product_standard_changes(id INTEGER PRIMARY KEY);
      CREATE TABLE standard_query_state(id INTEGER PRIMARY KEY,revision INTEGER);
      CREATE TABLE standard_publication_outbox(id TEXT PRIMARY KEY,payload TEXT);
      CREATE TABLE standard_review_reminders(id TEXT PRIMARY KEY,payload TEXT);
      INSERT INTO standard_query_state VALUES(1,${revision});`);
    db.exec('BEGIN');
    for (let i = 0; i < 809; i++) {
      db.prepare('INSERT INTO product_standards VALUES(?)').run(name + i);
      db.prepare('INSERT INTO product_standard_versions VALUES(?,?,?)').run(name + i, name + i, i === 808 ? 'obsolete' : 'published');
      db.prepare('INSERT INTO product_standard_import_sources VALUES(?)').run(i);
      db.prepare('INSERT INTO product_standard_changes VALUES(?)').run(i);
    }
    for (let i = 0; i < 1264; i++) db.prepare('INSERT INTO product_standard_excel_comments VALUES(?)').run(i);
    if (file === staged) {
      db.exec('CREATE TABLE standard_baseline_metadata(id INTEGER PRIMARY KEY,payload TEXT)');
      db.prepare('INSERT INTO standard_baseline_metadata VALUES(1,?)').run(JSON.stringify({
        format: 'teao-standard-baseline-v1', recordsHash, createdAt: '2026-10-19T00:00:00.000Z', tableNotes: [], transformations: [],
      }));
    }
    db.exec('COMMIT');
    db.close();
  }
  const sourceDir = path.join(root, 'staged/sources'); fs.mkdirSync(sourceDir);
  const sources = syntheticSources.map(({ file, bytes }) => {
    fs.writeFileSync(path.join(sourceDir, file), bytes);
    return { file, sha256: digest(path.join(sourceDir, file)), bytes: fs.statSync(path.join(sourceDir, file)).size, sheet: 'fixture', range: 'A1:K810' };
  });
  const db = new DatabaseSync(staged);
  const schemaHash = createHash('sha256').update(JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name').all())).digest('hex');
  db.close();
  fs.writeFileSync(path.join(root, 'staged/baseline-manifest.json'), JSON.stringify({
    format: 'teao-standard-baseline-build-v1', createdAt: '2026-10-19T00:00:00.000Z', recordsHash, records: 809, comments: 1264, sourceHistory: 0, revision: 1,
    database: { sha256: digest(staged), schemaHash }, tableNotes: [], transformations: [], sources,
  }));
  const maintenanceFile = path.join(root, 'maintenance'); fs.writeFileSync(maintenanceFile, 'maintenance');
  const other = path.join(root, 'live/users.db'); fs.writeFileSync(other, 'do not touch');
  t.mock.method(process, 'getuid', () => 0);
  t.mock.method(cp, 'spawnSync', (command) => command === 'lsof'
    ? { status: 1, stdout: '', stderr: '' }
    : { status: 0, stdout: 'LoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\n', stderr: '' });
  return { target, staged, archiveRoot: path.join(root, 'archives'), maintenanceFile, other };
}
function edit(file, sql) { const db = new DatabaseSync(file); try { db.exec(sql); } finally { db.close(); } }
function apply(f) { const p = service.previewBaselineCutover(f); return service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }); }

test('API exports offline preview, apply and rollback', () => {
  for (const name of ['inspectSQLite', 'previewBaselineCutover', 'applyBaselineCutover', 'rollbackBaselineCutover']) assert.equal(typeof service[name], 'function', name);
});
test('maintenance and exact confirmation required; rejection leaves target intact', t => {
  const f = fixture(t), before = digest(f.target);
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: 'bad' }), /fingerprint/);
  fs.renameSync(f.maintenanceFile, f.maintenanceFile + '.off');
  assert.throws(() => service.previewBaselineCutover(f), /maintenance/);
  assert.equal(digest(f.target), before);
});
test('all-table snapshot catches outbox and reminder edits even without revision changes', t => {
  const f = fixture(t);
  for (const table of ['standard_publication_outbox', 'standard_review_reminders']) {
    const p = service.previewBaselineCutover(f);
    edit(f.target, `INSERT INTO ${table} VALUES('${table}','late write')`);
    assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /fingerprint/);
  }
});
test('staged drift, nonempty jobs and schema mismatch are rejected', t => {
  const f = fixture(t), p = service.previewBaselineCutover(f);
  edit(f.staged, "UPDATE product_standard_versions SET id='changed' WHERE id='new0'");
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /fingerprint|foreign|manifest/);
  edit(f.staged, "UPDATE product_standard_versions SET id='new0' WHERE id='changed'; INSERT INTO standard_publication_outbox VALUES('job','x')");
  assert.throws(() => service.previewBaselineCutover(f), /outbox|queue|manifest/);
  edit(f.staged, 'DELETE FROM standard_publication_outbox; CREATE TABLE unexpected(id TEXT)');
  assert.throws(() => service.previewBaselineCutover(f), /schema|manifest/);
});
test('production guard refuses held files, unavailable inspection and running systemd service', t => {
  const f = fixture(t);
  cp.spawnSync.mock.mockImplementation(() => ({ status: 0, stdout: '123\n', stderr: '' }));
  assert.throws(() => service.previewBaselineCutover(f), /held|process/);
  cp.spawnSync.mock.mockImplementation(() => ({ error: new Error('ENOENT'), status: null }));
  assert.throws(() => service.previewBaselineCutover(f), /lsof|quiescence/);
  cp.spawnSync.mock.mockImplementation(command => command === 'lsof' ? { status: 1, stdout: '', stderr: '' }
    : { status: 0, stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=123\n', stderr: '' });
  assert.throws(() => service.previewBaselineCutover({ ...f, service: 'teao-api' }), /service|stopped/);
});
test('cutover archives old running set, raises revision, preserves maintenance and other databases; rollback restores content with higher revision', t => {
  const f = fixture(t), old = digest(f.target), staged = digest(f.staged), oldContent = service.inspectSQLite(f.target).contentHash;
  const r = apply(f);
  assert.equal(digest(path.join(r.archive, 'original/standards.db')), old);
  assert.equal(service.inspectSQLite(f.target).revision, 101);
  assert.equal(digest(f.staged), staged);
  assert.equal(fs.existsSync(f.maintenanceFile), true);
  assert.equal(fs.readFileSync(f.other, 'utf8'), 'do not touch');
  service.rollbackBaselineCutover({ target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint });
  assert.equal(service.inspectSQLite(f.target).contentHash, oldContent);
  assert.equal(service.inspectSQLite(f.target).revision, 102);
  assert.equal(digest(path.join(r.archive, 'original/standards.db')), old);
  assert.equal(fs.existsSync(path.join(r.archive, 'rejected/standards.db')), true);
});
test('rollback refuses new writes, missing maintenance, altered archive and wrong fingerprint', t => {
  const f = fixture(t), r = apply(f);
  const args = { target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint };
  assert.throws(() => service.rollbackBaselineCutover({ ...args, fingerprint: 'bad' }), /fingerprint/);
  fs.renameSync(f.maintenanceFile, f.maintenanceFile + '.off');
  assert.throws(() => service.rollbackBaselineCutover(args), /maintenance/);
  fs.renameSync(f.maintenanceFile + '.off', f.maintenanceFile);
  edit(f.target, "INSERT INTO standard_review_reminders VALUES('late','write')");
  assert.throws(() => service.rollbackBaselineCutover(args), /changed|writes/);
});
test('manifest file and database hash are bound and revalidated', t => {
  const f = fixture(t), manifest = path.join(path.dirname(f.staged), 'baseline-manifest.json');
  const info = JSON.parse(fs.readFileSync(manifest));
  const p = service.previewBaselineCutover(f);
  fs.appendFileSync(manifest, '\n');
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /fingerprint/);
  info.database.sha256 = '0'.repeat(64);
  fs.writeFileSync(manifest, JSON.stringify(info));
  assert.throws(() => service.previewBaselineCutover(f), /manifest/);
});
test('symlinks, same database, other database name and archive overlap rejected', t => {
  const f = fixture(t);
  assert.throws(() => service.previewBaselineCutover({ ...f, staged: f.target }), /distinct|same/);
  assert.throws(() => service.previewBaselineCutover({ ...f, target: f.other }), /standards.db/);
  assert.throws(() => service.previewBaselineCutover({ ...f, archiveRoot: path.dirname(f.target) }), /overlap/);
  const linked = path.join(path.dirname(f.target), 'linked'); fs.symlinkSync(f.staged, linked);
  assert.throws(() => service.previewBaselineCutover({ ...f, staged: linked }), /symlink|standards.db/);
});
test('failure after archiving restores target and preserves failed candidate', t => {
  const f = fixture(t), p = service.previewBaselineCutover(f), old = digest(f.target);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (String(from).includes('.prepared-') && to === f.target) throw new Error('injected rename failure');
    return rename(from, to);
  });
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /injected rename/);
  assert.equal(digest(f.target), old);
  assert.equal(fs.existsSync(f.maintenanceFile), true);
});

function refreshManifest(f, change = {}) {
  const file = path.join(path.dirname(f.staged), 'baseline-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file));
  const db = new DatabaseSync(f.staged);
  try { manifest.database.schemaHash = createHash('sha256').update(JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name').all())).digest('hex'); }
  finally { db.close(); }
  manifest.database.sha256 = digest(f.staged);
  fs.writeFileSync(file, JSON.stringify({ ...manifest, ...change }));
}
for (const [name, mutate, error] of [
  ['missing manifest', f => fs.renameSync(path.join(path.dirname(f.staged), 'baseline-manifest.json'), path.join(path.dirname(f.staged), 'manifest.off')), /manifest/],
  ['wrong format', f => refreshManifest(f, { format: 'other' }), /manifest/],
  ['wrong record count', f => refreshManifest(f, { records: 808 }), /manifest/],
  ['wrong comment count', f => refreshManifest(f, { comments: 1263 }), /manifest/],
  ['metadata disagreement', f => { edit(f.staged, "UPDATE standard_baseline_metadata SET payload='{}'"); refreshManifest(f); }, /metadata/],
  ['nonempty outbox', f => { edit(f.staged, "INSERT INTO standard_publication_outbox VALUES('job','send')"); refreshManifest(f); }, /outbox/],
  ['nonempty reminders', f => { edit(f.staged, "INSERT INTO standard_review_reminders VALUES('job','send')"); refreshManifest(f); }, /reminder/],
  ['pending approval', f => { edit(f.staged, "UPDATE product_standard_versions SET status='pending_review' WHERE id='new0'"); refreshManifest(f); }, /status/],
  ['changed source bytes', f => fs.appendFileSync(path.join(path.dirname(f.staged), 'sources/main.xls'), 'tampered'), /source/],
  ['duplicate sources', f => { const file = path.join(path.dirname(f.staged), 'baseline-manifest.json'); const m = JSON.parse(fs.readFileSync(file)); m.sources[1] = m.sources[0]; fs.writeFileSync(file, JSON.stringify(m)); }, /source/],
  ['unapproved source hashes', f => { const file = path.join(path.dirname(f.staged), 'baseline-manifest.json'); const m = JSON.parse(fs.readFileSync(file)); m.sources[0].sha256 = 'a'.repeat(64); fs.writeFileSync(file, JSON.stringify(m)); }, /source/],
  ['wrong schema even with fresh manifest', f => { edit(f.staged, 'CREATE TABLE unexpected(id TEXT)'); refreshManifest(f); }, /schema/],
]) test('rejects ' + name + ' without touching target', t => {
  const f = fixture(t), before = digest(f.target); mutate(f);
  assert.throws(() => service.previewBaselineCutover(f), error);
  assert.equal(digest(f.target), before);
});

test('non-root production inspection cannot be bypassed by options or environment', t => {
  const f = fixture(t); process.getuid.mock.mockImplementation(() => 501);
  assert.throws(() => service.previewBaselineCutover({ ...f, guard: () => true, skipQuiescence: true }), /root/);
});
test('archive tampering prevents rollback', t => {
  const f = fixture(t), r = apply(f);
  edit(path.join(r.archive, 'original/standards.db'), 'UPDATE standard_query_state SET revision=88');
  assert.throws(() => service.rollbackBaselineCutover({ target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint }), /archive changed/);
});
test('overflow and concurrent operation lock fail closed', t => {
  const f = fixture(t); edit(f.target, 'UPDATE standard_query_state SET revision=9007199254740991');
  assert.throws(() => service.previewBaselineCutover(f), /overflow/);
  edit(f.target, 'UPDATE standard_query_state SET revision=100');
  const p = service.previewBaselineCutover(f);
  fs.mkdirSync(path.join(path.dirname(f.target), '.standards-baseline-cutover.lock'));
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /EEXIST/);
});
test('new revision exceeds both old and staged revisions, preserving owner and mode', t => {
  const f = fixture(t); edit(f.staged, 'UPDATE standard_query_state SET revision=300'); refreshManifest(f, { revision: 300 });
  fs.chmodSync(f.target, 0o640); const before = fs.statSync(f.target);
  apply(f); const after = fs.statSync(f.target);
  assert.equal(service.inspectSQLite(f.target).revision, 301);
  assert.equal(after.mode & 0o777, before.mode & 0o777);
  assert.equal(after.uid, before.uid); assert.equal(after.gid, before.gid);
});

const realSpawn = cp.spawnSync;
test('real orphaned WAL/SHM are archived as a byte-identical group, checkpointing only copies', t => {
  const f = fixture(t);
  const child = realSpawn(process.execPath, ['--input-type=module', '-e', `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO standard_publication_outbox VALUES('old-wal','keep');");
    process.exit(0);
  `, f.target], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const hashes = ['', '-wal', '-shm'].map(s => [s, digest(f.target + s)]);
  const p = service.previewBaselineCutover(f);
  assert.equal(p.targetState.counts.standard_publication_outbox, 1);
  for (const [s, hash] of hashes) assert.equal(digest(f.target + s), hash);
  const r = service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint });
  for (const [s, hash] of hashes) assert.equal(digest(path.join(r.archive, 'original/standards.db' + s)), hash);
  assert.equal(fs.existsSync(f.target + '-wal'), false);
  assert.equal(fs.existsSync(f.target + '-shm'), false);
  service.rollbackBaselineCutover({ target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint });
  for (const [s, hash] of hashes) assert.equal(digest(path.join(r.archive, 'original/standards.db' + s)), hash);
  assert.equal(service.inspectSQLite(f.target).counts.standard_publication_outbox, 1);
  assert.equal(service.inspectSQLite(f.target).revision, 102);
});
test('CLI parser requires explicit flags and exact fingerprint; no force bypass', async t => {
  const { runBaselineCutoverCLI: run } = await import('../server/scripts/standard-baseline-cutover.js');
  const f = fixture(t);
  for (const args of [[], ['apply'], ['preview', '--force', 'yes'], ['preview', '--target', f.target, '--target', f.target]]) assert.throws(() => run(args));
  const flags = ['--target', f.target, '--staged', f.staged, '--archive-root', f.archiveRoot, '--maintenance-file', f.maintenanceFile];
  const p = run(['preview', ...flags]); assert.equal(typeof p.fingerprint, 'string');
  assert.throws(() => run(['apply', ...flags, '--fingerprint', 'bad']), /fingerprint/);
  const r = run(['apply', ...flags, '--fingerprint', p.fingerprint]);
  assert.equal(run(['rollback', '--target', f.target, '--archive', r.archive, '--maintenance-file', f.maintenanceFile, '--fingerprint', r.rollbackFingerprint]).rolledBack, true);
});

test('startup identical category UPDATEs, higher revision and WAL mode permit rollback', t => {
  const f = fixture(t), r = apply(f), original = service.inspectSQLite(path.join(r.archive, 'original/standards.db'));
  const child = realSpawn(process.execPath, ['--input-type=module', '-e', `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    for (let i=0;i<7;i++) db.exec("UPDATE standard_categories SET name='One' WHERE key='one'; UPDATE standard_query_state SET revision=revision+1 WHERE id=1;");
    process.exit(0);
  `, f.target], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  service.rollbackBaselineCutover({ target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint });
  const restored = service.inspectSQLite(f.target);
  assert.equal(restored.contentHash, original.contentHash);
  assert.equal(restored.revision, 109);
});
for (const [name, sql] of [
  ['spec', "UPDATE product_standard_versions SET status='obsolete' WHERE id='new0'"],
  ['outbox', "INSERT INTO standard_publication_outbox VALUES('new','send')"],
  ['reminder', "INSERT INTO standard_review_reminders VALUES('new','send')"],
  ['category', "UPDATE standard_categories SET name='Business edit' WHERE key='one'"],
  ['pragma', 'PRAGMA user_version=22'],
  ['revision rewind', 'UPDATE standard_query_state SET revision=0'],
]) test('rollback refuses business or incompatible state change: ' + name, t => {
  const f = fixture(t), r = apply(f); edit(f.target, sql); const before = digest(f.target);
  assert.throws(() => service.rollbackBaselineCutover({ target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint }), /changed|writes|revision/);
  assert.equal(digest(f.target), before);
});
test('migration column order and CREATE whitespace do not block equivalent schema', t => {
  const f = fixture(t);
  edit(f.target, `ALTER TABLE standard_categories RENAME TO old_categories;
    CREATE TABLE standard_categories ( name TEXT, key TEXT PRIMARY KEY );
    INSERT INTO standard_categories(name,key) SELECT name,key FROM old_categories;
    DROP TABLE old_categories;`);
  const p = service.previewBaselineCutover(f);
  assert.equal(typeof p.fingerprint, 'string');
});
test('semantically different column default is rejected despite matching table names', t => {
  const f = fixture(t);
  edit(f.target, `ALTER TABLE standard_categories RENAME TO old_categories;
    CREATE TABLE standard_categories(key TEXT PRIMARY KEY,name TEXT DEFAULT 'different');
    INSERT INTO standard_categories SELECT * FROM old_categories; DROP TABLE old_categories;`);
  assert.throws(() => service.previewBaselineCutover(f), /schema/);
});
test('staged WAL header is rejected even when closed with no sidecars', t => {
  const f = fixture(t); edit(f.staged, 'PRAGMA journal_mode=WAL'); refreshManifest(f);
  assert.throws(() => service.previewBaselineCutover(f), /DELETE|journal/);
});

test('dangling WAL symlink is refused before any database read or move', t => {
  const f = fixture(t);
  fs.symlinkSync(path.join(path.dirname(f.target), 'nonexistent.db'), f.target + '-wal');
  assert.throws(() => service.previewBaselineCutover(f), /symlink/);
});
test('root lsof warnings and stage-only holders fail closed', t => {
  const f = fixture(t);
  cp.spawnSync.mock.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'WARNING: cannot stat filesystem' }));
  assert.throws(() => service.previewBaselineCutover(f), /incomplete/);
  cp.spawnSync.mock.mockImplementation((command, args) => ({ status: args.includes(f.staged) ? 0 : 1, stdout: args.includes(f.staged) ? '999' : '', stderr: '' }));
  assert.throws(() => service.previewBaselineCutover(f), /held/);
});
test('mid-preparation drift is rejected before moving old database', t => {
  const f = fixture(t), p = service.previewBaselineCutover(f);
  const copy = fs.copyFileSync;
  let injected = false;
  t.mock.method(fs, 'copyFileSync', (from, to, mode) => {
    copy(from, to, mode);
    if (!injected && String(to).includes('.prepared-')) {
      injected = true; edit(f.target, "INSERT INTO standard_publication_outbox VALUES('late','write')");
    }
  });
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /fingerprint changed/);
  assert.equal(service.inspectSQLite(f.target).counts.standard_publication_outbox, 1);
});
test('partial original runtime-set rename failure restores every original byte', t => {
  const f = fixture(t);
  const child = realSpawn(process.execPath, ['--input-type=module', '-e', `import { DatabaseSync } from 'node:sqlite'; const d=new DatabaseSync(process.argv[1]);d.exec('PRAGMA journal_mode=WAL;UPDATE standard_query_state SET revision=100');process.exit(0);`, f.target], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const before = ['', '-wal', '-shm'].map(s => [s, digest(f.target + s)]), p = service.previewBaselineCutover(f), rename = fs.renameSync;
  let injected = false;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (!injected && from === f.target + '-wal' && String(to).includes('/original/')) { injected = true; throw new Error('partial group injected'); }
    return rename(from, to);
  });
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /partial group/);
  for (const [s, hash] of before) assert.equal(digest(f.target + s), hash);
});
test('failed rollback rename restores latest installed runtime group', t => {
  const f = fixture(t), r = apply(f), before = digest(f.target), rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (String(from).includes('rollback-prepared-') && to === f.target) throw new Error('rollback rename injected');
    return rename(from, to);
  });
  assert.throws(() => service.rollbackBaselineCutover({ target: f.target, archive: r.archive, maintenanceFile: f.maintenanceFile, fingerprint: r.rollbackFingerprint }), /rollback rename/);
  assert.equal(digest(f.target), before);
});

test('fixtures contain only synthetic source bytes and never require private Excel', t => {
  const f = fixture(t);
  assert.equal(fs.readFileSync(path.join(path.dirname(f.staged), 'sources/main.xls')).length, Buffer.byteLength('teao-cutover-synthetic-main-v1\n'));
  assert.equal(fs.readFileSync(path.join(path.dirname(f.staged), 'sources/sanitary.xls')).length, Buffer.byteLength('teao-cutover-synthetic-sanitary-v1\n'));
});

test('crypto fixture mapping never affects ordinary bytes or tampered source hashes', () => {
  for (const bytes of [Buffer.from('ordinary SHA256'), Buffer.concat([syntheticSources[0].bytes, Buffer.from('tampered')])]) {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), realCreateHash('sha256').update(bytes).digest('hex'));
  }
});
for (const [name, change] of [
  ['missing', file => fs.renameSync(file, file + '.off')],
  ['changed bytes', file => fs.appendFileSync(file, '\n')],
  ['over 10MB', file => fs.truncateSync(file, 10 * 1024 * 1024 + 1)],
]) test('parsed source-records payload rejects ' + name, t => {
  const f = fixture(t), p = service.previewBaselineCutover(f), before = digest(f.target);
  change(path.join(path.dirname(f.staged), 'source-records.json'));
  assert.throws(() => service.applyBaselineCutover({ ...f, fingerprint: p.fingerprint }), /source-records|payload|recordsHash/);
  assert.equal(digest(f.target), before);
});
