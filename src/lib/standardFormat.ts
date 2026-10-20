import type { StandardListItem, StandardPublicationNotice, StandardStatus, StandardType } from "../types/standard";

import { STANDARD_TYPE_LABELS } from "../types/standard.ts";

export function standardTypeDisplayLabel(type: StandardType, status: StandardStatus): string {
  if (status !== "published") return type === "formal" ? "常规" : type === "temporary" ? "临时" : "新增待定";
  return STANDARD_TYPE_LABELS[type];
}

export const STANDARD_CATEGORY_NOTES: Readonly<Record<string, string>> = {
  gear_damper: "T = 双向；V = 单向；CW-R = 顺时针；CCW-L = 逆时针；▲汽车客户：20转/分钟（特殊除外）",
  air_pull_cord: "RD-V109阻尼器，全部用DG4200D润滑油（相对较稀）",
};

export interface ParsedCustomerName {
  name: string;
  isAuto: boolean;
  hasChanged: boolean;
}

/** 标准状态对应的 Tag 颜色 */
export function standardStatusColor(status: StandardStatus): string {
  switch (status) {
    case "published":
      return "green";
    case "pending_review":
      return "gold";
    case "deleted":
    case "archived":
    case "obsolete":
      return "default";
    default:
      return "blue";
  }
}

/**
 * 解析客户名中的历史标记符号：
 * - ▲ = 汽车客户（测试条件 20转/分钟，特殊除外）
 * - * = 有新增或改动
 * 去掉这些尾部符号，返回干净名称与标记位。
 */
export function parseCustomerName(raw: string): ParsedCustomerName {
  const value = raw ?? "";
  return {
    name: value.replace(/[▲*]/g, "").trim(),
    isAuto: value.includes("▲"),
    hasChanged: value.includes("*"),
  };
}

export function getStandardPublicationNotice(
  record: Pick<StandardListItem, "customer" | "status" | "publishedAt" | "reviewedAt" | "hasPreviousPublication">,
  now = Date.now(),
): StandardPublicationNotice {
  const publishedAt = Date.parse(record.publishedAt || "");
  const age = now - publishedAt;
  if (record.status === "published" && Number.isFinite(Date.parse(record.reviewedAt || "")) && age >= 0 && age <= 14 * 24 * 60 * 60 * 1000) {
    return record.hasPreviousPublication ? "changed" : "new";
  }
  return parseCustomerName(record.customer).hasChanged ? "changed" : null;
}
