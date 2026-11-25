export interface ChangeMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  defaultWarehouse?: '成品仓' | '半成品仓';
}

export interface ChangeAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface ChangeAttachmentInput {
  name: string;
  mime: string;
  base64: string;
}

export interface ChangeRoutingSelection {
  pmc?: string;
  warehouse?: string;
  departments: string[];
}

export interface ChangeDraftOptions {
  people: { id: string; name: string; canAccess: boolean }[];
  defaults: { pmc: string; warehouse: string };
  departments: { name: string; userId?: string; unavailableReason?: string }[];
}

export interface ChangeDraft {
  title: string;
  content?: string;
  attachments?: ChangeAttachment[];
  ccUserId?: string;
  ccUserIds?: string[];
  routing?: ChangeRoutingSelection;
  reason?: string;
  before?: string;
  after?: string;
  effective?: string;
  references?: string;
  materials: ChangeMaterial[];
}

export interface ChangeDraftTransfer {
  attachmentIds: string[];
  uploads: ChangeAttachmentInput[];
}

export interface ChangeAllocation {
  materialId: string;
  warehouse: string;
  warehouseScope?: string;
  batch: string;
  stock: string;
  semi?: string;
  wip: string;
  scrap: string;
  source: string;
  sourceKind?: string;
  checkedAt?: string;
  disposition: string;
}

export interface ChangeAssessmentLine extends ChangeAllocation {
  originalWarehouse?: string;
  legacyMixed?: boolean;
  needsScrap?: boolean;
}

export interface ChangeAssessmentValues {
  materials: ChangeMaterial[];
  lines: ChangeAssessmentLine[];
  noImpact: boolean;
  note: string;
  manualCheckedAt?: string;
}

export interface ChangeConfig {
  origin?: string;
  pmc: string;
  warehouse: string;
  departments: { name: string; userId: string }[];
}

export type ChangeStatus = 'draft' | 'assessment' | 'review' | 'scrap' | 'verify' | 'closed' | 'discarded';
export type ChangeAction = 'save' | 'submit' | 'assess' | 'approve' | 'return' | 'record' | 'recordAndVerify' | 'confirm' | 'difference' | 'correct' | 'reassign' | 'discard';

export interface ChangeRound {
  number: number;
  note: string;
  at: string;
  lines: ChangeAllocation[];
  noImpact?: boolean;
  affectedMaterials?: ChangeMaterial[];
  draft: ChangeDraft;
  reviewers: { name: string; userId: string; decision?: 'approved' | 'returned'; note?: string; at?: string }[];
}

export interface ChangeScrapRecord {
  round: number;
  userId: string;
  at: string;
  evidence?: string;
  verificationPhoto?: ChangeAttachment;
  kingdeeScrapEvidence?: ChangeAttachment;
  warehouseResult?: 'closed' | 'difference';
  differenceReason?: string;
  lines: { allocation: ChangeAllocation; quantity: string; reconciledWarehouseScope?: string }[];
  superseded?: boolean;
}

export interface ChangeSummary {
  id: string;
  number: string;
  title: string;
  creator: string;
  status: ChangeStatus;
  updatedAt: string;
}

export interface ChangeListItem extends ChangeSummary {
  creatorName?: string;
  submittedAt?: string;
  materials: ChangeMaterial[];
  materialCount: number;
  tasks: (ChangeTask & { assignee?: string })[];
}

export type ChangeReviewMode = 'sequential' | 'parallel';

export interface EngineeringChange extends ChangeSummary {
  reviewMode?: ChangeReviewMode;
  scrapMode?: 'legacy' | 'warehouse';
  version: number;
  draft: ChangeDraft;
  assignment?: ChangeConfig;
  submittedAt?: string;
  cc?: ChangeCcRecipient;
  ccRecipients?: ChangeCcRecipient[];
  rounds: ChangeRound[];
  records: ChangeScrapRecord[];
  scrapVerificationPhoto?: ChangeAttachment;
  kingdeeScrapEvidence?: ChangeAttachment;
  kingdeeScrapBillNo?: string;
  correction?: boolean;
  history: { action: string; actor: string; name: string; note: string; at: string }[];
}

export interface ChangeCcRecipient {
  userId: string;
  generation: string;
}

export interface ChangeDelivery {
  generation?: string;
  userId: string;
  event: string;
  status: string;
  at: string;
}

export interface ChangeTask {
  key: string;
  userId: string;
  title: string;
}

export interface ChangeReminderTarget extends ChangeTask {
  generation: string;
}

export interface ChangeDetail {
  change: EngineeringChange;
  actions: ChangeAction[];
  deliveries: ChangeDelivery[];
  tasks: ChangeTask[];
  reassignments: ChangeTask[];
  reminderTargets: ChangeReminderTarget[];
  people: Record<string, string>;
}

export interface ChangeInventoryRow {
  warehouse: string;
  position: string;
  unit: string;
  stock: string;
  available: string;
}
