import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function privateJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
export function readEnvironment(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error('EnvironmentFile 格式不支持；使用 KEY=value');
    let value = match[2];
    if (/^["']/.test(value)) {
      if (value.at(-1) !== value[0]) throw new Error('EnvironmentFile 引号不匹配');
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(env, match[1])) throw new Error('EnvironmentFile 存在重复字段');
    env[match[1]] = value;
  }
  return env;
}
export function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
export function canonicalPath(file) {
  return fs.existsSync(file) ? fs.realpathSync(file) : path.join(canonicalPath(path.dirname(file)), path.basename(file));
}
export function walk(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('不接受符号链接：' + name);
    if (entry.isDirectory()) return walk(directory, name);
    if (!entry.isFile()) throw new Error('不接受特殊文件：' + name);
    return [name];
  });
}
export function allowedArtifact(name) {
  const parts = name.split(path.sep);
  if (parts.some(p => p.startsWith('.') || /^(?:node_modules|trash_review|private|backups?)$/i.test(p))) return false;
  if (/\.(?:db|sqlite|sqlite3)(?:[-.]|$)|\.env|production-config\.json|users\.json|history\.json/i.test(name)) return false;
  if (parts[0] === 'dist') return !parts.includes('data') && !/\.(?:xlsx?|xlsm|xlsb|csv|tsv)$/i.test(name);
  if (parts[0] !== 'server') return false;
  if (parts[1] === 'data') return parts.length === 3 && ['employees-seed.json', 'standard-source-decisions.json'].includes(parts[2]);
  return !parts.slice(1).includes('data') && /\.(?:js|json|service|sh)$/.test(name);
}
export function artifactManifest(directory) {
  const files = walk(directory).filter(name => name !== 'release-manifest.json').sort();
  if (!files.includes('dist/index.html') || !files.includes('server/server.js') || !files.includes('server/package-lock.json')) throw new Error('发布包缺少必要文件');
  if (files.some(name => !allowedArtifact(name))) throw new Error('发布包含数据或未允许的文件');
  return files.map(name => ({ name, sha256: digest(fs.readFileSync(path.join(directory, name))) }));
}
export async function backupData(source, destination) {
  fs.mkdirSync(destination, { mode: 0o700 });
  const files = walk(source).filter(name => name !== 'release-backup-manifest.json');
  const databases = files.filter(name => /\.(?:db|sqlite|sqlite3)$/.test(name));
  for (const name of files) {
    if (/-wal$|-shm$|-journal$/.test(name)) continue;
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    if (databases.includes(name)) {
      const db = new DatabaseSync(path.join(source, name), { readOnly: true });
      try { await backup(db, target); } finally { db.close(); }
      const check = new DatabaseSync(target);
      try {
        check.exec('PRAGMA journal_mode=DELETE');
        if (check.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('备份数据库校验失败');
      } finally { check.close(); }
      fs.chmodSync(target, 0o600);
    } else fs.copyFileSync(path.join(source, name), target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o600);
  }
  privateJson(path.join(destination, 'release-backup-manifest.json'), { files, databases });
  return databases;
}

// Preserve the existing server/TLS/root directives; reject ambiguous API locations.
export function nginxConfig(original, marker, expectedRoot = '/var/www/teao-platform') {
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(marker)) throw new Error('维护标记路径不安全');
  if (!/^\/[a-zA-Z0-9/_.-]+$/.test(expectedRoot)) throw new Error('站点路径不安全');
  const uncommented = original.replace(/#[^\n]*/g, '');
  if ([...uncommented.matchAll(/(?:^|[;{}\n])\s*server\s*\{/g)].length !== 1) throw new Error('目标nginx文件必须仅包含当前站点一个server块，禁止修改其他域名');
  const roots = [...uncommented.matchAll(/\broot\s+([^;]+);/g)];
  if (roots.length !== 1 || roots[0][1].trim() !== expectedRoot) throw new Error('nginx root 未唯一匹配当前站点，拒绝危险布局');
  if (/\b(?:alias|include)\s/.test(uncommented)) throw new Error('目标server含alias/include，需先由运维审核展开，避免绕过静态保护');
  if (/location\s+(?:=|\^~)\s+\/(?!api\/|server(?:\/|\s)|data(?:\/|\s))/.test(uncommented)) throw new Error('存在可能绕过点文件保护的优先location，需人工审核');
  const config = original.replace(/# teao-release-maintenance\n[ \t]*if \([^\n]+\) \{ return 503; \}\n[ \t]*/g, '')
    .replace(/# teao-release-protection-begin[\s\S]*?# teao-release-protection-end\n[ \t]*/g, '');
  if (/location\s+~/.test(config.replace(/#[^\n]*/g, ''))) throw new Error('已有正则location可能先于点文件保护生效，需运维人工审核');
  const locations = [...config.matchAll(/location\s+(?:\^~\s+)?\/api\/\s*\{/g)];
  if (locations.length !== 1) throw new Error('需要且只允许一个明确的 location /api/');
  const start = locations[0].index;
  let end = start + locations[0][0].length, depth = 1;
  while (end < config.length && depth) { if (config[end] === '{') depth++; if (config[end] === '}') depth--; end++; }
  if (depth) throw new Error('nginx API location 未闭合');
  const proxy = `# teao-release-maintenance\n    if (-f ${marker}) { return 503; }\n    # teao-release-protection-begin\n    location = /server { deny all; }\n    location ^~ /server/ { deny all; }\n    location = /data { deny all; }\n    location ^~ /data/ { deny all; }\n    location ~ /\\.(?!well-known(?:/|$)) { deny all; }\n    # teao-release-protection-end\n    location /api/ {\n        client_max_body_size 20m;\n        proxy_pass http://127.0.0.1:3899;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $remote_addr;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_connect_timeout 30s;\n        proxy_read_timeout 600s;\n        proxy_send_timeout 600s;\n    }`;
  return config.slice(0, start) + proxy + config.slice(end);
}
