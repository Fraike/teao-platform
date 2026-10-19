import type { CellObject, WorkBook, WorkSheet } from "xlsx";
import type { StandardCategory } from "../types/standard";
import type { StandardPrintProduct } from "../types/standardPrint";
import { standardAuditValues, standardIdentityValues, standardOutputDate, standardSpecificationFields } from "./standardOutputFields";
import { STANDARD_CATEGORY_NOTES } from "./standardFormat";

function commentParts(text: string): string[] {
  const parts: string[] = [];let current = "";
  for (const character of text) {
    if (current.length + character.length > 30000) { parts.push(current);current = ""; }
    current += character;
  }
  parts.push(current);return parts;
}

function sheetName(name: string, used: string[]): string {
  const base = name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "产品标准";
  let candidate = base, index = 2;
  while (used.some(value => value.toLocaleLowerCase() === candidate.toLocaleLowerCase())) {
    const suffix = `(${index++})`;candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  return candidate;
}

function attachComments(sheet: WorkSheet, products: StandardPrintProduct[], identityKeys: string[], specKeys: string[], encode: (cell: { r: number; c: number }) => string) {
  products.forEach((product, index) => {
    for (const note of product.standard.sourceComments || []) {
      if (note.versionId !== product.version.id) continue;
      const spec = specKeys.indexOf(note.fieldKey);
      const column = spec < 0 ? identityKeys.indexOf(note.fieldKey) : identityKeys.length + spec;
      if (column < 0) continue;
      const address = encode({ r: index + 1, c: column });
      const cell: CellObject = sheet[address] || (sheet[address] = { t: "s", v: "" });
      const comments = cell.c ||= [];
      if (note.text.length + comments.reduce((size, comment) => size + (comment.t?.length || 0), 0) > 30000) {
        cell.c = [{ a: "产品标准", t: "此属性批注较长，完整内容已分段保留在“原始批注”工作表。" }];
      } else comments.push({ a: (note.author || "Excel").slice(0, 54), t: note.text });
    }
  });
}

export async function buildStandardWorkbook(products: StandardPrintProduct[], categories: StandardCategory[], generatedAt: string): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const groups = new Map<string, StandardPrintProduct[]>();
  for (const product of products) {
    const group = groups.get(product.version.categoryKey) || [];group.push(product);groups.set(product.version.categoryKey, group);
  }
  for (const [key, group] of groups) {
    const category = categories.find(item => item.key === key);
    const identity = standardIdentityValues(group[0]), audit = standardAuditValues(group[0]);
    const specs = standardSpecificationFields(group, category);
    const reserved = new Set([...identity, ...audit].map(field => field.label));
    const headers = [...identity.map(field => field.label), ...specs.map(field => reserved.has(field.label) ? `规格 · ${field.label}` : field.label), ...audit.map(field => field.label)];
    const rows = group.map(product => [...standardIdentityValues(product).map(field => field.value), ...specs.map(field => product.version.fields[field.key] ?? ""), ...standardAuditValues(product).map(field => field.value)]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
    sheet["!cols"] = headers.map(label => ({ wch: /备注|说明|规格|意见/.test(label) ? 40 : 22 }));
    attachComments(sheet, group, identity.map(field => field.key), specs.map(field => field.key), XLSX.utils.encode_cell);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName(category?.name || group[0].version.categoryName || key, workbook.SheetNames));
  }
  const notes = products.flatMap(({ standard, version }) => (standard.sourceComments || []).filter(note => note.versionId === version.id)
    .flatMap(note => {
      const parts = commentParts(note.text);
      return parts.map((part, index) => [standard.serialNo, version.customer, version.model, `V${version.versionNo}`, note.fieldLabel || note.fieldKey, note.sourceCell || "", note.author || "", part, note.changedAt || "", `${index + 1}/${parts.length}`]);
    }));
  if (notes.length) {
    const sheet = XLSX.utils.aoa_to_sheet([["序号", "客户名", "产品型号", "版本", "属性", "原单元格", "批注作者", "批注内容", "批注日期", "分段"], ...notes]);
    sheet["!cols"] = [20, 24, 24, 10, 25, 12, 20, 65, 22, 10].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName("原始批注", workbook.SheetNames));
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["产品标准全规格导出", "特澳科技 · TA-WI-ZP-10"], ["导出时间", standardOutputDate(generatedAt)], ["产品数量", products.length],
    ["使用说明", "本文件为导出时的数据快照，生产执行以系统当前已发布版本为准。草稿、待审核、停用标准不可用于生产。"],
    ...[...groups.keys()].filter(key => STANDARD_CATEGORY_NOTES[key]).map(key => [categories.find(category => category.key === key)?.name || key, STANDARD_CATEGORY_NOTES[key]])]), sheetName("导出说明", workbook.SheetNames));
  workbook.Props = { Title: "产品标准全规格导出", Author: "特澳科技", CreatedDate: new Date(generatedAt) };
  return workbook;
}

export async function exportStandardExcel(products: StandardPrintProduct[], categories: StandardCategory[], signal: AbortSignal) {
  const generatedAt = new Date().toISOString();
  const workbook = await buildStandardWorkbook(products, categories, generatedAt);
  const XLSX = await import("xlsx");signal.throwIfAborted();
  XLSX.writeFile(workbook, `产品标准-${generatedAt.replace(/[:.]/g, "-")}.xlsx`, { compression: true });
}
