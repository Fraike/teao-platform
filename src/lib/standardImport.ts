import type { StandardType } from "../types/standard";
import { firstCommentDate } from "./standardCommentDate.ts";

import type { StandardImportRowRecord } from "../types/standardImport";

// 主表 4 个分类的标题 → 分类 key（锁类在 Excel 里写「锁类、同步器」，系统内规范名「锁类·同步器」）
const CATEGORY_TITLES: Record<string, string> = {
  齿形阻尼器: "gear_damper",
  齿轮阻尼器: "gear_damper",
  齿条阻尼器: "rack_damper",
  筒型阻尼器: "barrel_damper",
  "锁类、同步器": "lock_sync",
  "锁类·同步器": "lock_sync",
  空气拉绳阻尼器: "air_pull_cord",
  空气拉柄阻尼器: "air_pull_handle",
};

interface CategoryColumnMap {
  key: string;
  // 列索引 → 字段 key（0=序号 1=客户名 2=型号 3=客户料号 为共通列）
  fields: Record<number, string>;
}

const CATEGORY_COLUMNS: Record<string, CategoryColumnMap> = {
  gear_damper: {
    key: "gear_damper",
    fields: { 4: "torque_standard", 5: "test_standard", 6: "marking", 7: "gear_spec", 9: "remark" },
  },
  barrel_damper: {
    key: "barrel_damper",
    fields: { 4: "torque_standard", 5: "test_standard", 6: "marking", 7: "rib_return", 9: "remark" },
  },
  rack_damper: {
    key: "rack_damper",
    fields: { 4: "torque_standard", 5: "test_standard", 6: "marking", 7: "torque_direction", 8: "lock_direction", 9: "remark" },
  },
  lock_sync: {
    key: "lock_sync",
    fields: { 4: "torque_standard", 5: "test_standard", 6: "marking", 7: "spring", 8: "lock_direction", 9: "remark" },
  },
  air_pull_cord: {
    key: "air_pull_cord",
    fields: {
      4: "torque_standard",
      5: "test_standard",
      6: "marking",
      7: "clip",
      9: "seat",
      10: "axis_core",
      11: "spring",
      13: "pull_cord",
      15: "remark",
    },
  },
  air_pull_handle: {
    key: "air_pull_handle",
    fields: { 4: "torque_standard", 5: "test_standard", 6: "marking", 7: "material", 15: "remark" },
  },
};

// Explicit headers override the legacy positional template, including moved columns.
const FIELD_HEADERS: Record<string, string[]> = {
  torque_standard: ["扭矩标准"],
  test_standard: ["测试标准", "测试范围", "夏季测试标准", "夏季测试范围", "夏季／常规测试标准", "夏季/常规测试标准", "常规测试标准"],
  winter_test_standard: ["冬季测试标准", "冬季测试范围"],
  marking: ["打码", "喷码", "打点颜色/喷码", "打码/喷码", "打点颜色"],
  gear_spec: ["齿轮规格"], rib_return: ["筋条是否归位"], torque_direction: ["扭矩方向"],
  lock_direction: ["装锁方向"], spring: ["弹簧"], clip: ["扣件"], seat: ["下座"],
  axis_core: ["轴芯"], pull_cord: ["拉绳"], material: ["物料"], remark: ["备注"], import_note: ["附加说明"],
};

function applyColumnHeaders(row: unknown[], category: CategoryColumnMap): CategoryColumnMap {
  const explicit: Record<number, string> = {};
  row.forEach((cell, column) => {
    if (column < 4) return;
    const label = toCellText(cell).replace(/\s/g, "");
    const match = Object.entries(FIELD_HEADERS).find(([key, aliases]) =>
      (key === "winter_test_standard" || key === "lock_direction" || Object.values(CATEGORY_COLUMNS[category.key].fields).includes(key))
      && aliases.some(alias => label === alias || label.startsWith(`${alias}（`) || label.startsWith(`${alias}(`)
        || label === `${alias}gf.cm`));
    if (match) explicit[column] = match[0];
  });
  const mappedKeys = new Set(Object.values(explicit));
  const fallback = Object.fromEntries(Object.entries(category.fields).filter(([column, key]) =>
    !mappedKeys.has(key) && !Object.hasOwn(explicit, column)));
  return { ...category, fields: { ...fallback, ...explicit } };
}

function toCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  // 数值型文本（如料号被读成 340038321.0）去掉多余的 .0
  const integerLike = text.match(/^(\d+)\.0+$/);
  return integerLike ? integerLike[1] : text;
}

function detectStandardType(row: unknown[]): StandardType {
  const texts = row.map(toCellText);
  if (texts.some((text) => text.includes("临时标准"))) return "temporary";
  if (texts.some((text) => text.includes("新增序号"))) return "new_pending";
  return "formal";
}

interface ImportOptions {
  // 与 sheet_to_json({ header: 1, range: 0 }) 一起使用，保持工作表绝对行号。
  comments?: { row: number; column: number; cell: string; author: string; text: string }[];
  mergedRanges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

function mergedProductSources(rows: unknown[][], options: ImportOptions): Map<number, Map<number, number>> {
  const sources = new Map<number, Map<number, number>>();
  for (const { s, e } of options.mergedRanges ?? []) {
    // 横纵合并只共享锚列；序号不填充，不把标题或说明变成产品。
    if (s.c < 1 || s.r >= e.r || !/^SP/i.test(toCellText(rows[s.r]?.[0]))) continue;
    for (let row = s.r + 1; row <= Math.min(e.r, rows.length - 1); row++) {
      if (!/^SP/i.test(toCellText(rows[row]?.[0]))) break;
      const columns = sources.get(row) ?? new Map<number, number>();
      columns.set(s.c, s.r);
      sources.set(row, columns);
    }
  }
  return sources;
}

function expandedProductRow(row: unknown[], rowIndex: number, rows: unknown[][], sources: Map<number, Map<number, number>>): unknown[] {
  const expanded = [...row];
  for (const [column, anchorRow] of sources.get(rowIndex) ?? []) {
    if (!toCellText(expanded[column])) expanded[column] = rows[anchorRow]?.[column];
  }
  return expanded;
}

function importFields(row: unknown[], category: CategoryColumnMap): Record<string, string> {
  const fields: Record<string, string> = {};
  const notes: string[] = [];
  row.forEach((cell, col) => {
    if (col < 4) return;
    const value = toCellText(cell);
    if (!value) return;
    const key = category.fields[col];
    if (key) {
      fields[key] = value;
    } else {
      const note = value.replace(/临时标准|新增序号/g, "").trim();
      if (note) notes.push(note);
    }
  });
  if (notes.length) fields.import_note = notes.join("\n");
  return fields;
}

export function parseStandardImportRows(rows: unknown[][], options: ImportOptions = {}): {
  records: StandardImportRowRecord[];
  errors: string[];
  warnings: string[];
} {
  const records: StandardImportRowRecord[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const mergedSources = mergedProductSources(rows, options);
  const commentsByRow = new Map<number, NonNullable<ImportOptions["comments"]>>();
  for (const comment of options.comments ?? []) {
    const group = commentsByRow.get(comment.row);
    if (group) group.push(comment);
    else commentsByRow.set(comment.row, [comment]);
  }
  let current: CategoryColumnMap | null = null;

  for (const [rowIndex, sourceRow] of rows.entries()) {
    if (!Array.isArray(sourceRow)) continue;
    const row = expandedProductRow(sourceRow, rowIndex, rows, mergedSources);
    const col0 = toCellText(row[0]);

    // 分类标题行：首列命中分类名、次列为空
    const heading = row.slice(0, 4).map(toCellText).filter(Boolean);
    const titleKey = heading.length === 1 ? CATEGORY_TITLES[heading[0]] : undefined;
    if (titleKey) {
      current = { ...CATEGORY_COLUMNS[titleKey], fields: { ...CATEGORY_COLUMNS[titleKey].fields } };
      continue;
    }

    if (!current) continue;
    // 跳过表头行（序号）
    if (col0 === "序号") {
      current = applyColumnHeaders(row, current);
      continue;
    }

    const serialNo = col0;
    // 数据行的序号均以 SP 开头；其它（如段落备注）跳过
    if (!serialNo || !/^SP/i.test(serialNo)) continue;

    const fields = importFields(row, current);
    if (row.some((cell) => toCellText(cell).includes("作废"))) {
      warnings.push(`Excel 第 ${rowIndex + 1} 行（${serialNo}）含作废标记，请重点核查；服务端将按完整身份校验，确认的作废标准导入为停用，其他作废项阻止发布。`);
    }

    const labels: Record<string, string> = { serial_no: "序号", customer: "客户名", model: "型号", customer_part_no: "客户料号", torque_standard: "扭矩标准", test_standard: "测试范围", winter_test_standard: "冬季测试标准", marking: "打码/喷码", gear_spec: "齿轮规格", torque_direction: "扭矩方向", lock_direction: "装锁方向", rib_return: "筋条是否归位", spring: "弹簧", clip: "扣件", seat: "下座", axis_core: "轴芯", pull_cord: "拉绳", material: "物料", remark: "备注", import_note: "附加说明" };
    const rowComments = [...(commentsByRow.get(rowIndex) ?? [])];
    for (const [column, anchorRow] of mergedSources.get(rowIndex) ?? []) {
      rowComments.push(...(commentsByRow.get(anchorRow) ?? []).filter(c => c.column === column));
    }
    const comments = rowComments.map(c => {
      const fieldKey = ["serial_no", "customer", "model", "customer_part_no"][c.column] || current?.fields[c.column] || "import_note";
      const text = c.text.split("\0")[0].trim();
      return { fieldKey, fieldLabel: labels[fieldKey] || fieldKey, author: c.author, text, cell: c.cell, changedAt: firstCommentDate(text) };
    }).filter(c=>c.text);
    records.push({
      sourceRow: rowIndex + 1,
      ...(comments.length ? {comments} : {}),
      serialNo,
      customer: toCellText(row[1]),
      model: toCellText(row[2]),
      customerPartNo: toCellText(row[3]),
      categoryKey: current.key,
      standardType: detectStandardType(row),
      fields,
    });
  }

  if (records.length === 0) {
    errors.push("未识别到可导入的标准记录");
  }

  return { records, errors, warnings };
}
