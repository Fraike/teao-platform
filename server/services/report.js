import { writeGeneratedReport } from "../config.js";
import {
  getAssemblyEntriesForDate,
  getAssemblyEntriesForRange,
  getAssemblyReportPage,
  getInjectionEntriesForDate,
  getInjectionEntriesForRange,
  getInjectionReportPage,
} from "./production-store.js";

// ---- aggregation ----

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

export function buildWecomContent(date, assembly, injection) {
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

  lines.push(`> 数据来源：内部平台 · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  lines.push(`> 详情查阅：[teao.work/production-report](https://teao.work/production-report)`);

  return lines.join("\n");
}

export function buildEmptyContent(date) {
  return [
    `## 📊 生产日报 — ${date}`,
    "",
    "> ⚠️ **暂无生产数据**",
    "> ",
    "> 装配部和注塑部昨日均无生产记录。",
    "> 数据来源：内部平台",
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
  const assembly = aggregateLocalAssembly(getAssemblyEntriesForDate(date));
  const injection = aggregateLocalInjection(getInjectionEntriesForDate(date));
  assembly.rateBasis = injection.rateBasis = "internal";

  const report = {
    date,
    fetchedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    dataSource: "internal",
    missingDepartments: [assembly.rawCount ? null : "assembly", injection.rawCount ? null : "injection"].filter(Boolean),
    assembly,
    injection,
  };

  writeGeneratedReport(report);
  return report;
}

function latestBackorder(records) {
  const date = records.reduce((latest, record) => record.date > latest ? record.date : latest, "");
  return {
    latestBackorder: date ? records.filter((record) => record.date === date).reduce((sum, record) => sum + record.backorder, 0) : 0,
    backorderAsOf: date || null,
  };
}

export function generateProductionReportRange(dateFrom, dateTo) {
  const assemblyRecords = getAssemblyEntriesForRange(dateFrom, dateTo);
  const injectionRecords = getInjectionEntriesForRange(dateFrom, dateTo);
  const assembly = aggregateLocalAssembly(assemblyRecords);
  const injection = aggregateLocalInjection(injectionRecords);
  const assemblyBackorder = latestBackorder(assemblyRecords);
  const injectionBackorder = latestBackorder(injectionRecords);
  assembly.summary = { ...assembly.summary, totalBackorder: assemblyBackorder.latestBackorder, ...assemblyBackorder };
  injection.summary = {
    ...injection.summary,
    machines: new Set(injectionRecords.map((record) => record.machine)).size,
    machineShifts: new Set(injectionRecords.map((record) => `${record.machine}\u0000${record.shift}`)).size,
    totalBackorder: injectionBackorder.latestBackorder,
    ...injectionBackorder,
  };
  return {
    exists: true,
    dateFrom,
    dateTo,
    dataSource: "internal",
    generatedAt: new Date().toISOString(),
    missingDepartments: [assembly.rawCount ? null : "assembly", injection.rawCount ? null : "injection"].filter(Boolean),
    assembly: { rawCount: assembly.rawCount, summary: assembly.summary },
    injection: { rawCount: injection.rawCount, summary: injection.summary },
  };
}

function assemblyReportRecord(record) {
  return {
    id: record.id,
    date: record.date,
    line: record.line,
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
  };
}

function injectionReportRecord(record) {
  return {
    id: record.id,
    date: record.date,
    machine: record.machine,
    shift: record.shift,
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
  };
}

export function getProductionReportRecordPage(department, dateFrom, dateTo, page, pageSize) {
  const result = department === "assembly"
    ? getAssemblyReportPage(dateFrom, dateTo, page, pageSize)
    : getInjectionReportPage(dateFrom, dateTo, page, pageSize);
  const mapRecord = department === "assembly" ? assemblyReportRecord : injectionReportRecord;
  return {
    department,
    dateFrom,
    dateTo,
    page,
    pageSize,
    total: result.total,
    totalPages: Math.ceil(result.total / pageSize),
    records: result.records.map(mapRecord),
  };
}
