import type { ChangeAllocation, ChangeDelivery, ChangeDraft, ChangeMaterial, ChangeRound, EngineeringChange } from '../../src/types/engineeringChange.ts';

export const ENGINEERING_CHANGE_PERMISSION = 'engineering_change';

export function canAccessEngineeringChanges(user?: { role?: string; permissions?: string[] } | null) {
  return Boolean(user && (user.role === 'admin' || user.permissions?.includes(ENGINEERING_CHANGE_PERMISSION)));
}

export const changeDispositions: readonly string[] = [
  '按原用途继续使用', '转试用', '转待制品存放', '隔离待处理', '无剩余物料',
];

export const workInProgressScope = '在制品／工单';
export const warehouseScopes: readonly string[] = ['成品仓', '半成品仓', workInProgressScope, '原材料仓', '其他'];
export const quantitySources: readonly string[] = ['金蝶即时库存', '现场盘点', '生产工单／在制记录', '金蝶库存＋人工核对', '其他'];

export function materialDefaultWarehouse(value: unknown): ChangeMaterial['defaultWarehouse'] {
  const warehouse = typeof value === 'string' ? value.trim() : '';
  return warehouse === '成品仓' || warehouse === '半成品仓' ? warehouse : undefined;
}

export function roundAffectedMaterials(round: ChangeRound) {
  return round.affectedMaterials ?? (round.noImpact ? [] : round.draft.materials);
}

export function allocationWarehouse(row: ChangeAllocation) {
  return row.warehouseScope && row.warehouseScope !== row.warehouse ? `${row.warehouseScope} · ${row.warehouse}` : row.warehouse;
}

export function allocationSource(row: ChangeAllocation) {
  return [row.sourceKind, row.source].filter(Boolean).join(' · ');
}

function locationKey(row: ChangeAllocation) {
  return [row.materialId, row.warehouse.trim() || row.warehouseScope, row.batch.trim()];
}

export function allocationKey(row: ChangeAllocation, scope = row.warehouseScope) {
  return JSON.stringify([...locationKey(row), scope]);
}

export function scrapExecution(change: EngineeringChange, allocations: ChangeAllocation[], excludeCorrection = false) {
  const scopes = new Map<string, string | null>();
  for (const row of allocations) {
    if (!row.warehouseScope) continue;
    const location = JSON.stringify(locationKey(row));
    if (!scopes.has(location)) scopes.set(location, row.warehouseScope);
    else if (scopes.get(location) !== row.warehouseScope) scopes.set(location, null);
  }
  const corrected = excludeCorrection && change.correction ? change.records.at(-1) : undefined;
  return change.records.filter(record => !record.superseded && record !== corrected).flatMap(record => record.lines.map(line => {
    const savedScope = line.allocation.warehouseScope ?? line.reconciledWarehouseScope;
    const scope = savedScope ?? scopes.get(JSON.stringify(locationKey(line.allocation))) ?? undefined;
    return { line, scope, savedScope, key: allocationKey(line.allocation, scope) };
  }));
}

export function applicationContent(draft: ChangeDraft) {
  return draft.content ?? [
    ['原因', draft.reason], ['变更前', draft.before], ['变更后', draft.after],
    ['生效条件', draft.effective], ['资料引用', draft.references],
  ].flatMap(([label, value]) => value ? [`${label}：${value}`] : []).join('\n');
}

export function draftCcUserIds(draft: ChangeDraft): string[] {
  return draft.ccUserIds ?? (draft.ccUserId ? [draft.ccUserId] : []);
}

export function changeCcRecipients(change: EngineeringChange) {
  return change.ccRecipients ?? (change.cc ? [change.cc] : []);
}

export function hasDraftContent(draft: ChangeDraft, attachmentCount = draft.attachments?.length ?? 0) {
  return Boolean(draft.title.trim() || applicationContent(draft).trim() || attachmentCount > 0);
}

export function hasExecutedScrap(change: EngineeringChange) {
  return change.records.some(record => !record.superseded && record.lines.some(row => Number(row.quantity) > 0));
}

export function submissionDeliveries(deliveries: ChangeDelivery[], version: number) {
  const current = deliveries.filter(row => row.generation === String(version) && (row.event === 'submit' || row.event === 'cc'));
  const ignored = new Set(['sent', 'cancelled', 'sample_suppressed', 'queued', 'sending']);
  return {
    pending: current.some(row => row.status === 'queued' || row.status === 'sending'),
    failures: current.filter(row => !ignored.has(row.status)),
  };
}
