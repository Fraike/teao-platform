import { isStandardFieldApplicable, seasonalStandardFields, standardBusinessFields } from "./standard-fields.js";
const TYPES = { formal: "正式标准", temporary: "临时标准", new_pending: "新增待定" };

export function publicationSections(standard, version, category, { comment = "", reviewerName = "", directPublish = false } = {}) {
  const basic = [["标准序号", standard.serialNo], ["标准版本", `V${version.versionNo}`], ["产品分类", standard.categoryName || standard.categoryKey], ["客户名称", version.customer], ["产品型号", version.model]];
  if (standard.categoryKey !== "sanitary_damper") basic.push(["项目代号", version.vehicleModel], ["客户料号", version.customerPartNo]);
  basic.push(["标准性质", TYPES[version.standardType] || version.standardType]);
  const fields = standardBusinessFields(standard.categoryKey, version.fields || {});
  const paired = !fields.part_type && Object.keys(fields).some(key => /^(lid|seat)_/.test(key));
  const definitions = seasonalStandardFields(category?.fields).filter(field => isStandardFieldApplicable(standard.categoryKey, field.key)
    && (!field.variant || field.variant === (paired ? "paired" : "component")));
  const labels = new Map([["test_standard", "夏季／常规测试标准"], ["winter_test_standard", "冬季测试标准"], ...definitions.map(field => [field.key, field.label])]);
  const keys = [...new Set([...definitions.map(field => field.key), ...Object.keys(fields)])]
    .filter(key => key !== "winter_test_standard" || String(fields[key] ?? "").trim());
  const parameters = keys.map(key => [labels.get(key) || key, fields[key]]);
  const audit = [["发布方式", directPublish ? "管理员直接发布" : "审核通过发布"], ["提交人", version.submittedBy || version.createdBy],
    [directPublish ? "发布人" : "审核人", reviewerName || version.reviewedBy || version.updatedBy],
    ["发布时间", version.publishedAt ? new Date(version.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—"], ["审核意见", directPublish ? "无需审核" : comment || version.reviewComment || "无"]];
  const sections = [{ title: "基本信息", rows: basic }, { title: "完整标准参数", rows: parameters }, { title: "审核与发布记录", rows: audit }];
  const notes = (standard.sourceComments || []).filter(note => note.versionId === version.id);
  if (notes.length) sections.push({ title: "原始批注（供追溯）", rows: notes.map(note => [note.fieldLabel || note.fieldKey || note.sourceCell, `${note.author ? `${note.author}：` : ""}${note.text}`]) });
  return sections;
}

function cell(value) {
  return String(value || "—").replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/[|*`_~<>\[\]]/g, character => `\\${character}`).replace(/\t/g, " ");
}

export function buildStandardPublicationMessages(standard, version, category, options = {}) {
  const identity = [standard.serialNo, version.model, `V${version.versionNo}`]
    .map(value => [...String(value || "—").replace(/[\r\n]/g, " ")].slice(0, 40).join("")).join(" / ");
  const heading = `# 产品标准发布通知\n\n**${cell(identity)}**\n\n`;
  const limit = 4096 - 160;
  const packets = []; let current = heading;
  const flush = () => { if (current !== heading) packets.push(current.trimEnd()); current = heading; };
  for (const section of publicationSections(standard, version, category, options)) {
    const header = `## ${section.title}\n\n| 属性 | 标准内容 |\n| --- | --- |\n`;
    let needsHeader = true;
    for (const [label, value] of section.rows) {
      let continuation = false;
      for (const line of String(value || "—").replace(/\r\n?/g, "\n").split("\n")) {
        // Split values before constructing rows; every continuation remains a valid table row.
        for (const rawChunk of splitStandardPublication(line || "—", 450)) {
          const chunk = cell(rawChunk);
          const row = `| ${cell(label)}${continuation ? "（续）" : ""} | ${chunk} |\n`;
          if (Buffer.byteLength(current + (needsHeader ? header : "") + row, "utf8") > limit) { flush(); needsHeader = true; }
          if (Buffer.byteLength(heading + header + row, "utf8") > limit) throw new Error("标准属性名称过长，无法生成群表格");
          if (needsHeader) { current += header; needsHeader = false; }
          current += row; continuation = true;
        }
      }
    }
    current += "\n";
  }
  flush();
  const messages = [{ type: "text", content: `【产品标准发布】${identity}\n${options.directPublish ? "管理员已发布" : "已审核通过并发布"}，请查看下方完整属性表格，按系统当前已发布版本执行。`, mentions: ["@all"] }];
  packets.forEach((content, index) => messages.push({ type: "markdown_v2", content: `${content}\n\n> 第${index + 1}/${packets.length}部分 · 以系统当前已发布版本为准。` }));
  return messages;
}

export function buildStandardPublication(standard, version, category, { comment = "", reviewerName = "" }) {
  const lines = ["【产品标准审核通过 · 已发布】",
    `序号：${standard.serialNo}　版本：V${version.versionNo}`,
    `分类：${standard.categoryName || standard.categoryKey}`,
    `客户：${version.customer || "—"}`, `项目代号：${version.vehicleModel || "—"}`,
    `产品型号：${version.model || "—"}`, `客户料号：${version.customerPartNo || "—"}`,
    `标准性质：${TYPES[version.standardType] || version.standardType || "—"}`, "", "【完整标准参数】"];
  const fields = standardBusinessFields(standard.categoryKey, version.fields || {});
  const paired = !fields.part_type && Object.keys(fields).some(key => /^(lid|seat)_/.test(key));
  const definitions = seasonalStandardFields(category?.fields).filter(field => isStandardFieldApplicable(standard.categoryKey, field.key)
    && (!field.variant || field.variant === (paired ? "paired" : "component")));
  const labels = new Map([["test_standard", "夏季／常规测试标准"], ["winter_test_standard", "冬季测试标准"], ...definitions.map(field => [field.key, field.label])]);
  const keys = [...new Set([...definitions.map(field => field.key), ...Object.keys(fields)])]
    .filter(key => key !== "winter_test_standard" || String(fields[key] ?? "").trim());
  for (const key of keys) lines.push(`${labels.get(key) || key}：${fields[key] || "—"}`);
  const notes = (standard.sourceComments || []).filter(note => note.versionId === version.id);
  if (notes.length) lines.push("", "【原始批注 · 供追溯】", ...notes.map(note => `${note.fieldLabel || note.fieldKey || note.sourceCell}：${note.text}`));
  lines.push("", `提交人：${version.submittedBy || version.createdBy || "—"}`,
    `审核人：${reviewerName || version.reviewedBy || "—"}`,
    `发布时间：${version.publishedAt ? new Date(version.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—"}`,
    `审核意见：${comment || "无"}`, "请相关人员按本次发布标准执行，系统中的已发布版本为准。");
  return lines.join("\n");
}

export function splitStandardPublication(content, limit = 1900) {
  const parts = [];let part = "", bytes = 0;
  for (const character of content) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > limit) { parts.push(part); part = ""; bytes = 0; }
    part += character;bytes += size;
  }
  if (part) parts.push(part);
  return parts;
}
