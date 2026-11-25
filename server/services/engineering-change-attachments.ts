import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ChangeAttachment, EngineeringChange } from '../../src/types/engineeringChange.ts';
import { fail, field, obj } from './engineering-change-rules.ts';

const maxFiles = 6;
const maxBytes = 8 * 1024 * 1024;
const formats: Record<string, (bytes: Buffer) => boolean> = {
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/jpeg': bytes => bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
  'image/webp': bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': bytes => bytes.toString('ascii', 0, 5) === '%PDF-',
};

export function createChangeAttachmentStore(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engineering_change_attachments (
      id TEXT PRIMARY KEY, changeId TEXT NOT NULL, bytes BLOB NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO engineering_change_attachments VALUES (?, ?, ?)');
  const read = db.prepare('SELECT bytes FROM engineering_change_attachments WHERE changeId=? AND id=?');

  function storeFile(changeId: string, item: unknown, remaining: number, photoOnly = false): ChangeAttachment {
    const file = obj(item);
    const name = field(file.name, '文件名', 180);
    if (/[\r\n\0/\\]/.test(name) || /[\uD800-\uDFFF]/u.test(name)) fail(400, '文件名无效');
    const mime = field(file.mime, '文件类型', 60);
    const check = Object.hasOwn(formats, mime) ? formats[mime] : undefined;
    if (!check || (photoOnly && !mime.startsWith('image/')) || typeof file.base64 !== 'string' ||
      file.base64.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) {
      fail(400, photoOnly ? '请上传 JPG、PNG 或 WebP 报废照片' : '请上传 JPG、PNG、WebP 或 PDF 文件');
    }
    const bytes = Buffer.from(file.base64, 'base64');
    if (!check(bytes)) fail(400, '附件内容与文件类型不符');
    if (bytes.length > remaining) fail(400, photoOnly ? '报废照片不能超过 8 MB' : '附件合计不能超过 8 MB');
    const id = randomUUID();
    insert.run(id, changeId, bytes);
    return { id, name, mime, size: bytes.length };
  }

  function update(change: EngineeringChange, body: Record<string, unknown>) {
    const current = change.draft.attachments ?? [];
    const retained = body.attachmentIds === undefined ? current : selectRetained(current, body.attachmentIds);
    const uploads = body.uploads ?? [];
    if (!Array.isArray(uploads) || uploads.length + retained.length > maxFiles) fail(400, '附件最多 6 个');
    let remaining = maxBytes - retained.reduce((sum, file) => sum + file.size, 0);
    const added = uploads.map(item => {
      const file = storeFile(change.id, item, remaining);
      remaining -= file.size;
      return file;
    });
    const protectedIds = new Set([...retained, ...change.rounds.flatMap(round => round.draft.attachments ?? [])].map(file => file.id));
    for (const file of current) {
      if (!protectedIds.has(file.id)) db.prepare('DELETE FROM engineering_change_attachments WHERE changeId=? AND id=?').run(change.id, file.id);
    }
    return [...retained, ...added];
  }

  function content(change: EngineeringChange, id: string) {
    const files = [change.scrapVerificationPhoto, change.kingdeeScrapEvidence,
      ...change.records.flatMap(record => [record.verificationPhoto, record.kingdeeScrapEvidence]),
      ...(change.draft.attachments ?? []), ...change.rounds.flatMap(round => round.draft.attachments ?? [])];
    const file = files.find(item => item?.id === id);
    if (!file) fail(404, '附件不存在');
    const result = read.get(change.id, id) as { bytes: Buffer } | undefined;
    if (!result) fail(404, '附件不存在');
    return { file, bytes: result.bytes };
  }

  return {
    update, content,
    verificationPhoto: (id: string, upload: unknown) => {
      if (!upload) fail(400, '请上传一张报废现场照片后确认');
      return storeFile(id, upload, maxBytes, true);
    },
    kingdeeScrapEvidence: (id: string, upload: unknown) => {
      if (!upload) fail(400, '请上传金蝶报废记录后确认');
      return storeFile(id, upload, maxBytes);
    },
  };
}

function selectRetained(files: ChangeAttachment[], ids: unknown) {
  if (!Array.isArray(ids) || ids.length > maxFiles || new Set(ids).size !== ids.length) fail(400, '附件选择无效');
  return ids.map(id => files.find(file => file.id === id) ?? fail(400, '附件选择无效'));
}
