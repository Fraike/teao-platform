import { parseNum, parseRate, extractDateStr } from "./vika.js";
import { writeGeneratedReport } from "../config.js";
import { fetchVikaRecords } from "./vika.js";
import { getAssemblyEntriesForDate, getInjectionEntriesForDate } from "./production-store.js";

// ---- aggregation ----

export function aggregateAssembly(records, dateStr) {
  const filtered = records.filter((r) => {
    const d = extractDateStr(r.fields["日期"]) || extractDateStr(r.fields["创建时间"]);
    return d === dateStr;
  });

  const lines = new Map();
  for (const r of filtered) {
    const lineName = r.fields["产线"] || "未知产线";
    if (!lines.has(lineName)) {
      lines.set(lineName, {
        line: lineName,
        products: [],
        totalPlan: 0,
        totalActual: 0,
        totalDefects: 0,
        totalBackorder: 0,
        recordCount: 0,
      });
    }
    const line = lines.get(lineName);
    const planQty = parseNum(r.fields["计划生产数量"]);
    const actualQty = parseNum(r.fields["当天生产数量"]);
    const defects = parseNum(r.fields["不良数"]);
    const backorder = parseNum(r.fields["订单累计欠数"]);
    line.products.push({
      date: extractDateStr(r.fields["日期"]) || extractDateStr(r.fields["创建时间"]) || dateStr,
      name: r.fields["品名"] || "-",
      spec: r.fields["规格"] || "-",
      customer: r.fields["客户名称"] || "-",
      planQty,
      actualQty,
      achievementRate: parseRate(r.fields["计划达成率"]),
      defects,
      qualifiedRate: parseRate(r.fields["合格率"]),
      backorder,
      batchNo: r.fields["生产批号"] || "-",
      remark: r.fields["备注"] || "",
    });
    line.totalPlan += planQty;
    line.totalActual += actualQty;
    line.totalDefects += defects;
    line.totalBackorder += backorder;
    line.recordCount++;
  }

  const lineList = Array.from(lines.values());
  const summary = {
    lines: lineList.length,
    totalPlanQty: lineList.reduce((s, l) => s + l.totalPlan, 0),
    totalActualQty: lineList.reduce((s, l) => s + l.totalActual, 0),
    totalDefects: lineList.reduce((s, l) => s + l.totalDefects, 0),
    totalBackorder: lineList.reduce((s, l) => s + l.totalBackorder, 0),
    avgAchievementRate:
      lineList.length > 0
        ? lineList.reduce((s, l) => s + (l.totalPlan > 0 ? l.totalActual / l.totalPlan : 0), 0) / lineList.length
        : 0,
    avgQualifiedRate:
      lineList.length > 0
        ? lineList.reduce((s, l) => {
            const total = l.totalActual + l.totalDefects;
            return s + (total > 0 ? l.totalActual / total : 1);
          }, 0) / lineList.length
        : 0,
  };

  return { records: lineList, summary, rawCount: filtered.length };
}

export function aggregateInjection(records, dateStr) {
  const filtered = records.filter((r) => {
    const d = extractDateStr(r.fields["日期"]);
    return d === dateStr;
  });

  const machines = new Map();
  for (const r of filtered) {
    const machine = r.fields["机台"] || "未知机台";
    const shift = r.fields["班次"] || "-";
    const key = `${machine}-${shift}`;
    if (!machines.has(key)) {
      machines.set(key, {
        machine,
        shift,
        products: [],
        totalQty: 0,
        totalDefects: 0,
        totalBackorder: 0,
        recordCount: 0,
      });
    }
    const m = machines.get(key);
    const actualQty = parseNum(r.fields["当天生产数量"]);
    const defects = parseNum(r.fields["不良数"]);
    const backorder = parseNum(r.fields["订单累计欠数"]);
    m.products.push({
      date: extractDateStr(r.fields["日期"]) || dateStr,
      name: r.fields["品名/型号"] || "-",
      material: r.fields["原材料"] || "-",
      planQty: parseNum(r.fields["订单数量"]),
      actualQty,
      defects,
      qualifiedRate: parseRate(r.fields["合格率"]),
      backorder,
      batchNo: r.fields["半成品生产批号"] || "-",
      operator: r.fields["操作人"] || "-",
      remark: r.fields["备注"] || "",
    });
    m.totalQty += actualQty;
    m.totalDefects += defects;
    m.totalBackorder += backorder;
    m.recordCount++;
  }

  const machineList = Array.from(machines.values());
  const totalQty = machineList.reduce((s, m) => s + m.totalQty, 0);
  const totalDefects = machineList.reduce((s, m) => s + m.totalDefects, 0);
  const summary = {
    machines: machineList.length,
    totalQty,
    totalDefects,
    totalBackorder: machineList.reduce((s, m) => s + m.totalBackorder, 0),
    avgQualifiedRate:
      machineList.length > 0
        ? machineList.reduce((s, m) => {
            const total = m.totalQty + m.totalDefects;
            return s + (total > 0 ? m.totalQty / total : 1);
          }, 0) / machineList.length
        : 0,
  };

  return { records: machineList, summary, rawCount: filtered.length };
}

function aggregateLocalAssembly(records) {
  const lines = new Map();
  for (const record of records) {
    if (!lines.has(record.line)) {
      lines.set(record.line, {
        line: record.line,
        products: [],
        totalPlan: 0,
        totalActual: 0,
        totalDefects: 0,
        totalBackorder: 0,
        recordCount: 0,
      });
    }
    const line = lines.get(record.line);
    line.products.push({
      date: record.date,
      name: record.productName,
      spec: record.spec || "-",
      customer: record.customer || "-",
      planQty: record.planQty,
      actualQty: record.dailyQty,
      achievementRate: record.achievementRate,
      defects: record.defects,
      qualifiedRate: record.qualifiedRate,
      backorder: record.backorder,
      batchNo: record.productionBatch || "-",
      remark: record.remark || "",
    });
    line.totalPlan += record.planQty || 0;
    line.totalActual += record.dailyQty || 0;
    line.totalDefects += record.defects || 0;
    line.totalBackorder += record.backorder || 0;
    line.recordCount++;
  }

  const lineList = Array.from(lines.values());
  const totalActualQty = lineList.reduce((sum, line) => sum + line.totalActual, 0);
  const totalDefects = lineList.reduce((sum, line) => sum + line.totalDefects, 0);
  const totalPlanQty = lineList.reduce((sum, line) => sum + line.totalPlan, 0);
  return {
    records: lineList,
    summary: {
      lines: lineList.length,
      totalPlanQty,
      totalActualQty,
      totalDefects,
      totalBackorder: lineList.reduce((sum, line) => sum + line.totalBackorder, 0),
      avgAchievementRate: totalPlanQty > 0 ? totalActualQty / totalPlanQty : null,
      avgQualifiedRate: totalActualQty > 0 ? (totalActualQty - totalDefects) / totalActualQty : null,
    },
    rawCount: records.length,
  };
}

function aggregateLocalInjection(records) {
  const machines = new Map();
  for (const record of records) {
    const key = `${record.machine}-${record.shift}`;
    if (!machines.has(key)) {
      machines.set(key, {
        machine: record.machine,
        shift: record.shift,
        products: [],
        totalQty: 0,
        totalDefects: 0,
        totalBackorder: 0,
        recordCount: 0,
      });
    }
    const machine = machines.get(key);
    machine.products.push({
      date: record.date,
      name: record.productName,
      material: record.material || "-",
      planQty: record.orderQty,
      actualQty: record.dailyQty,
      defects: record.defects,
      qualifiedRate: record.qualifiedRate,
      backorder: record.backorder,
      batchNo: record.batchNo || "-",
      operator: record.operator || "-",
      remark: record.remark || "",
    });
    machine.totalQty += record.dailyQty || 0;
    machine.totalDefects += record.defects || 0;
    machine.totalBackorder += record.backorder || 0;
    machine.recordCount++;
  }

  const machineList = Array.from(machines.values());
  const totalQty = machineList.reduce((sum, machine) => sum + machine.totalQty, 0);
  const totalDefects = machineList.reduce((sum, machine) => sum + machine.totalDefects, 0);
  return {
    records: machineList,
    summary: {
      machines: machineList.length,
      totalQty,
      totalDefects,
      totalBackorder: machineList.reduce((sum, machine) => sum + machine.totalBackorder, 0),
      avgQualifiedRate: totalQty > 0 ? (totalQty - totalDefects) / totalQty : null,
    },
    rawCount: records.length,
  };
}

// ---- WeCom content builder ----

export function buildWecomContent(date, assembly, injection, dataSource = assembly.rateBasis === "internal" ? "internal" : "vika") {
  const lines = [];
  const asm = assembly.summary;
  const inj = injection.summary;
  const internal = assembly.rateBasis === "internal";
  const rateText = (rate, quantity, decimals) => quantity > 0 && Number.isFinite(rate)
    ? `${(rate * 100).toFixed(decimals)}%` : "—";

  lines.push(`## 📊 生产日报 — ${date}`);
  lines.push("");

  const injectionMachineCount = new Set(injection.records.map(m => m.machine)).size;
  lines.push("| 部门 | 产线/机台 | 产量(PCS) | 达成率 | 合格率 | 不良 |");
  lines.push("|------|----------|----------|--------|--------|------|");
  lines.push(`| 装配 | ${asm.lines} 线 | ${asm.totalActualQty.toLocaleString()} | ${rateText(asm.avgAchievementRate, asm.totalActualQty, 0)} | ${rateText(asm.avgQualifiedRate, asm.totalActualQty, 1)} | ${asm.totalDefects} |`);
  lines.push(`| 注塑 | ${injectionMachineCount} 机台(${inj.machines}班次) | ${inj.totalQty.toLocaleString()} | - | ${rateText(inj.avgQualifiedRate, inj.totalQty, 1)} | ${inj.totalDefects} |`);
  lines.push("");

  const extractNum = (s) => {
    const m = String(s).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  const sortedAssembly = [...assembly.records].sort((a, b) => extractNum(a.line) - extractNum(b.line));
  lines.push("### 装配部");
  if (assembly.rawCount === 0) lines.push("> ⚠️ 装配部：无记录，待补充。");
  lines.push("| 产线 | 品名 | 产量 | 不良 |");
  lines.push("|------|------|------|------|");
  for (const line of sortedAssembly) {
    for (const p of line.products) {
      lines.push(`| ${line.line} | ${p.name} | ${p.actualQty.toLocaleString()} | ${p.defects > 0 ? p.defects.toString() : "-"} |`);
    }
  }
  lines.push("");

  const sortedInjection = [...injection.records].sort((a, b) => extractNum(a.machine) - extractNum(b.machine));
  lines.push("### 注塑部");
  if (injection.rawCount === 0) lines.push("> ⚠️ 注塑部：无记录，待补充。");
  lines.push("| 机台 | 品名 | 产量 | 不良 |");
  lines.push("|------|------|------|------|");
  for (const m of sortedInjection) {
    for (const p of m.products) {
      lines.push(`| ${m.machine} | ${p.name} | ${p.actualQty.toLocaleString()} | ${p.defects > 0 ? p.defects.toString() : "-"} |`);
    }
  }
  lines.push("");

  const remarks = [];
  for (const line of sortedAssembly) {
    for (const p of line.products) {
      if (p.remark) remarks.push(`> 🔧 装配-${line.line}（${p.name}）：${p.remark}`);
    }
  }
  for (const m of sortedInjection) {
    for (const p of m.products) {
      if (p.remark) remarks.push(`> 🔧 注塑-${m.machine}${m.shift}（${p.name}）：${p.remark}`);
    }
  }
  if (remarks.length > 0) {
    lines.push("### 📝 产线备注");
    for (const r of remarks) lines.push(r);
    lines.push("");
  }

  const anomalies = [];
  for (const line of sortedAssembly) {
    const total = internal ? line.totalActual : line.totalActual + line.totalDefects;
    const rate = total > 0 ? (internal ? line.totalActual - line.totalDefects : line.totalActual) / total : null;
    if (line.totalActual > 0 && rate < 0.98) anomalies.push(`装配${line.line}合格率偏低(${(rate * 100).toFixed(1)}%)`);
    if (line.totalActual > 0 && line.totalDefects > 50) anomalies.push(`装配${line.line}不良数偏高(${line.totalDefects})`);
  }
  for (const m of sortedInjection) {
    const total = internal ? m.totalQty : m.totalQty + m.totalDefects;
    const rate = total > 0 ? (internal ? m.totalQty - m.totalDefects : m.totalQty) / total : null;
    if (m.totalQty > 0 && rate < 0.995) anomalies.push(`注塑${m.machine}合格率偏低(${(rate * 100).toFixed(1)}%)`);
  }
  if (remarks.length > 0) anomalies.push(`${remarks.length} 条产线备注（停线/异常）`);
  if (!assembly.rawCount) anomalies.push("装配部无记录，待补充");
  if (!injection.rawCount) anomalies.push("注塑部无记录，待补充");

  lines.push("### 📋 昨日总结");
  if (anomalies.length > 0) {
    lines.push(`> ⚠️ 发现 ${anomalies.length} 项异常：`);
    for (const a of anomalies) lines.push(`> - ${a}`);
  } else {
    lines.push("> ✅ 昨日生产正常，无异常");
  }
  lines.push("");

  lines.push(`> 数据来源：${dataSource === "internal" ? "内部平台" : "维格表"} · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  lines.push(`> 详情查阅：[teao.work/production-report](https://teao.work/production-report)`);

  return lines.join("\n");
}

export function buildEmptyContent(date, dataSource = "vika") {
  return [
    `## 📊 生产日报 — ${date}`,
    "",
    "> ⚠️ **暂无生产数据**",
    "> ",
    "> 装配部和注塑部昨日均无生产记录。",
    `> 数据来源：${dataSource === "internal" ? "内部平台" : "维格表"}`,
    "> 请相关人员及时前往生产日报录入页面补充数据！",
    "> ",
    `> 推送时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    "> 录入入口：[teao.work/production-entry](https://teao.work/production-entry)",
  ].join("\n");
}

export function hasProductionData(report) {
  return report.assembly.rawCount > 0 || report.injection.rawCount > 0;
}

export async function fetchAndStoreReport(date) {
  const { getProductionReport } = await import("./production-report-control.js");
  return getProductionReport(date);
}

export async function generateProductionReport(date, config) {
  let assembly;
  let injection;
  if (config.dataSource === "internal") {
    assembly = aggregateLocalAssembly(getAssemblyEntriesForDate(date));
    injection = aggregateLocalInjection(getInjectionEntriesForDate(date));
    assembly.rateBasis = injection.rateBasis = "internal";
  } else if (config.dataSource === "vika") {
    if (!(config.vikaToken && config.assemblyDatasheetId && config.injectionDatasheetId)) {
      throw new Error("维格表配置不完整");
    }
    const results = await Promise.allSettled([
      fetchVikaRecords(config.assemblyDatasheetId, config.assemblyViewId, config.vikaToken, "日期", "desc"),
      fetchVikaRecords(config.injectionDatasheetId, config.injectionViewId, config.vikaToken, "日期", "desc"),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    const [assemblyRaw, injectionRaw] = results.map((result) => result.value);
    assembly = aggregateAssembly(assemblyRaw, date);
    injection = aggregateInjection(injectionRaw, date);
  } else {
    throw new Error("生产日报数据来源无效");
  }

  const report = {
    date,
    fetchedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    dataSource: config.dataSource,
    missingDepartments: [assembly.rawCount ? null : "assembly", injection.rawCount ? null : "injection"].filter(Boolean),
    assembly,
    injection,
  };

  writeGeneratedReport(report);
  return report;
}
