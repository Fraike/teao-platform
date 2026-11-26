import { allocationKey, changeCcRecipients, changeDispositions, materialDefaultWarehouse, quantitySources, scrapExecution, warehouseScopes } from '../shared/engineering-change-content.ts';
import type {
  ChangeAction, ChangeDraft, ChangeMaterial, ChangeRoutingSelection, ChangeRound, ChangeTask, EngineeringChange,
} from '../../src/types/engineeringChange.ts';

export interface Actor {
  id: string;
  name?: string;
  username?: string;
  role?: string;
  permissions?: string[];
}

export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

export function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求格式不正确');
  return value as Record<string, unknown>;
}

export function field(value: unknown, label: string, max = 250, optional = false): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((!optional && !result) || result.length > max) fail(400, `${label}须填写且最多 ${max} 字`);
  return result;
}

function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max) fail(400, `${label}须填写 1–${max} 行`);
  return value;
}

export function readMaterials(input: unknown) {
  if (input === undefined || (Array.isArray(input) && input.length === 0)) return [];
  const materials = array(input, 100, '物料').map(item => {
    const row = obj(item);
    const defaultWarehouse = materialDefaultWarehouse(row.defaultWarehouse);
    return { id: field(row.id, '物料 ID', 80), code: field(row.code, '物料编码', 80),
      name: field(row.name, '物料名称'), unit: field(row.unit, '单位', 40), ...(defaultWarehouse ? { defaultWarehouse } : {}) };
  });
  if (materials.length !== new Set(materials.map(row => row.id)).size) fail(400, '物料不能重复');
  return materials;
}

function readRouting(input: unknown): ChangeRoutingSelection | undefined {
  if (input === undefined) return undefined;
  const data = obj(input);
  if (!Array.isArray(data.departments) || data.departments.length > 20) fail(400, '请选择有效的会签部门');
  const departments = [...new Set(data.departments.map(name => field(name, '部门', 50)))];
  return { departments, pmc: field(data.pmc, 'PMC 处理人', 120, true),
    warehouse: field(data.warehouse, '仓库复核人', 120, true) };
}

export function readDraft(input: unknown): ChangeDraft {
  const data = obj(input);
  const rawCc = data.ccUserIds ?? (data.ccUserId ? [data.ccUserId] : []);
  if (!Array.isArray(rawCc)) fail(400, '请选择要抄送的人员');
  const ccUserIds = [...new Set(rawCc.map(id => field(id, '抄送人', 120)))];
  return {
    title: field(data.title, '申请事项', 120, true),
    content: data.content === undefined ? undefined : field(data.content, '申请内容', 10000, true),
    reason: field(data.reason, '原因', 2000, true), before: field(data.before, '变更前', 2000, true),
    after: field(data.after, '变更后', 2000, true), effective: field(data.effective, '生效条件', 500, true),
    references: field(data.references, '资料引用', 2000, true),
    materials: readMaterials(data.materials),
    ccUserIds,
    routing: readRouting(data.routing),
  };
}

export function canSubmit(actor: Actor) {
  return actor.role === 'admin' || Boolean(actor.permissions?.includes('engineering_submit'));
}

// 数量按六位小数换算为整数进行比较和累计。
export function units(value: string) {
  const [integer, fraction = ''] = value.split('.');
  return Number(integer) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

export function quantity(input: unknown) {
  if (typeof input !== 'string' || !/^\d{1,8}(\.\d{1,6})?$/.test(input.trim())) fail(400, '数量须为非负数字，最多六位小数');
  return input.trim();
}

export function formatUnits(value: number) {
  return (value / 1_000_000).toFixed(6).replace(/\.?0+$/, '');
}

export function executed(change: EngineeringChange, excludeCorrection = false) {
  const totals = new Map<string, number>();
  for (const { line, key } of scrapExecution(change, latestRound(change).lines, excludeCorrection)) {
    totals.set(key, (totals.get(key) ?? 0) + units(line.quantity));
  }
  return totals;
}

export function readAssessment(change: EngineeringChange, affectedMaterials: ChangeMaterial[], input: unknown) {
  const lines = array(input, 200, '处置明细').map(item => {
    const row = obj(item);
    const checkedAt = field(row.checkedAt, '数量核对时间', 40);
    const timestamp = new Date(checkedAt);
    if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== checkedAt) fail(400, '数量核对时间无效');
    const disposition = field(row.disposition, '剩余物料处置', 500);
    if (!changeDispositions.includes(disposition)) fail(400, '请选择有效的剩余物料处置');
    const warehouseScope = field(row.warehouseScope, '仓库／工单范围', 40);
    if (!warehouseScopes.includes(warehouseScope)) fail(400, '请选择有效的仓库／工单范围');
    const warehouse = field(row.warehouse, '具体仓库或工单范围', 120, true) || warehouseScope;
    const sourceKind = field(row.sourceKind, '数量来源', 40);
    if (!quantitySources.includes(sourceKind)) fail(400, '请选择有效的数量来源');
    return {
      materialId: field(row.materialId, '物料', 80), warehouse, warehouseScope,
      batch: field(row.batch, '批次', 120, true), stock: quantity(row.stock), semi: row.semi === undefined ? undefined : quantity(row.semi),
      wip: quantity(row.wip), scrap: quantity(row.scrap), sourceKind, source: field(row.source, '数量来源说明', 500, true),
      checkedAt, disposition,
    };
  });
  const materials = new Set(affectedMaterials.map(row => row.id));
  const included = new Set(lines.map(row => row.materialId));
  const byKey = new Map(lines.map(row => [allocationKey(row), row]));
  if (included.size !== materials.size || [...included].some(id => !materials.has(id))) fail(400, '处置明细须覆盖已选的全部受影响物料');
  if (byKey.size !== lines.length) fail(400, '同一物料、仓库和批次不能重复');
  const executions = scrapExecution(change, lines);
  const totals = new Map<string, number>();
  for (const { line, key } of executions) totals.set(key, (totals.get(key) ?? 0) + units(line.quantity));
  for (const row of lines) {
    if (row.semi !== undefined && units(row.semi) > units(row.stock)) fail(400, '已入库半成品数不能超过仓库实存');
    const remaining = units(row.scrap) - (totals.get(allocationKey(row)) ?? 0);
    if (remaining > units(row.stock) + units(row.wip)) fail(400, '尚需报废数量不能超过当前实存与在制合计');
  }
  for (const [key, actual] of totals) {
    const row = byKey.get(key);
    if (actual > 0 && (!row || units(row.scrap) < actual)) fail(400, '新方案须保留已执行的物料、仓库和批次，拟报废量不得低于已执行量');
  }
  // A legacy execution has no scope. Once matched unambiguously, keep that scope for later rounds.
  for (const { line, scope, savedScope } of executions) {
    if (scope && !savedScope && units(line.quantity) > 0) line.reconciledWarehouseScope = scope;
  }
  return lines;
}

export function latestRound(change: EngineeringChange): ChangeRound {
  const round = change.rounds.at(-1);
  if (!round) fail(409, '当前没有评估轮次');
  return round;
}

export function hasDifference(change: EngineeringChange) {
  const totals = executed(change);
  return latestRound(change).lines.some(row => units(row.scrap) !== (totals.get(allocationKey(row)) ?? 0));
}

export function assigned(change: EngineeringChange, id: string) {
  return (change.status !== 'draft' && change.status !== 'discarded' && changeCcRecipients(change).some(row => row.userId === id)) || change.creator === id || change.assignment?.pmc === id ||
    change.rounds.some(round => round.reviewers.some(row => row.userId === id)) ||
    (change.assignment?.warehouse === id && (change.status === 'verify' || change.records.length > 0)) ||
    change.history.some(row => row.actor === id);
}

function reviewTasks(change: EngineeringChange) {
  return latestRound(change).reviewers.flatMap((row, index) => row.decision ? [] :
    [{ key: `review:${index}`, userId: row.userId, title: `工程变更待${row.name}审批` }]);
}

export function tasks(change: EngineeringChange): ChangeTask[] {
  const assignment = change.assignment;
  switch (change.status) {
    case 'draft': return assignment ? [{ key: 'draft', userId: change.creator, title: '工程变更待修改' }] : [];
    case 'assessment': return assignment ? [{ key: 'assessment', userId: assignment.pmc, title: '工程变更待 PMC 评估' }] : [];
    case 'review': {
      const pending = reviewTasks(change);
      return change.reviewMode === 'sequential' ? pending.slice(0, 1) : pending;
    }
    case 'scrap': return assignment ? [{ key: 'scrap', userId: assignment.pmc, title: change.correction ? '工程变更待补正报废凭证' : '工程变更待登记报废' }] : [];
    case 'verify': return assignment ? [{ key: 'verify', userId: assignment.warehouse,
      title: change.scrapMode === 'warehouse' ? '工程变更待仓库登记报废' : '工程变更待仓库复核' }] : [];
    default: return [];
  }
}

export function reassignableTasks(change: EngineeringChange): ChangeTask[] {
  const current = tasks(change).filter(task => task.key !== 'draft');
  if (change.status === 'review' && change.reviewMode === 'sequential') {
    return [...current, ...reviewTasks(change).slice(1).map(task => ({
      ...task, key: task.key.replace('review:', 'review-next:'), title: `${task.title}（尚未轮到）`,
    }))];
  }
  if (change.status !== 'assessment') return current;
  return [...current, ...(change.assignment?.departments ?? []).map((row, index) => ({
    key: `review-next:${index}`, userId: row.userId, title: `${row.name}审批人（会签前）`,
  }))];
}

export function actions(change: EngineeringChange, actor: Actor): ChangeAction[] {
  const mine = tasks(change).some(task => task.userId === actor.id);
  const admin: ChangeAction[] = actor.role === 'admin' && tasks(change).some(task => task.key !== 'draft') ? ['reassign'] : [];
  switch (change.status) {
    case 'draft': return change.creator === actor.id && canSubmit(actor) ? ['save', 'submit', 'discard'] : [];
    case 'assessment': {
      const result: ChangeAction[] = mine ? ['assess', ...(change.records.length ? [] : ['return' as const])] : [];
      const submission = change.history.findLast(row => row.action === 'submit' || row.action === 'assess');
      const enteredReview = submission ? submission.action === 'assess' : change.rounds.length > 0;
      if (change.creator === actor.id && canSubmit(actor) && !change.records.length && !enteredReview) {
        result.push('withdraw');
      }
      return [...result, ...admin];
    }
    case 'review': return mine ? ['approve', 'return', ...admin] : admin;
    case 'scrap': return mine ? ['record', ...admin] : admin;
    case 'verify': {
      if (!mine) return admin;
      if (change.scrapMode === 'warehouse') return ['recordAndVerify', ...admin];
      return [hasDifference(change) ? 'difference' : 'confirm', 'correct', ...admin];
    }
    default: return [];
  }
}
