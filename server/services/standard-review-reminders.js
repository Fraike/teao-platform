import { getDB } from "./standard-store.js";
import { listUsers } from "./users.js";
import { readConfig, formatShanghaiDate, isRestDay } from "../config.js";
import { sendWecomText } from "./wecom.js";
import { splitStandardPublication } from "./standard-publication.js";
import { withPublicationQueue } from "./standard-notify.js";
import { isReleaseMaintenance } from "./release-maintenance.js";
import { initializeReminderSchema } from "./standard-reminder-schema.js";

export const REVIEW_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MANUAL_REMINDER_COOLDOWN_MS = 5 * 60 * 1000;

function reminderDay(at, configuration) {
  const local = new Date(at + 8 * 60 * 60 * 1000);
  const date = formatShanghaiDate(new Date(at));
  return local.getUTCHours() === 8 && local.getUTCMinutes() === 0 && !isRestDay(date, configuration) ? date : null;
}

function nextReminderAt(at, configuration) {
  let candidate = Date.parse(`${formatShanghaiDate(new Date(at))}T08:00:00+08:00`);
  for (let index = 0; index < 370; index++, candidate += REVIEW_REMINDER_INTERVAL_MS) {
    if (candidate > at && !isRestDay(formatShanghaiDate(new Date(candidate)), configuration)) return new Date(candidate).toISOString();
  }
  return undefined;
}

function automaticWindow(now, config, day, webhook) {
  const at = now(), configuration = config();
  const local = new Date(at + 8 * 60 * 60 * 1000);
  return formatShanghaiDate(new Date(at)) === day && local.getUTCHours() === 8
    && !isRestDay(day, configuration) && configuration.wecomWebhook === webhook ? at : null;
}

const pendingCondition = `v.status='pending_review' AND v.assigned_reviewer_id<>''
  AND v.assigned_reviewer_id<>COALESCE(v.submitted_by_id,'')
  AND NOT EXISTS (SELECT 1 FROM product_standard_versions newer
    WHERE newer.standard_id=v.standard_id AND newer.version_no>v.version_no)`;

function dueItems(d, now, activeIds) {
  return d.prepare(`SELECT v.id,v.standard_id,v.submitted_at,v.assigned_reviewer_id,
    v.submitted_by_id,v.submitted_by,v.customer,v.model,s.serial_no
    FROM product_standard_versions v JOIN product_standards s ON s.id=v.standard_id
    WHERE ${pendingCondition}
    AND v.assigned_reviewer_id IN (SELECT value FROM json_each(@activeIds))
    AND v.submitted_at<>'' AND v.submitted_at<=@at
    AND NOT EXISTS (SELECT 1 FROM standard_review_daily_reminders daily WHERE daily.reviewer_id=v.assigned_reviewer_id AND daily.reminder_date=@day)
    ORDER BY v.submitted_at,v.id`).all({ activeIds: JSON.stringify(activeIds),
      at: new Date(now).toISOString(), day: formatShanghaiDate(new Date(now)) });
}

function claimItems(d, items, now, dailyReviewer) {
  return d.transaction(() => {
    if (dailyReviewer) {
      const day = formatShanghaiDate(new Date(now));
      const claimed = d.prepare('INSERT OR IGNORE INTO standard_review_daily_reminders(reviewer_id,reminder_date,attempted_at) VALUES(?,?,?)').run(dailyReviewer, day, now);
      if (!claimed.changes) return [];
    }
    return items.filter(item => {
      // Check again inside the write transaction: review/resubmission may have happened while queued.
      const current = d.prepare(`SELECT v.id FROM product_standard_versions v WHERE v.id=?
        AND v.submitted_at=? AND v.assigned_reviewer_id=? AND ${pendingCondition}`)
        .get(item.id, item.submitted_at, item.assigned_reviewer_id);
      if (!current) return false;
      return d.prepare(`INSERT INTO standard_review_reminders(version_id,submitted_at,last_attempt_at,status)
        VALUES (?,?,?,'sending') ON CONFLICT(version_id,submitted_at) DO UPDATE SET
        last_attempt_at=excluded.last_attempt_at,status='sending'
        WHERE standard_review_reminders.last_attempt_at<=?`)
        .run(item.id, item.submitted_at, now, dailyReviewer ? now : now - MANUAL_REMINDER_COOLDOWN_MS).changes > 0;
    });
  })();
}

function text(value) {
  return [...String(value || "—").replace(/[\r\n]/g, " ")].slice(0, 100).join("");
}

async function sendGroup(d, webhook, reviewer, items, at, send, prepareManual, automaticAt) {
  return withPublicationQueue(webhook, async () => {
    const prepared = prepareManual?.();
    const checkedAt = automaticAt?.();
    if (automaticAt && checkedAt === null) return;
    const now = prepared?.now ?? checkedAt ?? at;
    if (prepared) { items = [prepared.item]; reviewer = prepared.reviewer; }
    const claimed = claimItems(d, items, now, prepared ? null : reviewer.id);
    if (!claimed.length) {
      if (!prepared) return;
      const previous = d.prepare("SELECT last_attempt_at FROM standard_review_reminders WHERE version_id=? AND submitted_at=?").get(items[0].id, items[0].submitted_at);
      return { status: "cooldown", retryAt: new Date(previous.last_attempt_at + MANUAL_REMINDER_COOLDOWN_MS).toISOString() };
    }
    const header = `【产品标准待审核提醒】审核人：${text(reviewer.name || reviewer.username)}，当前有 ${claimed.length} 条标准待处理：\n`;
    const lines = claimed.map(item => `${text(item.serial_no)} · ${text(item.customer)} · ${text(item.model)}`);
    const content = `${header}${lines.join("\n")}\n请进入产品标准页面，筛选“待审核”，点击“审核”核对并处理。未处理的标准在工作日早上8点提醒，每天一次。`;
    const prefixSize = Buffer.byteLength(`【待审提醒 ${text(reviewer.name || reviewer.username)} 999999/999999】\n`, "utf8");
    const parts = splitStandardPublication(content, Math.min(1800, 2048 - prefixSize));
    let status = "sent";
    let sentParts = 0;
    try {
      for (const [index, part] of parts.entries()) {
        await send(webhook, `【待审提醒 ${text(reviewer.name || reviewer.username)} ${index + 1}/${parts.length}】\n${part}`,
          index === 0 && reviewer.wecomUserid ? [reviewer.wecomUserid] : [],
          automaticAt ? { shouldSend: () => automaticAt() !== null } : undefined);
        sentParts++;
      }
    } catch (error) {
      status = error.code === "SEND_REJECTED" ? "failed" : error.code === "SEND_CANCELLED" ? "cancelled" : "unknown";
      console.error(`[standards-reminder] ${status}; reviewer=${reviewer.id}; count=${claimed.length}`);
    }
    d.transaction(() => {
      for (const item of claimed) d.prepare(`UPDATE standard_review_reminders SET status=?,
        last_sent_at=CASE WHEN ?='sent' THEN ? ELSE last_sent_at END
        WHERE version_id=? AND submitted_at=? AND last_attempt_at=?`)
        .run(status, status, now, item.id, item.submitted_at, now);
    })();
    return { status, sentParts, totalParts: parts.length, mentionedReviewer: status === "sent" && Boolean(reviewer.wecomUserid),
      retryAt: new Date(now + MANUAL_REMINDER_COOLDOWN_MS).toISOString() };
  });
}

function manualItem(d, id, user, expected) {
  const item = d.prepare(`SELECT v.id,v.version_no,v.status,v.standard_id,v.submitted_at,v.assigned_reviewer_id,
    v.submitted_by_id,v.submitted_by,v.customer,v.model,s.serial_no
    FROM product_standard_versions v JOIN product_standards s ON s.id=v.standard_id
    WHERE s.id=? ORDER BY v.version_no DESC LIMIT 1`).get(id);
  if (!item) throw Object.assign(new Error("标准不存在"), { status: 404 });
  if (user?.role !== "admin" && (!user?.id || item.submitted_by_id !== user.id)) {
    throw Object.assign(new Error("仅提交人和管理员可以催促审核"), { status: 403 });
  }
  if (!Number.isInteger(expected?.versionNo)) throw Object.assign(new Error("缺少标准版本号，请刷新后重试"), { status: 400 });
  if (item.status !== "pending_review" || item.version_no !== expected.versionNo) {
    throw Object.assign(new Error("标准状态或版本已变化，请刷新后查看"), { status: 409 });
  }
  return item;
}

export function createStandardReviewReminders({ now = Date.now, users = listUsers, config = readConfig, send = sendWecomText } = {}) {
  const d = getDB();
  initializeReminderSchema(d);
  let running = false;
  let task = null;
  async function tick() {
    if (running || isReleaseMaintenance()) return;
    running = true;
    try {
      const configuration = config();
      const webhook = configuration.wecomWebhook;
      if (!webhook) return;
      const at = now();
      const day = reminderDay(at, configuration);
      if (!day) return;
      const activeUsers = new Map(users().filter(user => user.status === "active").map(user => [user.id, user]));
      const grouped = new Map();
      for (const item of dueItems(d, at, [...activeUsers.keys()])) {
        if (!activeUsers.has(item.assigned_reviewer_id)) continue;
        if (!item.submitted_by_id && item.submitted_by === activeUsers.get(item.assigned_reviewer_id).name) continue;
        const group = grouped.get(item.assigned_reviewer_id) || [];
        group.push(item);
        grouped.set(item.assigned_reviewer_id, group);
      }
      const automaticAt = () => automaticWindow(now, config, day, webhook);
      for (const [id, items] of grouped) await sendGroup(d, webhook, activeUsers.get(id), items, at, send, undefined, automaticAt);
    } finally { running = false; }
  }
  const safelyTick = () => tick().catch(error => console.error(`[standards-reminder] ${error.code || "CHECK_FAILED"}`));
  return {
    tick,
    async remind(id, user, expected) {
      const prepare = () => {
        const item = manualItem(d, id, user, expected);
        const reviewer = users().find(candidate => candidate.id === item.assigned_reviewer_id && candidate.status === "active");
        if (!reviewer || reviewer.id === item.submitted_by_id || (!item.submitted_by_id && reviewer.name === item.submitted_by)) {
          throw Object.assign(new Error("指定审核人无效，请联系管理员处理"), { status: 409 });
        }
        return { item, reviewer, now: now() };
      };
      const { item, reviewer, now: at } = prepare();
      const configuration = config();
      const webhook = configuration.wecomWebhook;
      if (!webhook) return { status: "not_configured" };
      const result = await sendGroup(d, webhook, reviewer, [item], at, send, prepare);
      return { ...result, nextReminderAt: nextReminderAt(now(), configuration) };
    },
    start(cron) {
      if (task) return;
      task = cron.schedule("0 8 * * *", safelyTick, { timezone: "Asia/Shanghai" });
    },
    stop() { task?.stop(); task = null; },
  };
}
