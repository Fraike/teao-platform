import { canAccessEngineeringChanges, changeCcRecipients, hasDraftContent, hasExecutedScrap } from '../shared/engineering-change-content.ts';
import { createChangeAttachmentStore } from './engineering-change-attachments.ts';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ChangeAction, ChangeConfig, ChangeDelivery, ChangeListItem, ChangeReminderTarget, ChangeSummary, ChangeTask, EngineeringChange } from '../../src/types/engineeringChange.ts';
import { applyAction, readConfig } from './engineering-change-actions.ts';
import type { LookupUser } from './engineering-change-actions.ts';
import { actions, assigned, canSubmit, fail, field, obj, readDraft, reassignableTasks, tasks } from './engineering-change-rules.ts';
import type { Actor } from './engineering-change-rules.ts';

interface ChangeMessage {
  key: string;
  changeId: string;
  userId: string;
  task: string;
  generation: string;
  event: string;
  content: string;
}

export function changeLink(id: string) {
  return `/engineering-changes?changeId=${encodeURIComponent(id)}`;
}

const contentColumns = ['title', 'content', 'reason', 'before', 'after', 'effective', 'references'];
const visibleChange = `(json_extract(c.body,'$.status') <> 'draft'
  OR json_extract(c.body,'$.assignment') IS NOT NULL
  OR json_extract(c.body,'$.submittedAt') IS NOT NULL
  OR coalesce(json_array_length(c.body,'$.draft.attachments'), 0) > 0
  OR ${contentColumns.map(key => `coalesce(trim(json_extract(c.body,'$.draft.${key}')), '') <> ''`).join(' OR ')})`;

export function createEngineeringChangeStore(db: Database.Database, lookup: LookupUser,
  effectiveConfig: (config: ChangeConfig | null) => ChangeConfig | null = config => config,
  routesManaged = () => false) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engineering_changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS engineering_changes_creator_status ON engineering_changes(
      json_extract(body,'$.creator'), json_extract(body,'$.status')
    );
    CREATE TABLE IF NOT EXISTS engineering_change_people (
      changeId TEXT NOT NULL, userId TEXT NOT NULL, PRIMARY KEY(changeId, userId)
    );
    CREATE INDEX IF NOT EXISTS engineering_change_people_user ON engineering_change_people(userId, changeId);
    CREATE TABLE IF NOT EXISTS engineering_change_tasks (
      changeId TEXT NOT NULL, task TEXT NOT NULL, userId TEXT NOT NULL, generation TEXT NOT NULL,
      title TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(changeId, task)
    );
    CREATE INDEX IF NOT EXISTS engineering_change_tasks_user ON engineering_change_tasks(userId, at);
    CREATE TABLE IF NOT EXISTS engineering_change_config (
      id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS engineering_change_messages (
      key TEXT PRIMARY KEY, changeId TEXT NOT NULL, userId TEXT NOT NULL, task TEXT NOT NULL,
      generation TEXT NOT NULL, event TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS engineering_change_messages_status ON engineering_change_messages(status, at);
    CREATE INDEX IF NOT EXISTS engineering_change_messages_change ON engineering_change_messages(changeId, at);
  `);

  const attachments = createChangeAttachmentStore(db);

  function load(id: string) {
    const row = db.prepare('SELECT body FROM engineering_changes WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as EngineeringChange : null;
  }

  function get(actor: Actor, id: string) {
    const change = load(id);
    if (!change || (actor.role !== 'admin' && !assigned(change, actor.id))) fail(404, '工程变更不存在');
    return change;
  }

  function config() {
    const row = db.prepare('SELECT body FROM engineering_change_config WHERE id=1').get() as { body: string } | undefined;
    return row ? JSON.parse(row.body) as ChangeConfig : null;
  }

  const routingConfig = () => effectiveConfig(config());

  function configure(actor: Actor, input: unknown) {
    if (actor.role !== 'admin') fail(403, '仅管理员可配置处理人');
    const next = readConfig(input, lookup, routesManaged() ? config()?.departments ?? [] : undefined);
    db.prepare('INSERT OR REPLACE INTO engineering_change_config(id, body) VALUES(1, ?)').run(JSON.stringify(next));
    return next;
  }

  function save(change: EngineeringChange) {
    db.prepare('UPDATE engineering_changes SET body=?, updatedAt=? WHERE id=?').run(JSON.stringify(change), change.updatedAt, change.id);
    const people = new Set([change.creator, change.assignment?.pmc, change.assignment?.warehouse, ...changeCcRecipients(change).map(row => row.userId),
      ...change.rounds.flatMap(round => round.reviewers.map(row => row.userId)), ...change.history.map(row => row.actor)]);
    db.prepare('DELETE FROM engineering_change_people WHERE changeId=?').run(change.id);
    for (const id of people) {
      if (id && assigned(change, id)) db.prepare('INSERT INTO engineering_change_people VALUES(?, ?)').run(change.id, id);
    }
  }

  function openDraft(actor: Actor) {
    if (!canSubmit(actor)) fail(403, '仅有工程提交权限的人员可发起');
    const row = db.prepare(`SELECT c.id, json_extract(c.body,'$.number') AS number, json_extract(c.body,'$.title') AS title
      FROM engineering_changes c WHERE json_extract(c.body,'$.creator')=? AND json_extract(c.body,'$.status')='draft'
        AND ${visibleChange} ORDER BY c.seq DESC LIMIT 1`).get(actor.id);
    return (row as Pick<ChangeSummary, 'id' | 'number' | 'title'> | undefined) ?? null;
  }

  const createTransaction = db.transaction((actor: Actor, input: unknown) => {
    if (!canSubmit(actor)) fail(403, '仅有工程提交权限的人员可发起');
    const body = obj(input);
    const draft = readDraft(body.draft);
    if (openDraft(actor)) fail(409, '已有未处理的草稿，请先继续编辑或放弃');
    const id = randomUUID();
    const now = new Date().toISOString();
    const seq = db.prepare('INSERT INTO engineering_changes(id, body, updatedAt) VALUES(?, ?, ?)').run(id, '{}', now).lastInsertRowid;
    const change: EngineeringChange = {
      id, number: `EC-${String(seq).padStart(6, '0')}`, title: draft.title, draft,
      creator: actor.id, status: 'draft', version: 1, updatedAt: now, rounds: [], records: [],
      history: [{ action: 'create', actor: actor.id, name: actor.name || actor.username || actor.id, note: '', at: now }],
    };
    change.draft.attachments = attachments.update(change, body);
    if (!hasDraftContent(change.draft)) fail(400, '请填写申请事项、申请内容或添加附件再保存');
    save(change);
    return body.submit === true ? act(actor, change.id, { action: 'submit', version: change.version }) : change;
  });

  const create = createTransaction.immediate;

  function syncTasks(change: EngineeringChange, event: string, note: string) {
    const previous = db.prepare('SELECT task AS key, userId FROM engineering_change_tasks WHERE changeId=?').all(change.id) as ChangeTask[];
    const next = tasks(change);
    for (const old of previous) {
      if (!next.some(task => task.key === old.key && task.userId === old.userId)) {
        db.prepare('DELETE FROM engineering_change_tasks WHERE changeId=? AND task=?').run(change.id, old.key);
      }
    }
    for (const task of next) {
      if (previous.some(old => old.key === task.key && old.userId === task.userId)) continue;
      const generation = String(change.version);
      const key = JSON.stringify([change.id, generation, task.key, task.userId]);
      const reason = ['return', 'difference', 'correct', 'reassign', 'recordAndVerify'].includes(event) && note ? `\n原因：${note.slice(0, 300)}` : '';
      const content = `【${task.title}】\n${change.number} · ${change.title}${reason}`;
      db.prepare('INSERT INTO engineering_change_tasks VALUES(?, ?, ?, ?, ?, ?)').run(change.id, task.key, task.userId, generation, task.title, change.updatedAt);
      if (event === 'withdraw' && task.key === 'draft') continue;
      db.prepare("INSERT INTO engineering_change_messages VALUES(?, ?, ?, ?, ?, ?, ?, 'queued', ?)")
        .run(key, change.id, task.userId, task.key, generation, event, content, change.updatedAt);
    }
  }

  function queueCopyMessages(change: EngineeringChange, now: string) {
    const recipients = changeCcRecipients(change);
    const content = `【工程变更抄送】\n${change.number} · ${change.title}\n此单据供你查阅。`;
    for (const { userId, generation } of recipients) {
      const key = JSON.stringify([change.id, generation, 'cc', userId]);
      db.prepare("INSERT OR IGNORE INTO engineering_change_messages VALUES(?, ?, ?, 'cc', ?, 'cc', ?, 'queued', ?)")
        .run(key, change.id, userId, generation, content, now);
    }
  }

  const actionTransaction = db.transaction((actor: Actor, id: string, input: unknown) => {
    const change = get(actor, id);
    const body = obj(input);
    if (body.version !== change.version) fail(409, '单据已更新，请刷新后再处理');
    if (!actions(change, actor).includes(body.action as ChangeAction)) fail(403, '当前人员或节点不能执行此操作');
    if (body.action === 'save' && !change.assignment && !hasDraftContent(change.draft) && openDraft(actor)) {
      fail(409, '已有未处理的草稿，请先继续编辑或放弃');
    }
    const now = new Date().toISOString();
    const files = body.action === 'save' ? attachments.update(change, body) : undefined;
    const note = applyAction(change, actor, body, now, lookup, routingConfig);
    if (body.action === 'recordAndVerify') {
      const record = change.records.at(-1)!;
      if (record.lines.some(row => Number(row.quantity) > 0)) {
        record.verificationPhoto = attachments.verificationPhoto(change.id, body.verificationPhoto);
        record.kingdeeScrapEvidence = attachments.kingdeeScrapEvidence(change.id, body.kingdeeScrapEvidence);
      }
    }
    if (body.action === 'confirm' && hasExecutedScrap(change)) {
      change.scrapVerificationPhoto = attachments.verificationPhoto(change.id, body.verificationPhoto);
      change.kingdeeScrapEvidence = attachments.kingdeeScrapEvidence(change.id, body.kingdeeScrapEvidence);
      change.kingdeeScrapBillNo = field(body.kingdeeScrapBillNo, '金蝶单号', 120, true) || undefined;
    }
    if (files) {
      change.draft.attachments = files;
      if (!change.assignment && !hasDraftContent(change.draft)) fail(400, '请填写申请事项、申请内容或添加附件再保存');
    }
    const action = String(body.action);
    change.history.push({ action, actor: actor.id, name: actor.name || actor.username || actor.id, note, at: now });
    change.version++;
    change.updatedAt = now;
    save(change);
    syncTasks(change, action, note);
    if (action === 'submit') queueCopyMessages(change, now);
    return change;
  });

  const act = actionTransaction.immediate;

  function list(actor: Actor, scope: string, page: number) {
    const order = 'ORDER BY c.updatedAt DESC, c.seq DESC LIMIT 31 OFFSET ?';
    const conditions: Record<string, string> = {
      mine: "json_extract(c.body,'$.creator')=?",
      pending: 'EXISTS (SELECT 1 FROM engineering_change_tasks t WHERE t.changeId=c.id AND t.userId=?)',
      all: 'EXISTS (SELECT 1 FROM engineering_change_people p WHERE p.changeId=c.id AND p.userId=?)',
    };
    const unrestricted = scope === 'all' && actor.role === 'admin';
    const params = unrestricted ? [] : [actor.id];
    const rows = db.prepare(`SELECT c.body FROM engineering_changes c
      WHERE ${unrestricted ? '1' : conditions[scope] ?? conditions.all} AND ${visibleChange} ${order}`)
      .all(...params, (page - 1) * 30) as { body: string }[];
    return rows.map(({ body }): ChangeListItem => {
      const change = JSON.parse(body) as EngineeringChange;
      const { id, number, title, status, creator, updatedAt } = change;
      const materials = change.draft.materials ?? [];
      return {
        id, number, title, status, creator, updatedAt,
        creatorName: change.history.find(row => row.action === 'create')?.name,
        submittedAt: change.submittedAt ?? change.history.findLast(row => row.action === 'submit')?.at,
        materials: materials.slice(0, 2),
        materialCount: materials.length,
        tasks: tasks(change),
      };
    });
  }

  function canRemind(actor: Actor, change: EngineeringChange) {
    return (actor.role === 'admin' || actor.id === change.creator) &&
      Boolean(change.submittedAt || change.history.some(row => row.action === 'submit'));
  }

  function reminderTargets(id: string): ChangeReminderTarget[] {
    const targets = db.prepare('SELECT task AS key, userId, title, generation FROM engineering_change_tasks WHERE changeId=? ORDER BY rowid')
      .all(id) as ChangeReminderTarget[];
    return targets.filter(row => canAccessEngineeringChanges(lookup(row.userId)));
  }

  const remind = db.transaction((actor: Actor, id: string, input: unknown) => {
    const change = get(actor, id);
    if (!canRemind(actor, change)) fail(403, '仅管理员或变更申请人可以催办已提交的单据');
    const body = obj(input);
    const target = reminderTargets(id).find(row =>
      row.key === body.task && row.userId === body.userId && row.generation === body.generation);
    if (!target) fail(409, '待办已变化，请刷新后再催办');

    const now = Date.now();
    const recent = db.prepare(`
      SELECT 1 FROM engineering_change_messages WHERE changeId=? AND task=? AND userId=? AND generation=?
      AND (status IN ('queued', 'sending') OR (event='remind' AND at>?))
    `).get(id, target.key, target.userId, target.generation, new Date(now - 5 * 60_000).toISOString());
    if (recent) fail(429, '该待办已有通知正在处理，或最近 5 分钟内已催办');
    const key = JSON.stringify([id, target.generation, target.key, target.userId, 'remind', randomUUID()]);
    const content = `【工程变更催办】\n${change.number} · ${change.title}\n${target.title}\n催办人：${actor.name || actor.username || actor.id}`;
    db.prepare("INSERT INTO engineering_change_messages VALUES(?, ?, ?, ?, ?, 'remind', ?, 'queued', ?)")
      .run(key, id, target.userId, target.key, target.generation, content, new Date(now).toISOString());
  }).immediate;

  function detail(actor: Actor, id: string) {
    const change = get(actor, id);
    const reassignments = actor.role === 'admin' ? reassignableTasks(change) : [];
    const ids = new Set([change.creator, change.assignment?.pmc, change.assignment?.warehouse,
      ...change.records.map(row => row.userId), ...changeCcRecipients(change).map(row => row.userId),
      ...(change.assignment?.departments ?? []).map(row => row.userId),
      ...change.rounds.flatMap(round => round.reviewers.map(row => row.userId)), ...reassignments.map(task => task.userId)]);
    const people = Object.fromEntries([...ids].filter((id): id is string => Boolean(id)).map(id => {
      const user = lookup(id);
      return [id, user?.name || user?.username || id];
    }));
    const deliveries = db.prepare('SELECT userId, generation, event, status, at FROM engineering_change_messages WHERE changeId=? ORDER BY rowid DESC')
      .all(id) as ChangeDelivery[];
    return { change, actions: actions(change, actor), deliveries, people, tasks: tasks(change),
      reassignments, reminderTargets: canRemind(actor, change) ? reminderTargets(id) : [] };
  }

  function pending(actor: Actor) {
    const result = db.prepare('SELECT count(*) AS total FROM engineering_change_tasks WHERE userId=?').get(actor.id) as { total: number };
    const rows = db.prepare(`SELECT t.changeId, t.task, t.title, t.at AS time, json_extract(c.body,'$.number') AS number,
      json_extract(c.body,'$.title') AS subject
      FROM engineering_change_tasks t JOIN engineering_changes c ON c.id=t.changeId
      WHERE t.userId=? ORDER BY t.at DESC LIMIT 20`).all(actor.id) as {
        changeId: string; task: string; title: string; time: string; number: string; subject: string;
      }[];
    return { total: result.total, data: rows.map(row => ({
      id: `engineering_change:${row.changeId}:${row.task}`, type: 'engineering_change', title: row.title,
      description: `${row.number} · ${row.subject}`, time: row.time, link: changeLink(row.changeId),
    })) };
  }

  const claimTransaction = db.transaction(() => {
    const message = db.prepare("SELECT * FROM engineering_change_messages WHERE status='queued' ORDER BY rowid LIMIT 1").get() as ChangeMessage | undefined;
    if (message) db.prepare("UPDATE engineering_change_messages SET status='sending', at=? WHERE key=?").run(new Date().toISOString(), message.key);
    return message;
  });

  const claimMessage = claimTransaction.immediate;

  function messageCurrent(message: ChangeMessage) {
    if (message.task === 'cc') {
      const change = load(message.changeId);
      return Boolean(change && change.status !== 'discarded' && changeCcRecipients(change).some(row =>
        row.userId === message.userId && row.generation === message.generation));
    }
    return Boolean(db.prepare('SELECT 1 FROM engineering_change_tasks WHERE changeId=? AND task=? AND userId=? AND generation=?')
      .get(message.changeId, message.task, message.userId, message.generation));
  }

  function finishMessage(key: string, status: string) {
    db.prepare("UPDATE engineering_change_messages SET status=? WHERE key=? AND status='sending'").run(status, key);
  }

  function recoverMessages() {
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    db.prepare("UPDATE engineering_change_messages SET status='uncertain' WHERE status='sending' AND at<?").run(stale);
  }

  const attachment = (actor: Actor, id: string, fileId: string) => attachments.content(get(actor, id), fileId);

  return { create, openDraft, get, detail, attachment, act, remind, list, pending, config, configure, claimMessage, messageCurrent, finishMessage, recoverMessages, routingConfig };
}
