import { api } from './api';
import { allocationKey, allocationWarehouse, roundAffectedMaterials, scrapExecution, workInProgressScope } from '../../server/shared/engineering-change-content.ts';
import type { ChangeAction, ChangeAllocation, ChangeAssessmentLine, ChangeAssessmentValues, ChangeAttachmentInput, ChangeConfig, ChangeDetail, ChangeDraftOptions, ChangeDraft, ChangeDraftTransfer, ChangeInventoryRow, ChangeListItem, ChangeMaterial, ChangeReminderTarget, ChangeStatus, ChangeSummary, EngineeringChange } from '../types/engineeringChange';

const base = '/api/engineering-changes';

export interface ChangePerson {
  id: string;
  name: string;
  bound: boolean;
  canAccess: boolean;
}

export const changeApi = {
  list: (scope: string, page: number, signal?: AbortSignal) => api.get<{ data: { rows: ChangeListItem[]; hasNext: boolean; canCreate: boolean } }>(`${base}?scope=${scope}&page=${page}`, { signal }),
  get: (id: string, signal?: AbortSignal) => api.get<{ data: ChangeDetail }>(`${base}/${encodeURIComponent(id)}`, { signal }),
  draftCheck: () => api.get<{ data: Pick<ChangeSummary, 'id' | 'number' | 'title'> | null }>(`${base}/draft-check`),
  create: (draft: ChangeDraft, transfer: ChangeDraftTransfer, submit: boolean) =>
    api.post<{ data: EngineeringChange }>(base, { draft, ...transfer, submit }),
  act: (change: EngineeringChange, action: ChangeAction, values: object = {}) =>
    api.post<{ data: ChangeDetail }>(`${base}/${encodeURIComponent(change.id)}/actions`, { ...values, action, version: change.version }),
  remind: (id: string, target: ChangeReminderTarget) =>
    api.post<{ data: ChangeDetail }>(`${base}/${encodeURIComponent(id)}/remind`, {
      task: target.key, userId: target.userId, generation: target.generation,
    }),
  draftOptions: (id: string | undefined, signal: AbortSignal) =>
    api.get<{ data: ChangeDraftOptions }>(`${base}${id ? '/' + encodeURIComponent(id) : ''}/draft-options`, { signal }),
  attachment: (id: string, fileId: string, signal?: AbortSignal) =>
    api.getBlob(`${base}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(fileId)}`, { signal }),
  materials: (search: string, signal: AbortSignal, assessmentId?: string) =>
    api.get<{ data: ChangeMaterial[] }>(`${base}${assessmentId ? '/' + encodeURIComponent(assessmentId) : ''}/materials?search=${encodeURIComponent(search)}`, { signal }),
  settings: () => api.get<{ data: { config: ChangeConfig | null; users: ChangePerson[] } }>(`${base}/settings`),
  configure: (values: ChangeConfig) => api.put<{ data: ChangeConfig }>(`${base}/settings`, values),
  inventory: (id: string, materialId: string, signal?: AbortSignal) =>
    api.get<{ data: { data: ChangeInventoryRow[]; fetchedAt: string } }>(`${base}/${encodeURIComponent(id)}/inventory?materialId=${encodeURIComponent(materialId)}`, { signal }),
};

export function encodeChangeAttachment(file: File): Promise<ChangeAttachmentInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取附件 ${file.name}`));
    reader.onload = () => resolve({ name: file.name, mime: file.type, base64: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}

export const changeDeliveryStatuses: Record<string, string> = {
  queued: '待发送', sending: '发送中', sent: '已发送', disabled: '推送已关闭', inactive: '账号已停用',
  permission_missing: '未开通工程变更权限', unbound: '未绑定企微', link_unconfigured: '未设置站点地址', not_configured: '企微应用未配置',
  sample_suppressed: '样本未发送', cancelled: '待办已变化', failed: '发送失败', unknown: '送达状态未知', uncertain: '送达状态未知',
};

export const changeStatus: Record<ChangeStatus, string> = {
  draft: '草稿 / 待修改', assessment: '待 PMC 评估', review: '部门会签中', scrap: '待 PMC 登记报废',
  verify: '待仓库复核', closed: '已结案', discarded: '已放弃',
};

export const changeAction: Record<ChangeAction | 'create', string> = {
  create: '创建草稿', save: '保存草稿', submit: '提交 PMC 评估', assess: '提交会签', approve: '通过',
  return: '退回', record: '登记报废', recordAndVerify: '登记报废', confirm: '确认报废并结案', difference: '报废数量有差异，退回重审',
  correct: '退回补正凭证', reassign: '改派', discard: '放弃草稿', withdraw: '撤回申请',
};

export const changeTime = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';

export function scrapRows(change: EngineeringChange) {
  const lines = change.rounds.at(-1)?.lines ?? [];
  const totals = new Map<string, number>();
  for (const { line, key } of scrapExecution(change, lines, true)) {
    totals.set(key, (totals.get(key) ?? 0) + Math.round(Number(line.quantity) * 1_000_000));
  }
  return lines.flatMap((row, index) => {
    const executed = totals.get(allocationKey(row)) ?? 0;
    const remaining = (Math.round(Number(row.scrap) * 1_000_000) - executed) / 1_000_000;
    return remaining > 0 ? [{ ...row, index, remaining }] : [];
  });
}

export function allocationLabel(row: ChangeAllocation, materials: ChangeMaterial[]) {
  const material = materials.find(item => item.id === row.materialId);
  return [material?.code ?? row.materialId, material?.name, allocationWarehouse(row), row.batch && `批次 ${row.batch}`, material?.unit].filter(Boolean).join(' · ');
}

export function blankAllocation(materialId: string): ChangeAssessmentLine {
  return { materialId, warehouse: '', batch: '', stock: '0', wip: '0', scrap: '0', source: '', disposition: '' };
}

export function initialAssessment(change: EngineeringChange): ChangeAssessmentValues {
  const round = change.rounds.at(-1);
  const materials = round ? roundAffectedMaterials(round) : [];
  const lines = (round?.lines ?? []).filter(row => materials.some(material => material.id === row.materialId)).map(row => ({
    ...row, checkedAt: undefined, originalWarehouse: row.warehouse,
    needsScrap: Number(row.scrap) > 0, legacyMixed: Number(row.stock) > 0 && Number(row.wip) > 0,
  }));
  return {
    note: round?.note ?? '',
    materials,
    noImpact: Boolean(round?.noImpact),
    lines: [...lines, ...materials.filter(material => !lines.some(row => row.materialId === material.id)).map(material => blankAllocation(material.id))],
  };
}

export function assessmentSubmission({ lines, manualCheckedAt, noImpact, ...fields }: ChangeAssessmentValues) {
  return { ...fields, noImpact, lines: noImpact ? [] : lines.map(line => {
    const inProgress = line.warehouseScope === workInProgressScope;
    return {
      materialId: line.materialId, warehouseScope: line.warehouseScope, warehouse: line.warehouse, batch: line.batch,
      sourceKind: line.sourceKind, source: line.source, disposition: line.disposition,
      stock: line.legacyMixed || !inProgress ? line.stock : '0',
      wip: line.legacyMixed || inProgress ? line.wip : '0',
      scrap: line.needsScrap ? line.scrap : '0',
      checkedAt: line.checkedAt || manualCheckedAt,
    };
  }) };
}
