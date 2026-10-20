import { standardTypeDisplayLabel } from "./standardFormat";
import type { StandardCategory } from "../types/standard";
import type { StandardOutputValue, StandardPrintProduct, StandardSpecField } from "../types/standardPrint";
import { STANDARD_STATUS_LABELS } from "../types/standard";
import { activeStandardFields } from "./standardFieldGroups";

export function standardOutputDate(value: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "";
}

function values(rows: [string, string, unknown][]): StandardOutputValue[] {
  return rows.map(([key, label, value]) => ({ key, label, value: String(value ?? "") }));
}

export function standardIdentityValues({ standard, version: v }: StandardPrintProduct): StandardOutputValue[] {
  const rows: [string, string, unknown][] = [["serialNo", "序号", standard.serialNo], ["categoryKey", "产品分类", v.categoryName || standard.categoryName || v.categoryKey], ["customer", "客户名", v.customer], ["model", "产品型号", v.model]];
  if (v.categoryKey !== "sanitary_damper") rows.push(["vehicleModel", "项目代号", v.vehicleModel], ["customerPartNo", "客户料号", v.customerPartNo]);
  rows.push(["versionNo", "版本", `V${v.versionNo}`], ["status", "状态", STANDARD_STATUS_LABELS[v.status]], ["standardType", "标准性质", standardTypeDisplayLabel(v.standardType,v.status)]);
  return values(rows);
}

export function standardAuditValues({ version: v }: StandardPrintProduct): StandardOutputValue[] {
  return values([["createdBy", "创建人", v.createdBy], ["createdAt", "创建时间", standardOutputDate(v.createdAt)],
    ["submittedBy", "提交人", v.submittedBy], ["submittedAt", "提交时间", standardOutputDate(v.submittedAt)],
    ["assignedReviewerName", "指定审核人", v.assignedReviewerName], ["reviewedBy", "审核人", v.reviewedBy],
    ["reviewedAt", "审核时间", standardOutputDate(v.reviewedAt)], ["reviewComment", "审核意见", v.reviewComment],
    ["publishedAt", "发布时间", standardOutputDate(v.publishedAt)], ["updatedBy", "最后更新人", v.updatedBy], ["updatedAt", "最后更新时间", standardOutputDate(v.updatedAt)]]);
}

export function standardSpecificationFields(products: StandardPrintProduct[], category: StandardCategory | undefined): StandardSpecField[] {
  const fields = new Map<string, string>();
  for (const { version } of products) {
    for (const field of activeStandardFields(category, version.fields)) fields.set(field.key, field.group ? `${field.group} · ${field.label}` : field.label);
    for (const key of Object.keys(version.fields)) if (!fields.has(key)) fields.set(key, key === "winter_test_standard" ? "冬季测试标准" : key === "test_standard" ? "夏季／常规测试标准" : key);
  }
  return [...fields].map(([key, label]) => ({ key, label }));
}
