import fs from "node:fs";
import path from "node:path";
import express from "express";
import cron from "node-cron";

const PORT = process.env.PORT || 3899;
const DATA_DIR = process.env.DATA_DIR || "/var/www/teao-platform/data";
const DATA_FILE = path.join(DATA_DIR, "history.json");
const CONFIG_FILE = path.join(DATA_DIR, "production-config.json");
const REPORTS_DIR = path.join(DATA_DIR, "production-reports");
const PASSWORD = "teao123";

const DEFAULT_CONFIG = {
  vikaToken: "uskU7Q2cwpCOKSJRRlsc5x8",
  assemblyDatasheetId: "dst0zLP6FM2zpV0dqb",
  assemblyViewId: "viwubSCcBAcuZ",
  injectionDatasheetId: "dstDYmU691edT0WS7D",
  injectionViewId: "viwu3b9OBA6AR",
  wecomWebhook: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=dc7a6457-1e01-4c34-b9bf-8c2405ed9116",
  cronExpression: "0 0 13 * * *",
  enabled: true,
};

const app = express();
app.use(express.json({ limit: "10mb" }));

// ===================== Auth =====================

function auth(req, res, next) {
  const pw = req.headers["x-auth-password"];
  if (pw !== PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ===================== Helpers =====================

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), "utf-8");
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
      return { ...DEFAULT_CONFIG };
    }
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

function readReport(date) {
  try {
    const file = path.join(REPORTS_DIR, `${date}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeReport(date, data) {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, `${date}.json`), JSON.stringify(data, null, 2), "utf-8");
}

// ===================== Value Parsers (cellFormat=string → numbers) =====================

function parseNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, "").replace(/%/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function parseRate(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.includes("%")) return parseFloat(v) / 100;
    return parseFloat(v);
  }
  return null;
}

function extractDateStr(v) {
  // "2024/09/24 08:42 PM" → "2024-09-24"
  // "2026/03/28" → "2026-03-28"
  if (!v) return null;
  const m = String(v).match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ===================== Vika API =====================

async function fetchVikaRecords(datasheetId, viewId, token, sortField, sortOrder) {
  const url = new URL(`https://api.vika.cn/fusion/v1/datasheets/${datasheetId}/records`);
  url.searchParams.set("viewId", viewId);
  url.searchParams.set("fieldKey", "name");
  url.searchParams.set("cellFormat", "string");
  url.searchParams.set("pageSize", "500");
  url.searchParams.set("sort[0][field]", sortField);
  url.searchParams.set("sort[0][order]", sortOrder || "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vika API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(`Vika API: ${json.message}`);
  return json.data.records;
}

// ===================== WeCom Bot =====================

async function sendWecomMessage(webhook, content) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown_v2",
      markdown_v2: { content },
    }),
  });
  const json = await res.json();
  if (json.errcode !== 0) throw new Error(`WeCom error: ${json.errmsg}`);
  return json;
}

// ===================== Report Logic =====================

function aggregateAssembly(records, dateStr) {
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

function aggregateInjection(records, dateStr) {
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

function buildWecomContent(date, assembly, injection) {
  const lines = [];
  const asm = assembly.summary;
  const inj = injection.summary;

  // Title
  lines.push(`## 📊 生产日报 — ${date}`);
  lines.push("");

  // Top summary table
  const injectionMachineCount = new Set(injection.records.map(m => m.machine)).size;
  lines.push("| 部门 | 产线/机台 | 产量(PCS) | 达成率 | 合格率 | 不良 |");
  lines.push("|------|----------|----------|--------|--------|------|");
  lines.push(`| 装配 | ${asm.lines} 线 | ${asm.totalActualQty.toLocaleString()} | ${(asm.avgAchievementRate * 100).toFixed(0)}% | ${(asm.avgQualifiedRate * 100).toFixed(1)}% | ${asm.totalDefects} |`);
  lines.push(`| 注塑 | ${injectionMachineCount} 机台(${inj.machines}班次) | ${inj.totalQty.toLocaleString()} | - | ${(inj.avgQualifiedRate * 100).toFixed(1)}% | ${inj.totalDefects} |`);
  lines.push("");

  // Helper: extract number from "X线" or "X#" for natural sort
  const extractNum = (s) => {
    const m = String(s).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  // Assembly: sorted by line number ascending
  const sortedAssembly = [...assembly.records].sort((a, b) => extractNum(a.line) - extractNum(b.line));
  lines.push("### 装配部");
  lines.push("| 产线 | 品名 | 产量 | 不良 |");
  lines.push("|------|------|------|------|");
  for (const line of sortedAssembly) {
    for (const p of line.products) {
      lines.push(`| ${line.line} | ${p.name} | ${p.actualQty.toLocaleString()} | ${p.defects > 0 ? p.defects.toString() : "-"} |`);
    }
  }
  lines.push("");

  // Injection: sorted by machine number ascending
  const sortedInjection = [...injection.records].sort((a, b) => extractNum(a.machine) - extractNum(b.machine));
  const machineMap = new Map();
  for (const m of sortedInjection) {
    const key = m.machine;
    if (!machineMap.has(key)) {
      machineMap.set(key, { qty: 0, defects: 0 });
    }
    const entry = machineMap.get(key);
    entry.qty += m.totalQty;
    entry.defects += m.totalDefects;
  }
  lines.push("### 注塑部");
  lines.push("| 机台 | 产量 | 不良 |");
  lines.push("|------|------|------|");
  for (const [name, data] of machineMap) {
    lines.push(`| ${name} | ${data.qty.toLocaleString()} | ${data.defects > 0 ? data.defects.toString() : "-"} |`);
  }
  lines.push("");

  // Remarks from both departments
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

  // Daily summary
  const anomalies = [];
  for (const line of sortedAssembly) {
    const total = line.totalActual + line.totalDefects;
    const rate = total > 0 ? line.totalActual / total : 1;
    if (rate < 0.98) anomalies.push(`装配${line.line}合格率偏低(${(rate * 100).toFixed(1)}%)`);
    if (line.totalDefects > 50) anomalies.push(`装配${line.line}不良数偏高(${line.totalDefects})`);
  }
  for (const m of sortedInjection) {
    const total = m.totalQty + m.totalDefects;
    const rate = total > 0 ? m.totalQty / total : 1;
    if (rate < 0.995) anomalies.push(`注塑${m.machine}合格率偏低(${(rate * 100).toFixed(1)}%)`);
  }
  if (remarks.length > 0) anomalies.push(`${remarks.length} 条产线备注（停线/异常）`);

  lines.push("### 📋 昨日总结");
  if (anomalies.length > 0) {
    lines.push(`> ⚠️ 发现 ${anomalies.length} 项异常：`);
    for (const a of anomalies) lines.push(`> - ${a}`);
  } else {
    lines.push("> ✅ 昨日生产正常，无异常");
  }
  lines.push("");

  lines.push(`> 数据来源：维格表 · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  lines.push(`> 详情查阅：[teao.work/production-report](https://teao.work/production-report)`);

  return lines.join("\n");
}

function buildEmptyContent(date) {
  return [
    `## 📊 生产日报 — ${date}`,
    "",
    "> ⚠️ **暂无生产数据**",
    "> ",
    "> 装配部和注塑部昨日均无生产记录。",
    "> 请相关人员及时前往维格表录入生产数据！",
    "> ",
    `> 推送时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    "> 录入入口：[维格表](https://vika.cn)",
  ].join("\n");
}

function hasProductionData(report) {
  const asm = report.assembly.summary;
  const inj = report.injection.summary;
  return (asm.totalActualQty > 0 || inj.totalQty > 0);
}

async function fetchAndStoreReport(date) {
  const config = readConfig();
  if (!config.enabled) throw new Error("生产日报功能未启用");

  // Fetch both departments in parallel
  const [assemblyRaw, injectionRaw] = await Promise.all([
    fetchVikaRecords(config.assemblyDatasheetId, config.assemblyViewId, config.vikaToken, "日期", "desc"),
    fetchVikaRecords(config.injectionDatasheetId, config.injectionViewId, config.vikaToken, "日期", "desc"),
  ]);

  const assembly = aggregateAssembly(assemblyRaw, date);
  const injection = aggregateInjection(injectionRaw, date);

  const report = {
    date,
    fetchedAt: new Date().toISOString(),
    assembly,
    injection,
  };

  writeReport(date, report);
  return report;
}

// ===================== Existing History API =====================

app.get("/api/history", auth, (_req, res) => {
  res.json(readData());
});

app.post("/api/history", auth, (req, res) => {
  const { record } = req.body;
  if (!record || !record.id || !record.quoteNo) {
    return res.status(400).json({ error: "invalid record" });
  }
  const records = readData();
  const idx = records.findIndex((r) => r.quoteNo === record.quoteNo);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.unshift(record);
  }
  writeData(records);
  res.json({ ok: true, total: records.length });
});

app.delete("/api/history/:id", auth, (req, res) => {
  const records = readData().filter((r) => r.id !== req.params.id);
  writeData(records);
  res.json({ ok: true, total: records.length });
});

// ===================== Production Report API =====================

// Get config (masks sensitive fields)
app.get("/api/production/config", auth, (_req, res) => {
  const config = readConfig();
  res.json({
    enabled: config.enabled,
    cronExpression: config.cronExpression,
    hasToken: !!config.vikaToken,
    hasAssemblyId: !!config.assemblyDatasheetId,
    hasInjectionId: !!config.injectionDatasheetId,
    hasWebhook: !!config.wecomWebhook,
    configured: !!(config.vikaToken && config.assemblyDatasheetId && config.injectionDatasheetId && config.wecomWebhook),
  });
});

// Save config
app.post("/api/production/config", auth, (req, res) => {
  const config = readConfig();
  const updates = req.body;
  const fields = [
    "vikaToken", "assemblyDatasheetId", "assemblyViewId",
    "injectionDatasheetId", "injectionViewId",
    "wecomWebhook", "cronExpression", "enabled",
  ];
  for (const f of fields) {
    if (updates[f] !== undefined) config[f] = updates[f];
  }
  writeConfig(config);
  res.json({ ok: true });
});

// Fetch & store report for a date
app.post("/api/production/fetch", auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
    const report = await fetchAndStoreReport(date);
    res.json({
      ok: true,
      date,
      assembly: { summary: report.assembly.summary, rawCount: report.assembly.rawCount },
      injection: { summary: report.injection.summary, rawCount: report.injection.rawCount },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stored report
app.get("/api/production/report", auth, (req, res) => {
  const date = req.query.date || new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
  const report = readReport(date);
  if (!report) return res.json({ exists: false, date });
  res.json({ exists: true, ...report });
});

// Manually send WeCom message for a date
app.post("/api/production/send", auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
    let report = readReport(date);
    if (!report) {
      report = await fetchAndStoreReport(date);
    }
    const config = readConfig();
    if (!config.wecomWebhook) throw new Error("未配置企微 Webhook");
    const content = hasProductionData(report)
      ? buildWecomContent(date, report.assembly, report.injection)
      : buildEmptyContent(date);
    await sendWecomMessage(config.wecomWebhook, content);
    res.json({ ok: true, date, message: "已推送到企业微信群" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview WeCom message content (without sending)
app.post("/api/production/preview", auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
    let report = readReport(date);
    if (!report) {
      report = await fetchAndStoreReport(date);
    }
    const content = hasProductionData(report)
      ? buildWecomContent(date, report.assembly, report.injection)
      : buildEmptyContent(date);
    res.json({ ok: true, date, content, hasData: hasProductionData(report) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== Cron: Daily 8:30 AM Push =====================

let cronTask = null;

function setupCron() {
  const config = readConfig();
  if (cronTask) cronTask.stop();

  if (!config.enabled) {
    console.log("[production] cron disabled");
    return;
  }

  if (!cron.validate(config.cronExpression)) {
    console.error(`[production] invalid cron: ${config.cronExpression}`);
    return;
  }

  cronTask = cron.schedule(config.cronExpression, async () => {
    const yesterday = new Date(Date.now() - 86400000);
    const date = yesterday.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
    console.log(`[production] cron: fetching & sending report for ${date}`);
    try {
      const report = await fetchAndStoreReport(date);
      const content = hasProductionData(report)
        ? buildWecomContent(date, report.assembly, report.injection)
        : buildEmptyContent(date);
      await sendWecomMessage(config.wecomWebhook, content);
      console.log(`[production] cron: sent ${hasProductionData(report) ? "report" : "empty reminder"} for ${date}`);
    } catch (err) {
      console.error(`[production] cron error: ${err.message}`);
    }
  }, { timezone: "Asia/Shanghai" });

  console.log(`[production] cron scheduled: ${config.cronExpression} (Asia/Shanghai)`);
}

// ===================== Start Server =====================

app.listen(PORT, "127.0.0.1", () => {
  console.log(`teao-api running on port ${PORT}`);
  setupCron();
});
