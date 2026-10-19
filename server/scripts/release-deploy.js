import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { artifactManifest, backupData, canonicalPath, digest, inside, nginxConfig, readEnvironment } from './release-common.js';

export function command(program, args, options = {}) {
  const result = spawnSync(program, args, { ...options, encoding: 'utf8', stdio: 'pipe' });
  // Never echo command output: npm/nginx/systemd may include private config.
  if (result.error || result.status !== 0) throw new Error(`${program} 检查失败（输出已隐藏）`);
  return result.stdout;
}
function journal(stateFile, state) {
  const temporary = stateFile + '.next';
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
}
function envCheck(env, site) {
  for (const key of ['JWT_SECRET', 'DATA_DIR', 'KINGDEE_CLIENT_ID', 'KINGDEE_CLIENT_SECRET', 'INITIAL_ADMIN_PASSWORD', 'ADMIN_RECOVERY_CODE']) {
    if (!env[key]) throw new Error(`环境缺少 ${key}`);
  }
  if (!['true', 'false'].includes(env.STANDARD_REVIEW_REMINDERS_ENABLED)) throw new Error('运维必须显式设置 STANDARD_REVIEW_REMINDERS_ENABLED=true/false');
  if (!path.isAbsolute(env.DATA_DIR) || !fs.statSync(env.DATA_DIR).isDirectory()) throw new Error('DATA_DIR 必须是已存在的绝对路径');
  const data = fs.realpathSync(env.DATA_DIR);
  const realSite = fs.realpathSync(site);
  if (inside(realSite, data) && data !== path.join(realSite, 'data')) throw new Error('站点内部 DATA_DIR 仅支持受保护的 site/data');
  for (const key of ['PRODUCTION_DB_PATH', 'QUOTATION_DB_PATH', 'PRODUCTION_CONFIG_PATH']) {
    if (env[key] && (!path.isAbsolute(env[key]) || !inside(data, canonicalPath(env[key])))) throw new Error(`${key} 必须位于受保护 DATA_DIR 内`);
  }
  if (!env.PRODUCTION_CONFIG_PATH) throw new Error('需显式设置 PRODUCTION_CONFIG_PATH 到 DATA_DIR 内的持久配置（先单独审核准备）');
  if (!fs.existsSync(env.PRODUCTION_CONFIG_PATH)) throw new Error('持久生产配置不存在，拒绝首次启动生成默认配置');
  return data;
}
export function preflight(options) {
  const { stage, site, stateRoot, envFile, nginxFile } = options;
  for (const value of [stage, site, stateRoot, envFile, nginxFile]) if (!path.isAbsolute(value)) throw new Error('所有路径必须为绝对路径');
  if (inside(site, stage) || inside(site, stateRoot) || inside(stage, site) || inside(stage, stateRoot)) throw new Error('staging/state 必须与在线目录隔离');
  if (fs.lstatSync(site).isSymbolicLink()) throw new Error('站点根目录不接受符号链接');
  const env = readEnvironment(envFile), data = envCheck(env, site);
  const realSite = canonicalPath(site), realStage = canonicalPath(stage), realState = canonicalPath(stateRoot);
  if (inside(realSite, realStage) || inside(realSite, realState) || inside(realStage, realSite) || inside(realStage, realState)
    || inside(data, realStage) || inside(data, realState) || inside(realState, data) || inside(realSite, canonicalPath(envFile))) throw new Error('实际路径重叠或持久环境文件不独立');
  let stateParent = stateRoot;
  while (!fs.existsSync(stateParent)) stateParent = path.dirname(stateParent);
  if (fs.statSync(site).dev !== fs.statSync(stateParent).dev || fs.statSync(site).dev !== fs.statSync(data).dev) throw new Error('site、DATA_DIR、stateRoot须在同一文件系统，保障保留式回移；请先单独审核磁盘布局');
  if (fs.statSync(envFile).mode & 0o077) throw new Error('持久环境文件权限必须为0600或更严格');
  const manifest = artifactManifest(stage);
  if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(stage, 'release-manifest.json'), 'utf8')))) throw new Error('发布包清单校验失败');
  for (const name of fs.readdirSync(path.join(stage, 'dist'))) if (['data', 'server', 'trash_review'].includes(name) || name.startsWith('.')) throw new Error('静态顶层目录冲突');
  const marker = path.join(stateRoot, 'maintenance');
  const workerMarker = env.TEAO_RELEASE_MAINTENANCE_FILE || '/var/lib/teao-platform/releases/maintenance';
  if (workerMarker !== marker) throw new Error('TEAO_RELEASE_MAINTENANCE_FILE必须与release维护标记完全一致，禁止绕过worker维护保护');
  const nginx = nginxConfig(fs.readFileSync(nginxFile, 'utf8'), marker, site);
  return { env, data, nginx, manifest, fingerprint: digest(JSON.stringify({ manifest, nginx, envHash: digest(fs.readFileSync(envFile)) })) };
}
function probe(endpoint, run) {
  const output = run('curl', ['--silent', '--retry', '10', '--retry-all-errors', '--retry-delay', '1', '--max-time', '15', '--request', 'GET', '--write-out', '\n%{http_code}', `http://127.0.0.1:3899${endpoint}`]);
  const separator = output.lastIndexOf('\n');
  const status = output.slice(separator + 1);
  if (separator < 0 || !/^[1-5]\d\d$/.test(status)) throw new Error('API探针未返回明确HTTP状态');
  return { status: Number(status), body: output.slice(0, separator) };
}
function jsonResponse(body) {
  let response;
  try { response = JSON.parse(body); } catch { throw new Error('API readiness 未返回合法 JSON'); }
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('API探针JSON类型无效');
  return response;
}
function strictHealth(result) {
  if (result.status !== 200) throw new Error('API readiness HTTP状态不是200');
  const response = jsonResponse(result.body);
  if (response.ok !== true || response.service !== 'teao-api') throw new Error('API readiness 未返回预期服务标记');
}
function legacyHealth(result) {
  if (result.status !== 401 || jsonResponse(result.body).error !== '未登录') throw new Error('旧服务探针必须为401与JSON未登录标记');
}
export function validateBaseline(baseline) {
  if (!baseline || baseline.version !== 1 || !['health-v1', 'legacy-auth-me-v1'].includes(baseline.probe)
    || Object.keys(baseline).sort().join(',') !== 'probe,version') throw new Error('缺少或不支持持久化baseline health，拒绝回滚；需独立审阅历史state');
}
export function captureBaseline(run = command) {
  run('systemctl', ['is-active', '--quiet', 'teao-api']);
  const result = probe('/api/health', run);
  if (result.status === 404) {
    legacyHealth(probe('/api/auth/me', run));
    return { version: 1, probe: 'legacy-auth-me-v1' };
  }
  strictHealth(result);
  return { version: 1, probe: 'health-v1' };
}
export function baselineHealth(baseline, run = command) {
  validateBaseline(baseline);
  run('systemctl', ['is-active', '--quiet', 'teao-api']);
  if (baseline.probe === 'health-v1') strictHealth(probe('/api/health', run));
  else legacyHealth(probe('/api/auth/me', run));
}
export function health(run = command) {
  run('systemctl', ['is-active', '--quiet', 'teao-api']);
  strictHealth(probe('/api/health', run));
}
function restoreCode(state, stateFile) {
  fs.mkdirSync(state.failed, { recursive: true, mode: 0o700 });
  for (const name of [...state.installed].reverse()) {
    const current = path.join(state.site, name);
    if (fs.existsSync(current)) fs.renameSync(current, path.join(state.failed, name));
    state.installed = state.installed.filter(item => item !== name); journal(stateFile, state);
  }
  for (const name of [...state.moved].reverse()) {
    fs.renameSync(path.join(state.previous, name), path.join(state.site, name));
    state.moved = state.moved.filter(item => item !== name); journal(stateFile, state);
  }
}
export async function deploy(options, run = command) {
  options = { unitFile: '/etc/systemd/system/teao-api.service', ...options };
  const check = preflight(options);
  if (!options.apply) return { mode: 'preview', fingerprint: check.fingerprint, steps: ['stage/check', 'lock/maintenance/stop', 'native-backup', 'switch/check', 'rollback-on-failure'], dataExcluded: true };
  if (options.confirm !== check.fingerprint) throw new Error('需 --confirm 匹配本次预检 fingerprint');
  fs.mkdirSync(options.stateRoot, { recursive: true, mode: 0o755 });
  const lock = path.join(options.stateRoot, 'lock'); fs.mkdirSync(lock, { mode: 0o700 });
  const id = `${Date.now()}-${process.pid}`, root = path.join(options.stateRoot, id);
  fs.mkdirSync(root, { mode: 0o700 });
  const stateFile = path.join(root, 'state.json');
  const currentFile = path.join(options.stateRoot, 'current.json');
  const state = { site: options.site, root, previous: path.join(root, 'previous'), failed: path.join(root, 'failed'), nginxFile: options.nginxFile, unitFile: options.unitFile,
    marker: path.join(options.stateRoot, 'maintenance'), previousStateFile: fs.existsSync(currentFile) ? JSON.parse(fs.readFileSync(currentFile)).stateFile : null,
    manifest: check.manifest, moved: [], installed: [], status: 'preparing' };
  journal(stateFile, state);
  let stopped = false, nginxChanged = false, nginxReady = false, maintenanceInstalled = false, dataMayHaveChanged = false;
  try {
    if (fs.existsSync(state.marker)) throw new Error('已有维护窗口，拒绝覆盖');
    fs.mkdirSync(state.previous, { mode: 0o700 });
    // Install and check dependencies before any downtime. Only staged source is executed.
    run('npm', ['ci', '--omit=dev', '--prefix', path.join(options.stage, 'server')]);
    run(process.execPath, ['--check', path.join(options.stage, 'server/server.js')]);
    // Capture and persist before changing nginx or stopping the old service.
    // Only an explicit 404 may select the predefined legacy probe.
    state.baselineHealth = captureBaseline(run); journal(stateFile, state);
    fs.copyFileSync(options.nginxFile, path.join(root, 'nginx.before'));
    fs.copyFileSync(options.envFile, path.join(root, 'environment.before'));
    fs.chmodSync(path.join(root, 'environment.before'), 0o600);
    fs.writeFileSync(options.nginxFile, check.nginx); nginxChanged = true;
    run('nginx', ['-t']); run('systemctl', ['reload', 'nginx']); nginxReady = true;
    fs.writeFileSync(state.marker, id, { flag: 'wx', mode: 0o644 }); maintenanceInstalled = true;
    const activeNginx = run('nginx', ['-T']);
    const nginxUser = activeNginx.match(/^\s*user\s+([a-zA-Z0-9_-]+)(?:\s+[a-zA-Z0-9_-]+)?\s*;/m)?.[1];
    if (!nginxUser) throw new Error('无法确定nginx worker用户，拒绝未经验证的维护窗口');
    run('runuser', ['-u', nginxUser, '--', 'test', '-r', state.marker]);
    stopped = true; run('systemctl', ['stop', 'teao-api']);
    await backupData(check.data, path.join(root, 'data-backup'));
    // Persist old unit too; the environment file itself is never rewritten.
    fs.copyFileSync(options.unitFile, path.join(root, 'unit.before'));
    const incoming = path.join(root, 'incoming'); fs.mkdirSync(incoming);
    fs.cpSync(path.join(options.stage, 'dist'), incoming, { recursive: true });
    fs.cpSync(path.join(options.stage, 'server'), path.join(incoming, 'server'), { recursive: true });
    for (const name of fs.readdirSync(incoming)) {
      const target = path.join(options.site, name);
      if (fs.existsSync(target)) { fs.renameSync(target, path.join(state.previous, name)); state.moved.push(name); journal(stateFile, state); }
      fs.renameSync(path.join(incoming, name), target); state.installed.push(name); journal(stateFile, state);
    }
    fs.copyFileSync(path.join(options.site, 'server/teao-api.service'), options.unitFile);
    run('systemctl', ['daemon-reload']); dataMayHaveChanged = true; run('systemctl', ['start', 'teao-api']); health(run);
    run('nginx', ['-t']);
    state.status = 'released'; journal(stateFile, state);
    journal(currentFile, { stateFile });
    fs.renameSync(state.marker, path.join(root, 'maintenance.completed'));
    fs.renameSync(lock, path.join(root, 'lock.completed'));
    return { mode: 'released', stateFile, dataRestored: false };
  } catch (error) {
    let recovered = false;
    try {
      if (stopped) run('systemctl', ['stop', 'teao-api']);
      restoreCode(state, stateFile);
      if (dataMayHaveChanged) {
        // No HTTP writes are admitted during this window. Preserve failed runtime
        // files for inspection, then restore the complete consistent pre-start image.
        const failedData = path.join(root, 'failed-data'); fs.mkdirSync(failedData, { mode: 0o700 });
        for (const name of fs.readdirSync(check.data)) fs.renameSync(path.join(check.data, name), path.join(failedData, name));
        const restored = path.join(root, 'restored-data');
        await backupData(path.join(root, 'data-backup'), restored);
        for (const name of fs.readdirSync(restored)) fs.renameSync(path.join(restored, name), path.join(check.data, name));
        state.dataRestored = true;
      }
      if (fs.existsSync(path.join(root, 'unit.before'))) fs.copyFileSync(path.join(root, 'unit.before'), options.unitFile);
      if (stopped) { run('systemctl', ['daemon-reload']); run('systemctl', ['start', 'teao-api']); baselineHealth(state.baselineHealth, run); }
      // After a tested nginx reload, retain download protection on code rollback.
      // Only a configuration that never passed validation is restored verbatim.
      if (nginxChanged && !nginxReady) fs.copyFileSync(path.join(root, 'nginx.before'), options.nginxFile);
      if (nginxChanged) { run('nginx', ['-t']); run('systemctl', ['reload', 'nginx']); }
      recovered = true;
    } catch { /* Keep maintenance and lock for operator recovery. */ }
    state.status = recovered ? 'rolled-back' : 'recovery-required'; journal(stateFile, state);
    if (recovered) {
      if (maintenanceInstalled && fs.existsSync(state.marker)) fs.renameSync(state.marker, path.join(root, 'maintenance.failed'));
      fs.renameSync(lock, path.join(root, 'lock.failed'));
    }
    throw new Error(`发布失败；${state.status}；审阅 ${stateFile}；${error.message}`);
  }
}

export async function rollback(stateFile, { apply = false, confirm } = {}, run = command) {
  const raw = fs.readFileSync(stateFile), state = JSON.parse(raw), fingerprint = digest(raw);
  validateBaseline(state.baselineHealth);
  if (state.status !== 'released') throw new Error('只支持对已完成发布单独回滚；中断状态需按 journal 人工恢复');
  const currentFile = path.join(path.dirname(state.root), 'current.json');
  if (JSON.parse(fs.readFileSync(currentFile)).stateFile !== stateFile) throw new Error('仅允许回滚当前最新release');
  const nginx = fs.readFileSync(state.nginxFile, 'utf8');
  if (nginx !== nginxConfig(nginx, state.marker, state.site)) throw new Error('当前nginx已偏离安全配置，需先审阅后再回滚');
  for (const file of state.manifest) {
    const name = file.name.startsWith('dist/') ? file.name.slice(5) : file.name;
    if (digest(fs.readFileSync(path.join(state.site, name))) !== file.sha256) throw new Error('线上代码已偏离当前release，需重新审阅');
  }
  if (!apply) return { mode: 'rollback-preview', fingerprint, site: state.site, dataRestored: false };
  if (confirm !== fingerprint) throw new Error('回滚需 --confirm 匹配预览 fingerprint');
  const lock = path.join(path.dirname(state.root), 'lock'); fs.mkdirSync(lock, { mode: 0o700 });
  if (fs.existsSync(state.marker)) throw new Error('已有维护窗口');
  fs.writeFileSync(state.marker, 'rollback', { flag: 'wx', mode: 0o644 });
  try {
    const activeNginx = run('nginx', ['-T']);
    const nginxUser = activeNginx.match(/^\s*user\s+([a-zA-Z0-9_-]+)(?:\s+[a-zA-Z0-9_-]+)?\s*;/m)?.[1];
    if (!nginxUser) throw new Error('无法确定nginx worker用户');
    run('runuser', ['-u', nginxUser, '--', 'test', '-r', state.marker]);
    run('systemctl', ['stop', 'teao-api']);
    restoreCode(state, stateFile);
    fs.copyFileSync(path.join(state.root, 'unit.before'), state.unitFile);
    // Keep the working maintenance-aware nginx config until recovery is healthy.
    run('systemctl', ['daemon-reload']); run('systemctl', ['start', 'teao-api']); baselineHealth(state.baselineHealth, run);
    // Keep 20m/IP/timeouts and deny rules; rolling code back must not expose DBs.
    run('nginx', ['-t']); run('systemctl', ['reload', 'nginx']);
    state.status = 'rolled-back'; journal(stateFile, state);
    journal(currentFile, { stateFile: state.previousStateFile });
    fs.renameSync(state.marker, path.join(state.root, 'maintenance.rollback'));
    fs.renameSync(lock, path.join(state.root, 'lock.rollback'));
    return { mode: 'rolled-back', dataRestored: false };
  } catch { state.status = 'recovery-required'; journal(stateFile, state); throw new Error('回滚失败，保留维护窗口与锁；按 state.json 人工恢复'); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') values.apply = true;
    else if (['--stage', '--site', '--state-root', '--env-file', '--nginx-file', '--confirm', '--rollback'].includes(args[i])) values[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
    else throw new Error('未知参数');
  }
  try {
    const result = values.rollback ? await rollback(values.rollback, values) : await deploy({ site: '/var/www/teao-platform', stateRoot: '/var/lib/teao-platform/releases', envFile: '/etc/teao-platform/teao-api.env', nginxFile: '/etc/nginx/sites-available/teao-platform', ...values });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
