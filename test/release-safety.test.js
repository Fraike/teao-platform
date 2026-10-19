import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { backupData, nginxConfig, artifactManifest, allowedArtifact } from '../server/scripts/release-common.js';
import { packageRelease } from '../server/scripts/release-package.js';
import { deploy, rollback, captureBaseline, baselineHealth, health } from '../server/scripts/release-deploy.js';

function put(root, name, value) {
  const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value); return target;
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teao-release-'));
  const repo = path.join(root, 'repo'), site = path.join(root, 'site'), stage = path.join(root, 'stage');
  put(repo, 'dist/index.html', 'new html'); put(repo, 'dist/assets/app.js', 'new asset');
  put(repo, 'server/server.js', 'console.log("new")');
  put(repo, 'server/package.json', '{}'); put(repo, 'server/package-lock.json', '{}');
  put(repo, 'server/teao-api.service', 'new unit');
  put(repo, 'server/data/employees-seed.json', '[]');
  put(repo, 'server/data/standard-source-decisions.json', '{}');
  put(repo, 'server/data/production.db', 'forbidden');
  put(repo, 'server/.env', 'secret'); put(repo, 'server/production-config.json', 'private');
  put(repo, 'server/node_modules/unused.js', 'dependency');
  packageRelease(repo, stage);
  put(site, 'index.html', 'old html'); put(site, 'assets/app.js', 'old asset');
  put(site, 'server/server.js', 'old code');
  const data = path.join(site, 'data');
  put(data, 'users.json', '[{"name":"unchanged"}]'); put(data, 'production-config.json', '{"enabled":false}');
  for (const name of ['production', 'quotation', 'standards', 'feedback']) {
    const db = new DatabaseSync(path.join(data, name + '.db'));
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE fixture(value TEXT); INSERT INTO fixture VALUES (\'original\')'); db.close();
  }
  const envFile = put(root, 'env', `JWT_SECRET=fixture\nDATA_DIR=${data}\nPRODUCTION_CONFIG_PATH=${data}/production-config.json\nKINGDEE_CLIENT_ID=fixture\nKINGDEE_CLIENT_SECRET=fixture\nINITIAL_ADMIN_PASSWORD=fixture\nADMIN_RECOVERY_CODE=fixture\nSTANDARD_REVIEW_REMINDERS_ENABLED=false\nTEAO_RELEASE_MAINTENANCE_FILE=${root}/releases/maintenance\n`);
  fs.chmodSync(envFile, 0o600);
  const nginxFile = put(root, 'nginx.conf', `server { listen 80; root ${site}; location /api/ { proxy_pass http://127.0.0.1:3899; } location / { try_files $uri /index.html; } }`);
  const unitFile = put(root, 'unit', 'old unit');
  return { root, stage, site, envFile, nginxFile, unitFile, stateRoot: path.join(root, 'releases') };
}
const run = (program) => program === 'curl' ? '{"ok":true,"service":"teao-api"}\n200' : program === 'nginx' ? 'user www-data;' : '';

test('native backup includes committed WAL rows and all four databases/users/config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teao-backup-')), data = path.join(root, 'data'); fs.mkdirSync(data);
  const live = new DatabaseSync(path.join(data, 'standards.db'));
  live.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE notes(value); INSERT INTO notes VALUES (42)');
  put(data, 'users.json', 'users'); put(data, 'production-config.json', 'config');
  for (const name of ['production','quotation','feedback']) { const db = new DatabaseSync(path.join(data, name + '.db')); db.exec('CREATE TABLE t(n)'); db.close(); }
  try {
    assert(fs.existsSync(path.join(data, 'standards.db-wal')));
    assert.equal((await backupData(data, path.join(root, 'backup'))).length, 4);
    const copy = new DatabaseSync(path.join(root, 'backup/standards.db'), { readOnly: true });
    assert.equal(copy.prepare('SELECT value FROM notes').get().value, 42); copy.close();
    assert(!fs.existsSync(path.join(root, 'backup/standards.db-wal')));
    assert.equal(fs.readFileSync(path.join(root, 'backup/users.json'), 'utf8'), 'users');
  } finally { live.close(); }
});

test('packaging excludes runtime data, config, env and dependencies, retains seed manifests', () => {
  const options = fixture(), files = artifactManifest(options.stage).map(r => r.name);
  assert(files.includes('server/data/standard-source-decisions.json'));
  assert(!files.some(f => /production\.db|production-config|\.env|node_modules/.test(f)));
  put(options.stage, 'server/data/users.json', 'bad');
  assert.throws(() => artifactManifest(options.stage), /数据/);
});

test('static release refuses raw spreadsheets that bypass gitignore through public copying',()=>{
  for(const file of ['dist/members/employees.xlsx','dist/source.xls','dist/source.xlsm','dist/customer.csv','dist/data.tsv'])assert.equal(allowedArtifact(file),false,file);
  assert.equal(allowedArtifact('dist/assets/app.js'),true);
  const f=fixture();put(f.stage,'dist/members/employees.xlsx','private original');
  assert.throws(()=>artifactManifest(f.stage),/数据|未允许/);
  const repo=path.join(f.root,'repo');put(repo,'dist/members/private.xlsx','unapproved original');
  assert.throws(()=>packageRelease(repo,path.join(f.root,'rejected-stage')),/原始表格/);
});

test('nginx replaces existing proxy, sets 20m/IP/long timeout and maintenance', () => {
  const source = 'server { root /var/www/teao-platform; location /api/ { proxy_read_timeout 5s; } location / { try_files $uri /index.html; } }';
  const config = nginxConfig(source, '/var/lib/teao-platform/releases/maintenance');
  assert(config.includes('client_max_body_size 20m;')); assert(config.includes('X-Real-IP $remote_addr'));
  assert(config.includes('X-Forwarded-For $remote_addr')); assert(config.includes('proxy_read_timeout 600s;'));
  assert(config.includes('return 503')); assert(config.includes('try_files $uri /index.html'));
  assert.equal(nginxConfig(config, '/var/lib/teao-platform/releases/maintenance'), config);
  assert(config.includes('location ^~ /server/ { deny all; }'));
  assert(config.includes('location ^~ /data/ { deny all; }'));
  const dotPattern = /\/\.(?!well-known(?:\/|$))/;
  for (const url of ['/.env','/.git/config','/assets/.secret','/.well-known/.env']) assert(dotPattern.test(url));
  assert(!dotPattern.test('/.well-known/acme-challenge/token'));
  assert(config.includes('location ~ /\\.(?!well-known(?:/|$)) { deny all; }'));
  assert.throws(() => nginxConfig('server {}', '/tmp/maintenance'), /root/);
  assert.throws(() => nginxConfig(source + ' server { server_name unrelated; root /other; }', '/tmp/maintenance'), /一个server/);
  assert.throws(() => nginxConfig(source.replace('/var/www/teao-platform','/other'), '/tmp/maintenance'), /root/);
});

test('default preview has no writes or commands; explicit fingerprint and flag required', async () => {
  const options = fixture();
  const before = fs.readFileSync(options.envFile);
  const preview = await deploy(options, () => { throw new Error('must not run'); });
  assert.equal(preview.mode, 'preview'); assert(!fs.existsSync(options.stateRoot));
  await assert.rejects(deploy({ ...options, apply: true, confirm: 'wrong' }, run), /confirm/);
  assert.deepEqual(fs.readFileSync(options.envFile), before);
  fs.writeFileSync(options.envFile, before.toString().replace('STANDARD_REVIEW_REMINDERS_ENABLED=false', ''));
  await assert.rejects(deploy(options, run), /STANDARD_REVIEW_REMINDERS_ENABLED/);
});

test('worker maintenance marker must exactly match release marker, including custom stateRoot', async () => {
  const options = fixture(), original = fs.readFileSync(options.envFile, 'utf8');
  const line = original.split('\n').find(value => value.startsWith('TEAO_RELEASE_MAINTENANCE_FILE='));
  for (const replacement of ['', 'TEAO_RELEASE_MAINTENANCE_FILE=/tmp/other-maintenance', `TEAO_RELEASE_MAINTENANCE_FILE=${options.stateRoot}/./maintenance`]) {
    fs.writeFileSync(options.envFile, original.replace(line, replacement));
    await assert.rejects(deploy(options, () => { throw new Error('must not run'); }), /TEAO_RELEASE_MAINTENANCE_FILE/);
    assert(!fs.existsSync(options.stateRoot));
  }
  fs.writeFileSync(options.envFile, original);
  assert.equal((await deploy(options)).mode, 'preview');
});

test('failure after API start rolls code, unit, nginx and runtime data back consistently', async () => {
  const options = fixture(), beforeEnv = fs.readFileSync(options.envFile), beforeNginx = fs.readFileSync(options.nginxFile);
  const preview = await deploy(options);
  let checks = 0;
  const fakeRun = (program, args) => {
    if (program === 'curl' && checks++ === 1) {
      const db = new DatabaseSync(path.join(options.site, 'data/standards.db'));
      db.exec("UPDATE fixture SET value='failed startup migration'"); db.close();
      put(options.site, 'data/users.json', 'failed users');
      throw new Error('simulated startup failure');
    }
    return run(program, args);
  };
  await assert.rejects(deploy({ ...options, apply: true, confirm: preview.fingerprint }, fakeRun), /rolled-back/);
  assert.equal(fs.readFileSync(path.join(options.site, 'index.html'), 'utf8'), 'old html');
  assert.equal(fs.readFileSync(path.join(options.site, 'server/server.js'), 'utf8'), 'old code');
  assert.equal(fs.readFileSync(options.unitFile, 'utf8'), 'old unit');
  assert.deepEqual(fs.readFileSync(options.envFile), beforeEnv);
  assert.equal(fs.readFileSync(options.nginxFile, 'utf8'), nginxConfig(beforeNginx.toString(), path.join(options.stateRoot,'maintenance'), options.site));
  const db = new DatabaseSync(path.join(options.site, 'data/standards.db'), { readOnly: true });
  assert.equal(db.prepare('SELECT value FROM fixture').get().value, 'original'); db.close();
  assert.equal(JSON.parse(fs.readFileSync(path.join(options.site, 'data/users.json')))[0].name, 'unchanged');
  assert(!fs.existsSync(path.join(options.stateRoot, 'maintenance'))); assert(!fs.existsSync(path.join(options.stateRoot, 'lock')));
});

test('successful release retains DATA_DIR and environment; rollback is separate preview/apply', async () => {
  const options = fixture(), preview = await deploy(options);
  const result = await deploy({ ...options, apply: true, confirm: preview.fingerprint }, run);
  assert.equal(fs.readFileSync(path.join(options.site, 'index.html'), 'utf8'), 'new html');
  const plan = await rollback(result.stateFile);
  assert.equal(plan.mode, 'rollback-preview');
  await assert.rejects(rollback(result.stateFile, { apply: true, confirm: 'wrong' }, run), /confirm/);
  // Manual code rollback after opening traffic MUST NOT overwrite later runtime writes.
  put(options.site, 'data/users.json', 'new live users');
  await rollback(result.stateFile, { apply: true, confirm: plan.fingerprint }, run);
  assert.equal(fs.readFileSync(path.join(options.site, 'index.html'), 'utf8'), 'old html');
  assert.equal(fs.readFileSync(path.join(options.site, 'data/users.json'), 'utf8'), 'new live users');
  assert(fs.readFileSync(options.nginxFile, 'utf8').includes('location ^~ /data/ { deny all; }'));
});

test('unrecoverable health failure leaves maintenance and lock in place', async () => {
  const options = fixture(), preview = await deploy(options);
  let checks = 0;
  await assert.rejects(deploy({ ...options, apply: true, confirm: preview.fingerprint }, program => {
    if (program === 'curl' && checks++ > 0) throw new Error('failed'); return run(program);
  }), /recovery-required/);
  assert(fs.existsSync(path.join(options.stateRoot, 'maintenance')));
  assert(fs.existsSync(path.join(options.stateRoot, 'lock')));
});

function legacyRunner(options, newResponse = '{"ok":true,"service":"teao-api"}\n200') {
  const calls = [];
  const execute = (program, args) => {
    calls.push([program, ...args]);
    if (program === 'nginx' || program === 'systemctl' && args[0] === 'stop') {
      const directory = fs.readdirSync(options.stateRoot).find(name => /^\d+-\d+$/.test(name));
      const saved = JSON.parse(fs.readFileSync(path.join(options.stateRoot, directory, 'state.json')));
      assert.deepEqual(saved.baselineHealth, {version:1,probe:'legacy-auth-me-v1'});
    }
    if (program !== 'curl') return run(program);
    const old = fs.readFileSync(path.join(options.site,'server/server.js'),'utf8') === 'old code';
    const endpoint = args.at(-1);
    if (endpoint.endsWith('/api/auth/me')) {
      assert(old, 'new release must never use the legacy readiness probe');
      return '{"error":"未登录"}\n401';
    }
    assert(endpoint.endsWith('/api/health'));
    return old ? 'Cannot GET /api/health\n404' : newResponse;
  };
  return { execute, calls };
}

test('first deployment failure restores HEAD without health using its persisted legacy baseline', async () => {
  const options = fixture(), preview = await deploy(options);
  const legacy = legacyRunner(options, '{"ok":false,"service":"teao-api"}\n200');
  await assert.rejects(deploy({...options,apply:true,confirm:preview.fingerprint},legacy.execute),/rolled-back/);
  assert.equal(fs.readFileSync(path.join(options.site,'server/server.js'),'utf8'),'old code');
  const requests = legacy.calls.filter(c=>c[0]==='curl').map(c=>c.at(-1));
  assert.deepEqual(requests.map(url=>url.split('/api/')[1]),['health','auth/me','health','auth/me']);
  assert(!fs.existsSync(path.join(options.stateRoot,'maintenance')));
  assert(!fs.existsSync(path.join(options.stateRoot,'lock')));
});

test('successful deployment manually rolls back to legacy baseline; missing historic baseline rejects before preview', async () => {
  const options = fixture(), preview = await deploy(options), legacy = legacyRunner(options);
  const result = await deploy({...options,apply:true,confirm:preview.fingerprint},legacy.execute);
  const state = JSON.parse(fs.readFileSync(result.stateFile));
  const { baselineHealth: omitted, ...historic } = state;
  assert.equal(omitted.probe,'legacy-auth-me-v1');
  fs.writeFileSync(result.stateFile,JSON.stringify(historic));
  await assert.rejects(rollback(result.stateFile,{},()=>{throw new Error('no commands allowed');}),/baseline health/);
  fs.writeFileSync(result.stateFile,JSON.stringify(state));
  const plan = await rollback(result.stateFile);
  legacy.calls.length=0;
  await rollback(result.stateFile,{apply:true,confirm:plan.fingerprint},legacy.execute);
  assert.equal(fs.readFileSync(path.join(options.site,'server/server.js'),'utf8'),'old code');
  assert.deepEqual(legacy.calls.filter(c=>c[0]==='curl').map(c=>c.at(-1)),['http://127.0.0.1:3899/api/auth/me']);
  assert(legacy.calls.some(c=>c[0]==='systemctl'&&c[1]==='is-active'));
});

test('new readiness stays strict for 404, 500, invalid JSON and wrong service; saved baseline never downgrades', () => {
  for (const response of ['missing\n404','failed\n500','not-json\n200','{"ok":true,"service":"other"}\n200']) {
    const calls=[];
    const execute=(program,args)=>{calls.push([program,...args]);return program==='curl'?response:'';};
    assert.throws(()=>health(execute));
    assert.throws(()=>baselineHealth({version:1,probe:'health-v1'},execute));
    assert(!calls.some(c=>c.at(-1)?.endsWith('/api/auth/me')));
  }
  const calls=[];
  assert.throws(()=>baselineHealth({version:1,probe:'legacy-auth-me-v1'},(program,args)=>{
    calls.push([program,...args]);return program==='curl'?'missing\n404':'';
  }));
  assert(!calls.some(c=>c.at(-1)?.endsWith('/api/health')));
});

test('abnormal old probes abort before nginx changes or service stop, with no opportunistic fallback', async () => {
  const cases = [
    {health:'error\n500'}, {health:'unauthorized\n401'}, {health:'redirect\n302'},
    {health:'not-json\n200'}, {health:'{"ok":true,"service":"other"}\n200'},
    {health:null}, {health:'missing\n404',auth:'{"error":"未登录"}\n200'},
    {health:'missing\n404',auth:'{"error":"其他错误"}\n401'},
    {health:'missing\n404',auth:'not-json\n401'},
  ];
  for (const scenario of cases) {
    const options=fixture(),preview=await deploy(options),nginxBefore=fs.readFileSync(options.nginxFile),calls=[];
    const execute=(program,args)=>{
      calls.push([program,...args]);
      if(program!=='curl')return run(program);
      if(scenario.health===null)throw new Error('connection failure');
      return args.at(-1).endsWith('/api/health')?scenario.health:scenario.auth;
    };
    await assert.rejects(deploy({...options,apply:true,confirm:preview.fingerprint},execute),/发布失败/);
    assert.deepEqual(fs.readFileSync(options.nginxFile),nginxBefore);
    assert(!calls.some(c=>c[0]==='nginx'||c[0]==='systemctl'&&c[1]==='stop'));
    assert(!fs.existsSync(path.join(options.stateRoot,'maintenance')));
    if(!scenario.auth)assert(!calls.some(c=>c.at(-1)?.endsWith('/api/auth/me')));
  }
  assert.deepEqual(captureBaseline(run),{version:1,probe:'health-v1'});
});

test('workflow only dispatches manually, serializes releases, and embedded shell passes bash -n', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert(!/^  (push|pull_request|schedule):/m.test(workflow));
  assert.match(workflow, /cancel-in-progress: false/);
  assert.equal((workflow.match(/uses: easingthemes\/ssh-deploy/g) || []).length, 1);
  const blocks = [...workflow.matchAll(/(?:run|SCRIPT_AFTER): \|\n((?:[ \t]+[^\n]*\n?)*)/g)];
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    const shell = block[1].replace(/\$\{\{[^}]+\}\}/g, '12345');
    const result = spawnSync('bash', ['-n'], { input: shell, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
