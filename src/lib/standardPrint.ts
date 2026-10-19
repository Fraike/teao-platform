import type { StandardCategory, StandardDetail, StandardListItem } from "../types/standard";
import { STANDARD_STATUS_LABELS } from "../types/standard";
import type { StandardPrintOptions, StandardPrintProduct } from "../types/standardPrint";
import { activeStandardFields } from "./standardFieldGroups";
import { STANDARD_CATEGORY_NOTES } from "./standardFormat";
import { standardIdentityValues, standardOutputDate } from "./standardOutputFields";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function table(title: string, rows: [string, unknown][]): string {
  return `<table><caption>${escapeHtml(title)}</caption><thead><tr><th>属性</th><th>标准内容</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`).join("")}</tbody></table>`;
}

function productHtml({ standard, version: v }: StandardPrintProduct, category: StandardCategory | undefined): string {
  const basic = standardIdentityValues({ standard, version: v }).map(field => [field.label, field.value] as [string, unknown]);
  const parameters = activeStandardFields(category, v.fields).filter(field => field.key !== "import_note" && v.fields[field.key]?.trim())
    .map(field => [field.group ? `${field.group} · ${field.label}` : field.label, v.fields[field.key]] as [string, unknown]);
  const warning = v.status === "published" ? "" : `<p class="warning">${escapeHtml(STANDARD_STATUS_LABELS[v.status])}：${v.status === "obsolete" || v.status === "archived" ? "仅供历史追溯，不可用于生产。" : "尚未生效，不可用于生产。"}</p>`;
  return `<section class="product"><h2>${escapeHtml(standard.serialNo)} · ${escapeHtml(v.model)} <span>V${v.versionNo} · ${escapeHtml(STANDARD_STATUS_LABELS[v.status])}</span></h2>${warning}${table("基本信息", basic)}${parameters.length ? table("生产规格", parameters) : ""}</section>`;
}

export function buildStandardPrintHtml(products: StandardPrintProduct[], categories: StandardCategory[], options: StandardPrintOptions): string {
  const groups = new Map<string, StandardPrintProduct[]>();
  for (const product of products) {
    const key = product.version.categoryKey;
    const group = groups.get(key) || [];group.push(product);groups.set(key, group);
  }
  const content = [...groups].map(([key, entries]) => {
    const category = categories.find(item => item.key === key);
    const note = STANDARD_CATEGORY_NOTES[key];
    return `<div class="category"><h1>${escapeHtml(category?.name || entries[0].version.categoryName || key)}</h1>${note ? `<p class="category-note">${escapeHtml(note)}</p>` : ""}${entries.map(product => productHtml(product, category)).join("")}</div>`;
  }).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>产品标准 · 打印</title><link id="print-styles" rel="stylesheet" href="${escapeHtml(options.styleUrl)}"></head><body><nav class="print-controls"><button id="print-document" disabled>打印 / 保存 PDF</button><span id="print-ready">正在加载打印样式…</span></nav><header><h1>产品标准汇编</h1><p>特澳科技 · TA-WI-ZP-10 · 共 ${products.length} 条 · 打印时间：${escapeHtml(standardOutputDate(options.generatedAt))}</p><p>本文件为打印时的数据快照。生产执行以系统当前已发布版本为准。</p></header>${content}<footer>产品标准汇编 · 特澳科技 · 共 ${products.length} 条</footer></body></html>`;
}

export async function loadStandardPrintProducts(rows: StandardListItem[], read: (id: string, signal: AbortSignal) => Promise<StandardDetail>, signal: AbortSignal, onProgress?: (done: number) => void): Promise<StandardPrintProduct[]> {
  const result = new Array<StandardPrintProduct>(rows.length);
  let next = 0, done = 0, failed = false;
  async function worker() {
    while (!failed && next < rows.length) {
      signal.throwIfAborted();
      const index = next++, row = rows[index];
      try {
        const detail = await read(row.id, signal);signal.throwIfAborted();
        const version = detail.versions[0];
        if (!version || version.versionNo !== row.versionNo || version.status !== row.status) throw new Error(`${row.serialNo} 的版本或状态已变化，请刷新列表后重新选择`);
        result[index] = { standard: detail, version };done++;onProgress?.(done);
      } catch (error) { failed = true;throw error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  return result;
}
