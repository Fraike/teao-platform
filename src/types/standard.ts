export type StandardStatus = "draft" | "pending_review" | "published" | "archived" | "obsolete";
export type StandardType = "formal" | "temporary" | "new_pending";

export interface StandardCategoryField {
  variant?: "paired" | "component";
  group?: string;
  key: string;
  label: string;
}

export interface StandardCategory {
  key: string;
  name: string;
  fields: StandardCategoryField[];
}

export interface StandardFields {
  [key: string]: string;
}

export interface StandardVersion {
  assignedReviewerId: string;
  assignedReviewerName: string;
  id: string;
  revision: number;
  createdById: string;
  updatedById: string;
  submittedById: string;
  submittedBy: string;
  submittedAt: string;
  reviewedById: string;
  versionNo: number;
  serialNo: string;
  customer: string;
  model: string;
  customerPartNo: string;
  vehicleModel: string;
  categoryKey: string;
  categoryName: string;
  standardType: StandardType;
  fields: StandardFields;
  status: StandardStatus;
  reviewComment: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  reviewedBy: string;
  reviewedAt: string;
  publishedAt: string;
}

export interface StandardListItem {
  publishedAt?: string;
  reviewedAt?: string;
  hasPreviousPublication?: boolean;
  assignedReviewerId?: string;
  submittedById?: string;
  id: string;
  serialNo: string;
  categoryKey: string;
  categoryName: string;
  standardType: StandardType;
  status: StandardStatus;
  versionNo: number;
  customer: string;
  model: string;
  customerPartNo: string;
  vehicleModel: string;
  fields: StandardFields;
  hasPending: boolean;
  updatedAt: string;
  updatedBy: string;
  reviewComment: string;
}

export type StandardPublicationNotice = "new" | "changed" | null;

export interface StandardReminderResponse {
  ok: boolean;
  status: "sent" | "not_configured" | "failed" | "unknown";
  mentionedReviewer?: boolean;
  retryAt?: string;
  nextReminderAt?: string;
}

export interface StandardReviewResponse {
  ok: boolean;
  data: StandardDetail;
  notification?: StandardPublicationDelivery;
}

export interface StandardPublicationDelivery {
  id?: string;
  versionId?: string;
  revision?: number;
  updatedAt?: string;
  status: "sent" | "not_configured" | "failed" | "unknown" | "queued" | "sending" | "not_recorded" | "superseded";
  sentParts: number;
  totalParts: number;
  mentionedSubmitter?: boolean;
}

export interface StandardChange {
  id: string;
  versionId: string;
  fieldKey: string;
  fieldLabel: string;
  author: string;
  changedAt: string;
  description: string;
}

export interface StandardSourceComment {
  id: string;
  versionId: string;
  sourceCell: string;
  fieldKey: string;
  fieldLabel: string;
  author: string;
  text: string;
  changedAt: string;
  sourceHash: string;
}

export interface StandardDetail {
  sourceComments?: StandardSourceComment[];
  id: string;
  serialNo: string;
  categoryKey: string;
  categoryName: string;
  standardType: StandardType;
  versions: StandardVersion[];
  changes: StandardChange[];
}

export interface StandardInput {
  serialNo: string;
  customer: string;
  model: string;
  customerPartNo: string;
  vehicleModel: string;
  categoryKey: string;
  standardType: StandardType;
  fields: StandardFields;
}

export interface StandardImportComment {
  fieldKey: string;
  fieldLabel: string;
  author: string;
  text: string;
  cell: string;
  changedAt: string;
}

export interface StandardImportRecord {
  sourceHash?: string;
  sourceSheet?: string;
  sourceRow?: number;
  comments?: StandardImportComment[];
  serialNo: string;
  customer: string;
  model: string;
  customerPartNo: string;
  vehicleModel?: string;
  categoryKey: string;
  standardType: StandardType;
  fields: StandardFields;
}

export interface StandardImportPreview {
  token: string | null;
  skipped: number;
  total: number;
  valid: number;
  errors: { row: number; message: string }[];
}

export const STANDARD_TYPE_LABELS: Record<StandardType, string> = {
  formal: "正式标准",
  temporary: "临时标准",
  new_pending: "新增待定",
};

export const STANDARD_TYPE_COLORS: Record<StandardType, string> = {
  formal: "green",
  temporary: "orange",
  new_pending: "blue",
};

export const STANDARD_STATUS_LABELS: Record<StandardStatus, string> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  archived: "已归档",
  obsolete: "已停用",
};

export interface StandardRowSelectionStore {
  subscribe: (listener: () => void) => () => void;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
}

export interface StandardPageResponse {
  canImport?: boolean;
  canEdit?: boolean;
  canReview?: boolean;
  ok: boolean;
  data: StandardListItem[];
  total: number;
  page: number;
  pageSize: number | null;
  updatedAt: string;
  version: string;
}

export interface StandardHistoryPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
