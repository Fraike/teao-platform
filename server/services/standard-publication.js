import { isStandardFieldApplicable, seasonalStandardFields, standardBusinessFields } from "./standard-fields.js";
export function publicationSections(standard, version, category) {
  const fields = standardBusinessFields(standard.categoryKey, version.fields || {});
  const paired = !fields.part_type && Object.keys(fields).some(key => /^(lid|seat)_/.test(key));
  const definitions = seasonalStandardFields(category?.fields).filter(field => isStandardFieldApplicable(standard.categoryKey, field.key)
    && (!field.variant || field.variant === (paired ? "paired" : "component")));
  const labels = new Map([["test_standard", "夏季／常规测试标准"], ["winter_test_standard", "冬季测试标准"], ...definitions.map(field => [field.key, field.label])]);
  const keys = [...new Set([...definitions.map(field => field.key), ...Object.keys(fields)])]
    .filter(key => key !== "winter_test_standard" || String(fields[key] ?? "").trim());
  const parameters = keys.map(key => [labels.get(key) || key, fields[key]]);
  return [{ title: "完整标准参数", rows: parameters }];
}

function cell(value) {
  return String(value === undefined || value === null || value === "" ? "—" : value).replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/[|*`_~<>\[\]]/g, character => `\\${character}`).replace(/\t/g, " ");
}

export function buildStandardPublicationMessages(standard, version, category, options = {}) {
  const identity = [standard.serialNo, `V${version.versionNo}`]
    .map(value => [...String(value === undefined || value === null || value === "" ? "—" : value).replace(/[\r\n]/g, " ")].slice(0, 40).join("")).join(" / ");
  const heading = `# ${options.directPublish ? "产品标准已发布" : "产品标准审核通过 · 已发布"}\n\n**${cell(identity)}**\n\n`;
  const limit = 4096 - 160;
  const packets = []; let current = heading;
  const flush = () => { if (current !== heading) packets.push(current.trimEnd()); current = heading; };
  for (const section of publicationSections(standard, version, category, options)) {
    const header = `## ${section.title}\n\n| 属性 | 标准内容 |\n| --- | --- |\n`;
    let needsHeader = true;
    for (const [label, value] of section.rows) {
      let continuation = false;
      for (const line of String(value === undefined || value === null || value === "" ? "—" : value).replace(/\r\n?/g, "\n").split("\n")) {
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
  const messages = [{ type: "text", content: `【${options.directPublish ? "产品标准已发布" : "产品标准审核通过 · 已发布"}】${identity}`, mentions: ["@all"] }];
  packets.forEach((content, index) => messages.push({ type: "markdown_v2", content: `${content}\n\n> 第${index + 1}/${packets.length}部分` }));
  return messages;
}

export function buildStandardPublication(standard, version, category, options = {}) {
  const lines = [options.directPublish ? "【产品标准已发布】" : "【产品标准审核通过 · 已发布】",
    `${standard.serialNo} / V${version.versionNo}`, "", "【完整标准参数】"];
  for (const section of publicationSections(standard, version, category)) {
    for (const [label, value] of section.rows) lines.push(`${label}：${value ?? "—"}`);
  }
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
