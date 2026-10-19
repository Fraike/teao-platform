import { randomUUID } from "node:crypto";
import { buildStandardPublicationMessages } from "./standard-publication.js";
import { sendWecomText, sendWecomMessage } from "./wecom.js";
import { withPublicationQueue } from "./standard-notification-queue.js";
import { isReleaseMaintenance } from "./release-maintenance.js";

export function initPublicationOutbox(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS standard_publication_outbox (
    id TEXT PRIMARY KEY,standard_id TEXT NOT NULL,version_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',next_part INTEGER NOT NULL DEFAULT 0,total_parts INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_retry_by TEXT NOT NULL DEFAULT ''
  ); CREATE INDEX IF NOT EXISTS idx_publication_outbox_status ON standard_publication_outbox(status,created_at)`);
}

export function enqueueStandardPublication(d, standard, version, category, options = {}) {
  initPublicationOutbox(d);
  const messages = buildStandardPublicationMessages(standard, version, category, options);
  const now = new Date().toISOString(), id = randomUUID();
  return d.transaction(() => {
    const existing = d.prepare("SELECT id FROM standard_publication_outbox WHERE version_id=?").get(version.id);
    if (existing) return existing.id;
    // Do not publish an outdated queued standard after a newer version becomes effective.
    cancelStandardPublications(d, standard.id || standard.serialNo);
    d.prepare(`INSERT INTO standard_publication_outbox(id,standard_id,version_id,payload,total_parts,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(id, standard.id || standard.serialNo, version.id, JSON.stringify(messages), messages.length, now, now);
    return id;
  })();
}

export function cancelStandardPublications(d, standardId) {
  d.prepare(`UPDATE standard_publication_outbox SET status='superseded',revision=revision+1,updated_at=?
    WHERE standard_id=? AND status IN ('queued','sending','failed','unknown','not_configured')`)
    .run(new Date().toISOString(), standardId);
}

function isCurrentPublication(d, row) {
  if (!d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_standard_versions'").get()) return true;
  return Boolean(d.prepare("SELECT 1 FROM product_standard_versions WHERE id=? AND standard_id=? AND status='published'").get(row.version_id, row.standard_id));
}

function summary(row) {
  if (!row) return { status: "not_recorded", sentParts: 0, totalParts: 0 };
  return { id: row.id, versionId: row.version_id, status: row.status, sentParts: row.next_part,
    totalParts: row.total_parts, revision: row.revision, updatedAt: row.updated_at };
}

export function publicationDelivery(d, standardId, versionId) {
  initPublicationOutbox(d);
  return summary(d.prepare("SELECT * FROM standard_publication_outbox WHERE standard_id=? AND version_id=?").get(standardId, versionId));
}

export async function publicationResponse(d, id, options) {
  let timer;
  try {
    return await Promise.race([
      deliverStandardPublication(d, id, options),
      new Promise(resolve => { timer = setTimeout(() => resolve(summary(d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id))), 2500); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function recoverInterruptedPublications(d, now = Date.now()) {
  initPublicationOutbox(d);
  // A message may have reached WeCom before the process stopped: never automatically retry it.
  d.prepare(`UPDATE standard_publication_outbox SET status='unknown',revision=revision+1,updated_at=?
    WHERE status='sending' AND updated_at<?`).run(new Date(now).toISOString(), new Date(now - 120000).toISOString());
}

export async function deliverStandardPublication(d, id, { webhook, sendText = sendWecomText, sendMarkdown = sendWecomMessage } = {}) {
  initPublicationOutbox(d);
  if (!webhook) {
    d.prepare("UPDATE standard_publication_outbox SET status='not_configured',revision=revision+1,updated_at=? WHERE id=? AND status='queued'")
      .run(new Date().toISOString(), id);
    return summary(d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id));
  }
  return withPublicationQueue(webhook, async () => {
    const candidate = d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id);
    if (candidate?.status === "queued" && !isCurrentPublication(d, candidate)) {
      d.prepare("UPDATE standard_publication_outbox SET status='superseded',revision=revision+1,updated_at=? WHERE id=?")
        .run(new Date().toISOString(), id);
      return summary(d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id));
    }
    const claimed = d.prepare(`UPDATE standard_publication_outbox SET status='sending',attempts=attempts+1,
      revision=revision+1,updated_at=? WHERE id=? AND status='queued'`).run(new Date().toISOString(), id).changes;
    let row = d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id);
    if (!claimed) return summary(row);
    const messages = JSON.parse(row.payload);
    try {
      for (let index = row.next_part; index < messages.length; index++) {
        const active = d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id);
        // An in-flight HTTP request cannot be recalled; cancellation stops all subsequent parts.
        if (active.status !== "sending" || !isCurrentPublication(d, active)) {
          if (active.status === "sending") cancelStandardPublications(d, active.standard_id);
          return summary(d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id));
        }
        const message = messages[index];
        const options = { shouldSend: () => {
          const latest = d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id);
          return latest.status === "sending" && isCurrentPublication(d, latest);
        } };
        if (message.type === "text") await sendText(webhook, message.content, message.mentions || [], options);
        else await sendMarkdown(webhook, message.content, options);
        d.prepare("UPDATE standard_publication_outbox SET next_part=?,updated_at=?,revision=revision+1 WHERE id=?")
          .run(index + 1, new Date().toISOString(), id);
      }
      d.prepare("UPDATE standard_publication_outbox SET status='sent',revision=revision+1,updated_at=? WHERE id=? AND status='sending'")
        .run(new Date().toISOString(), id);
    } catch (error) {
      if (error.code === "SEND_CANCELLED") {
        const latest = d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id);
        if (latest.status === "sending") cancelStandardPublications(d, latest.standard_id);
        return summary(d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id));
      }
      d.prepare("UPDATE standard_publication_outbox SET status=?,revision=revision+1,updated_at=? WHERE id=? AND status='sending'")
        .run(error.code === "SEND_REJECTED" ? "failed" : "unknown", new Date().toISOString(), id);
      console.error(`[standard-publication] delivery ${error.code || "UNKNOWN"}; outbox=${id}`);
    }
    row = d.prepare("SELECT * FROM standard_publication_outbox WHERE id=?").get(id);
    return summary(row);
  });
}

export function retryStandardPublication(d, standardId, versionId, expectedRevision, acknowledgeUncertain, user) {
  if (user.role !== "admin") throw Object.assign(new Error("仅管理员可以补发群公告"), { status: 403 });
  if (!Number.isInteger(expectedRevision)) throw Object.assign(new Error("公告修订号无效"), { status: 400 });
  const row = d.prepare("SELECT * FROM standard_publication_outbox WHERE standard_id=? AND version_id=?").get(standardId, versionId);
  if (!row) throw Object.assign(new Error("没有可补发的公告记录"), { status: 404 });
  if (row.status === "unknown" && acknowledgeUncertain !== true) throw Object.assign(new Error("请先核查群记录并确认继续发送未确认部分"), { status: 400 });
  const changed = d.prepare(`UPDATE standard_publication_outbox SET status='queued',revision=revision+1,updated_at=?,last_retry_by=?
    WHERE id=? AND revision=? AND status IN ('failed','unknown','not_configured')`)
    .run(new Date().toISOString(), user.id, row.id, expectedRevision).changes;
  if (!changed) throw Object.assign(new Error("公告状态已变化，请刷新；发送中或已成功的公告不能重复发送"), { status: 409 });
  return row.id;
}

export function createPublicationWorker(d, readConfig) {
  let task, running = false;
  async function tick() {
    if (running || isReleaseMaintenance()) return;
    running = true;
    try {
      recoverInterruptedPublications(d);
      const webhook = readConfig().wecomWebhook;
      if (!webhook) return;
      const rows = d.prepare("SELECT id FROM standard_publication_outbox WHERE status='queued' ORDER BY created_at,id LIMIT 20").all();
      for (const row of rows) await deliverStandardPublication(d, row.id, { webhook });
    } catch (error) { console.error(`[standard-publication] worker ${error.code || "FAILED"}`); }
    finally { running = false; }
  }
  return { tick, start(cron) { if (!task) { task = cron.schedule("* * * * *", tick, { timezone: "Asia/Shanghai" }); void tick(); } }, stop() { task?.stop(); task = null; } };
}
