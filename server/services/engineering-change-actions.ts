import { allocationKey, applicationContent, canAccessEngineeringChanges, changeCcRecipients, draftCcUserIds, hasExecutedScrap, roundAffectedMaterials } from '../shared/engineering-change-content.ts';
import type { ChangeConfig, EngineeringChange } from '../../src/types/engineeringChange.ts';
import {
  executed, fail, field, hasDifference, latestRound, obj, quantity, readAssessment,
  readDraft, readMaterials, reassignableTasks, tasks, units,
} from './engineering-change-rules.ts';
import type { Actor } from './engineering-change-rules.ts';

export type LookupUser = (id: string) => (Actor & { status: string; wecomUserid?: string }) | null;

export function activeUser(value: unknown, lookup: LookupUser) {
  const id = field(value, '处理人', 120);
  const user = lookup(id);
  if (user?.status !== 'active') fail(400, '请选择已激活的人员');
  if (!canAccessEngineeringChanges(user)) fail(400, `${user.name || user.username || id}未开通工程变更权限`);
  return id;
}

export function readConfig(input: unknown, lookup: LookupUser, legacyDepartments?: ChangeConfig['departments']): ChangeConfig {
  const body = obj(input);
  const departments = legacyDepartments ?? readDepartmentConfig(body.departments, lookup);
  const pmc = activeUser(body.pmc, lookup);
  const warehouse = activeUser(body.warehouse, lookup);
  const origin = field(body.origin, '平台地址', 300, true);
  if (origin) {
    let url: URL;
    try { url = new URL(origin); } catch { fail(400, '请填写有效的平台地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || ![url.origin, url.origin + '/'].includes(origin)) {
      fail(400, '平台地址须为 HTTP(S) 站点根地址');
    }
  }
  return { pmc, warehouse, departments, origin: origin.replace(/\/$/, '') };
}

function readDepartmentConfig(input: unknown, lookup: LookupUser) {
  if (!Array.isArray(input) || !input.length || input.length > 20) fail(400, '请设置 1–20 个会签部门');
  const departments = input.map(item => {
    const row = obj(item);
    return { name: field(row.name, '部门', 50), userId: activeUser(row.userId, lookup) };
  });
  if (new Set(departments.map(row => row.name)).size !== departments.length) fail(400, '部门名称不能重复');
  if (new Set(departments.map(row => row.userId)).size !== departments.length) fail(400, '各部门须指定不同审批人');
  return departments;
}

function toAssessment(change: EngineeringChange) {
  change.status = 'assessment';
}

function startReview(change: EngineeringChange, body: Record<string, unknown>, now: string, lookup: LookupUser) {
  const noImpact = body.noImpact === true;
  if (noImpact && hasExecutedScrap(change)) fail(400, '已有报废记录，请核对并保留处置明细');
  const previous = change.rounds.at(-1);
  const known = new Map([...(previous ? roundAffectedMaterials(previous) : []), ...change.draft.materials].map(row => [row.id, row]));
  const materials = noImpact ? [] : readMaterials(body.materials).map(row => known.get(row.id) ?? row);
  if (!noImpact && !materials.length) fail(400, '请选择受影响物料，或确认无受影响库存及在制品');
  const lines = noImpact ? [] : readAssessment(change, materials, body.lines);
  const noScrap = lines.every(row => units(row.scrap) === 0);
  const note = field(body.note, noImpact ? '无影响说明' : noScrap ? '无需报废原因' : '评估说明', 2000, !noScrap);
  const reviewers = change.assignment!.departments.map(row => ({ ...row, userId: activeUser(row.userId, lookup) }));
  change.rounds.push({ number: change.rounds.length + 1, note, at: now, lines, noImpact, affectedMaterials: materials, draft: change.draft, reviewers });
  change.status = 'review';
}

function readScrapLines(change: EngineeringChange, input: unknown) {
  const round = latestRound(change);
  if (!Array.isArray(input) || input.length > round.lines.length) fail(400, '请填写报废明细');
  const totals = executed(change, true);
  const eligible = round.lines.flatMap((row, index) =>
    units(row.scrap) > (totals.get(allocationKey(row)) ?? 0) ? [index] : []);
  const indices = new Set<number>();
  const lines = input.map(item => {
    const row = obj(item);
    const index = row.line;
    if (typeof index !== 'number' || !eligible.includes(index) || indices.has(index)) fail(400, '报废行不在待处置范围或已重复');
    indices.add(index);
    return { allocation: round.lines[index], quantity: quantity(row.quantity) };
  });
  if (indices.size !== eligible.length) fail(400, '请逐项登记实际报废数量，未执行填 0');
  return lines;
}

function registerScrap(change: EngineeringChange, actor: Actor, body: Record<string, unknown>, now: string) {
  const lines = readScrapLines(change, body.lines);
  const evidence = field(body.evidence, '报废凭证', 2000);
  change.scrapMode = 'legacy';
  if (change.correction) change.records.at(-1)!.superseded = true;
  change.records.push({ round: latestRound(change).number, at: now, userId: actor.id, evidence, lines });
  change.correction = false;
  change.status = 'verify';
}

function recordAndVerify(change: EngineeringChange, actor: Actor, body: Record<string, unknown>, now: string) {
  const record: EngineeringChange['records'][number] = {
    round: latestRound(change).number, at: now, userId: actor.id, lines: readScrapLines(change, body.lines),
  };
  change.records.push(record);
  if (hasDifference(change)) {
    record.warehouseResult = 'difference';
    record.differenceReason = field(body.note, '数量差异原因', 2000);
    toAssessment(change);
    return record.differenceReason;
  }
  record.warehouseResult = 'closed';
  change.status = 'closed';
  return '';
}

function reassign(change: EngineeringChange, body: Record<string, unknown>, lookup: LookupUser) {
  const task = reassignableTasks(change).find(item => item.key === body.task);
  if (!task) fail(400, '请选择可改派的处理人');
  const id = activeUser(body.userId, lookup);
  if (id === task.userId) fail(400, '请选择新的处理人');
  const config = change.assignment!;
  if (task.key === 'verify') {
    config.warehouse = id;
  } else if (task.key.startsWith('review-next:')) {
    const index = Number(task.key.split(':')[1]);
    if (id === change.creator) fail(400, '发起人不能接办会签');
    config.departments[index].userId = id;
    if (change.status === 'review') latestRound(change).reviewers[index].userId = id;
  } else if (task.key.startsWith('review:')) {
    const index = Number(task.key.split(':')[1]);
    const reviewers = latestRound(change).reviewers;
    if (id === change.creator) fail(400, '发起人不能接办会签');
    reviewers[index].userId = id;
    config.departments[index].userId = id;
  } else {
    config.pmc = id;
  }
  return `${task.title}｜${task.userId} → ${id}｜${field(body.note, '改派原因', 2000)}`;
}

function reviewTarget(change: EngineeringChange, actor: Actor, task: unknown) {
  const pending = tasks(change).filter(row => row.key.startsWith('review:') && row.userId === actor.id);
  if (task === undefined && pending.length > 1) fail(400, '请选择本次处理的会签部门');
  const target = task === undefined ? pending[0] : pending.find(row => row.key === task);
  if (!target) fail(403, '该会签部门当前未分派给你');
  return latestRound(change).reviewers[Number(target.key.split(':')[1])];
}

function approve(change: EngineeringChange, actor: Actor, task: unknown, note: string, now: string) {
  const row = reviewTarget(change, actor, task);
  Object.assign(row, { decision: 'approved', note, at: now });
  if (latestRound(change).reviewers.every(item => item.decision === 'approved')) {
    if (hasDifference(change)) {
      change.scrapMode ??= change.records.length > 0 ? 'legacy' : 'warehouse';
      change.status = change.scrapMode === 'warehouse' ? 'verify' : 'scrap';
    } else {
      change.status = change.scrapMode !== 'warehouse' && hasExecutedScrap(change) ? 'verify' : 'closed';
    }
  }
  return [row.name, note].filter(Boolean).join(' · ');
}

function submittedAssignment(change: EngineeringChange, actor: Actor, config: ChangeConfig | null, lookup: LookupUser): ChangeConfig {
  const selected = change.draft.routing;
  if (!config) fail(409, '请管理员先维护会签部门和默认处理人');
  if (!selected?.departments.length) fail(400, '请为本单选择至少一个会签部门');
  const departments = selected.departments.map(name => {
    const department = config.departments.find(row => row.name === name);
    if (!department) fail(400, `会签部门「${name}」已调整，请重新选择`);
    if (department.userId === actor.id) fail(400, `你是「${name}」的审批人，请调整本单会签部门或联系管理员`);
    const supervisor = lookup(department.userId);
    if (supervisor?.status !== 'active') fail(400, `「${name}」的主管已停用，请联系管理员更新`);
    if (!canAccessEngineeringChanges(supervisor)) fail(400, `「${name}」的主管未开通工程变更权限`);
    return department;
  });
  return {
    departments, pmc: activeUser(selected.pmc || config.pmc, lookup),
    warehouse: activeUser(selected.warehouse || config.warehouse, lookup),
  };
}

export function applyAction(change: EngineeringChange, actor: Actor, body: Record<string, unknown>, now: string,
  lookup: LookupUser, configured: () => ChangeConfig | null) {
  const note = field(body.note, '处理说明', 2000, !['return', 'difference', 'correct'].includes(String(body.action)));
  switch (body.action) {
    case 'save':
      change.draft = readDraft(body.draft);
      change.title = change.draft.title;
      break;
    case 'submit': {
      const draft = change.draft;
      if (!draft.title || !applicationContent(draft).trim()) fail(400, '请填写申请事项和申请内容');
      const previous = new Map(changeCcRecipients(change).map(row => [row.userId, row]));
      change.ccRecipients = draftCcUserIds(draft).map(value => {
        const userId = activeUser(value, lookup);
        if (userId === actor.id) fail(400, '请选择其他人员作为抄送人');
        return previous.get(userId) ?? { userId, generation: String(change.version + 1) };
      });
      delete change.cc;
      change.reviewMode ??= change.assignment || change.submittedAt || change.rounds.length ? 'parallel' : 'sequential';
      change.submittedAt = now;
      change.assignment = submittedAssignment(change, actor, configured(), lookup);
      toAssessment(change);
      break;
    }
    case 'assess': startReview(change, body, now, lookup); break;
    case 'approve': return approve(change, actor, body.task, note, now);
    case 'return': {
      if (body.target === 'engineering' && change.records.length) fail(400, '已有报废执行记录，请退回 PMC 修正处置方案');
      const row = change.status === 'review' ? reviewTarget(change, actor, body.task) : undefined;
      if (row) Object.assign(row, { decision: 'returned', note, at: now });
      change.status = change.status === 'assessment' || body.target === 'engineering' ? 'draft' : 'assessment';
      return row ? `${row.name} · ${note}` : note;
    }
    case 'discard': change.status = 'discarded'; break;
    case 'record': registerScrap(change, actor, body, now); break;
    case 'recordAndVerify': return recordAndVerify(change, actor, body, now);
    case 'confirm': change.status = 'closed'; break;
    case 'difference': toAssessment(change); break;
    case 'correct': change.correction = true; change.status = 'scrap'; break;
    case 'reassign': return reassign(change, body, lookup);
  }
  return note;
}
