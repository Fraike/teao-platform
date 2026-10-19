export type FeedbackCategory = "data" | "display" | "suggestion" | "other";
export type FeedbackStatus = "pending" | "processing" | "resolved";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  data: "数据问题", display: "页面问题", suggestion: "功能建议", other: "其他",
};
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: "待处理", processing: "处理中", resolved: "已解决",
};

export interface FeedbackInput {
  category: FeedbackCategory;
  description: string;
  pagePath: string;
  pageTitle: string;
  screenshots: { name: string; dataUrl: string }[];
}

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  description: string;
  pagePath: string;
  pageTitle: string;
  createdBy: string;
  createdById: string;
  createdAt: string;
  status: FeedbackStatus;
  reply: string;
  handledBy: string;
  updatedAt: string;
  revision: number;
  screenshotCount: number;
}

export interface FeedbackDetail extends FeedbackItem {
  screenshots: { id: string; name: string; dataUrl: string }[];
}

export interface FeedbackPage {
  ok: boolean;
  data: FeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
}
