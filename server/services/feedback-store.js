import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

let db;
const columns = `f.id,f.category,f.description,f.page_path AS pagePath,f.page_title AS pageTitle,
  f.created_by AS createdBy,f.created_by_id AS createdById,f.created_at AS createdAt,
  f.status,f.reply,f.handled_by AS handledBy,f.updated_at AS updatedAt,f.revision,
  (SELECT COUNT(*) FROM feedback_images i WHERE i.feedback_id=f.id) AS screenshotCount`;
const fail = (status, message) => Object.assign(new Error(message), { status });

function database() {
  if (db) return db;
  const directory = process.env.DATA_DIR || fileURLToPath(new URL("../../data", import.meta.url));
  fs.mkdirSync(directory, { recursive: true });
  db = new Database(path.join(directory, "feedback.db"));
  db.pragma("journal_mode=WAL"); db.pragma("foreign_keys=ON");
  db.exec(`CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,category TEXT NOT NULL,description TEXT NOT NULL,page_path TEXT NOT NULL,page_title TEXT NOT NULL,
    created_by_id TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',reply TEXT NOT NULL DEFAULT '',handled_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_owner ON feedback(created_by_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status,created_at DESC);
  CREATE TABLE IF NOT EXISTS feedback_images (
    id TEXT PRIMARY KEY,feedback_id TEXT NOT NULL REFERENCES feedback(id),name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_images ON feedback_images(feedback_id);`);
  return db;
}

export function closeFeedbackDB() { db?.close(); db = undefined; }

function text(value, maximum, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) throw fail(400, "反馈内容格式或长度无效");
  return value.trim();
}

function screenshot(input) {
  const name = text(input?.name, 100, true);
  if (typeof input?.dataUrl !== "string" || input.dataUrl.length > 2800000) throw fail(400, "截图最多2MB");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.dataUrl);
  if (!match) throw fail(400, "截图仅支持 PNG、JPEG、WebP");
  const content = Buffer.from(match[2], "base64");
  if (content.length > 2 * 1024 * 1024 || content.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) throw fail(400, "截图大小或编码无效");
  const valid = match[1] === "image/png" ? content.length >= 24 && content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && content.toString("ascii", 12, 16) === "IHDR"
    : match[1] === "image/jpeg" ? content.length >= 4 && content[0] === 255 && content[1] === 216 && content[2] === 255
    : content.length >= 12 && content.toString("ascii", 0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw fail(400, "截图文件与图片格式不符");
  return { name, mime: match[1], content };
}

export function createFeedback(input, user) {
  if (!["data", "display", "suggestion", "other"].includes(input?.category)) throw fail(400, "请选择反馈类型");
  const description = text(input.description, 2000, true);
  const pagePath = text(input.pagePath, 500).split(/[?#]/)[0];
  if (pagePath && (!pagePath.startsWith("/") || pagePath.startsWith("//") || /[\r\n]/.test(pagePath))) throw fail(400, "页面路径无效");
  const pageTitle = text(input.pageTitle, 100);
  const screenshots = input.screenshots ?? [];
  if (!Array.isArray(screenshots) || screenshots.length > 3) throw fail(400, "最多上传3张截图");
  const images = screenshots.map(screenshot), d = database(), id = randomUUID(), now = new Date().toISOString();
  d.transaction(() => {
    const count = d.prepare("SELECT COUNT(*) AS total FROM feedback WHERE created_by_id=? AND created_at>=?")
      .get(user.id, new Date(Date.now() - 60000).toISOString()).total;
    if (count >= 5) throw fail(429, "提交较频繁，请一分钟后再试");
    d.prepare(`INSERT INTO feedback(id,category,description,page_path,page_title,created_by_id,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, input.category, description, pagePath, pageTitle, user.id, user.name || user.username, now, now);
    const insert = d.prepare("INSERT INTO feedback_images(id,feedback_id,name,mime,content) VALUES (?,?,?,?,?)");
    for (const image of images) insert.run(randomUUID(), id, image.name, image.mime, image.content);
  })();
  return d.prepare(`SELECT ${columns} FROM feedback f WHERE f.id=?`).get(id);
}

export function getFeedback(id, user) {
  const d = database();
  const row = d.prepare(`SELECT ${columns} FROM feedback f WHERE f.id=? AND (?='admin' OR f.created_by_id=?)`).get(id, user.role, user.id);
  if (!row) throw fail(404, "反馈不存在或无权查看");
  const screenshots = d.prepare("SELECT id,name,mime,content FROM feedback_images WHERE feedback_id=? ORDER BY rowid").all(id)
    .map(image => ({ id: image.id, name: image.name, dataUrl: `data:${image.mime};base64,${image.content.toString("base64")}` }));
  return { ...row, screenshots };
}

export function listFeedback(query, user) {
  const all = query.scope === "all";
  if (all && user.role !== "admin") throw fail(403, "仅管理员可查看全部反馈");
  if (query.scope && !["all", "mine"].includes(query.scope)) throw fail(400, "查询范围无效");
  const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 10), status = query.status || "all";
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw fail(400, "分页参数无效");
  if (!["all", "pending", "processing", "resolved"].includes(status)) throw fail(400, "处理状态无效");
  const where = "WHERE (@all=1 OR f.created_by_id=@owner) AND (@status='all' OR f.status=@status)";
  const params = { all: Number(all), owner: user.id, status }, d = database();
  const total = d.prepare(`SELECT COUNT(*) AS total FROM feedback f ${where}`).get(params).total;
  const data = d.prepare(`SELECT ${columns} FROM feedback f ${where} ORDER BY f.created_at DESC,f.id LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
  return { data, total, page, pageSize };
}

export function updateFeedback(id, input, user) {
  if (user.role !== "admin") throw fail(403, "仅管理员可处理反馈");
  if (!["pending", "processing", "resolved"].includes(input?.status) || !Number.isInteger(input.revision)) throw fail(400, "处理状态或修订号无效");
  const reply = text(input.reply, 2000), d = database();
  const result = d.prepare(`UPDATE feedback SET status=?,reply=?,handled_by=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`)
    .run(input.status, reply, user.name || user.username, new Date().toISOString(), id, input.revision);
  if (!result.changes) throw fail(409, "反馈已被更新或不存在，请刷新后重试");
  return getFeedback(id, user);
}
