import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedArtifact, artifactManifest, privateJson } from './release-common.js';

export function packageRelease(root, output) {
  if (fs.existsSync(output)) throw new Error('输出目录已存在，拒绝覆盖');
  const sourceFiles = ['dist', 'server'].flatMap(prefix => packageFiles(path.join(root, prefix)).map(name => path.join(prefix, name)));
  if (sourceFiles.some(name => name.startsWith('dist' + path.sep) && /\.(?:xlsx?|xlsm|xlsb|csv|tsv)$/i.test(name))) {
    throw new Error('静态目录含原始表格，须先移入私有存储并重新构建');
  }
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const relative of sourceFiles) {
    if (!allowedArtifact(relative)) continue;
    const destination = path.join(output, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination, fs.constants.COPYFILE_EXCL);
  }
  const manifest = artifactManifest(output);
  privateJson(path.join(output, 'release-manifest.json'), manifest);
  return { files: manifest.length };
}
function packageFiles(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules', 'trash_review', 'private', 'backups'].includes(entry.name)) return [];
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('包源文件不接受符号链接');
    if (entry.isDirectory()) return entry.name === 'data' && relative ? [] : packageFiles(root, name);
    return entry.isFile() ? [name] : [];
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , root, output] = process.argv;
  if (!root || !output) throw new Error('usage: node release-package.js REPO NEW_OUTPUT');
  console.log(JSON.stringify(packageRelease(path.resolve(root), path.resolve(output))));
}
