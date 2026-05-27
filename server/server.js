import fs from "node:fs";
import path from "node:path";
import express from "express";
import cron from "node-cron";

const PORT = 3899;
const DATA_DIR = "/var/www/teao-platform/data";
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
  cronExpression: "0 30 8 * * *",
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

function dateToTimestamps(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+08:00`).getTime();
  const end = new Date(`${dateStr}T23:59:59.999+08:00`).getTime();
  return { start, end };
}

// ===================== Vika API =====================

async function fetchVikaRecords(datasheetId, viewId, token, sortField, sortOrder) {
  const url = new URL(`https://vika.cn/fusion/v1/datasheets/${datasheetId}/records`);
  url.searchParams.set("viewId", viewId);
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

function aggregateAssembly(records, { start, end }) {
  const filtered = records.filter((r) => {
    const ts = r.fields["创建时间"];
    return ts && ts >= start && ts <= end;
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
    line.products.push({
      name: r.fields["品名"] || "-",
      spec: r.fields["规格"] || "-",
      customer: r.fields["客户名称"] || "-",
      planQty: r.fields["计划生产数量"] || 0,
      actualQty: r.fields["当天生产数量"] || 0,
      achievementRate: r.fields["计划达成率"] ?? null,
      defects: r.fields["不良数"] || 0,
      qualifiedRate: r.fields["合格率"] ?? null,
      backorder: r.fields["订单累计欠数"] || 0,
      batchNo: r.fields["生产批号"] || "-",
    });
    line.totalPlan += r.fields["计划生产数量"] || 0;
    line.totalActual += r.fields["当天生产数量"] || 0;
    line.totalDefects += r.fields["不良数"] || 0;
    line.totalBackorder += r.fields["订单累计欠数"] || 0;
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

function aggregateInjection(records, { start, end }) {
  const filtered = records.filter((r) => {
    const ts = r.fields["日期"];
    return ts && ts >= start && ts <= end;
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
    m.products.push({
      name: r.fields["品名/型号"] || "-",
      material: r.fields["原材料"] || "-",
      planQty: r.fields["订单数量"] || 0,
      actualQty: r.fields["当天生产数量"] || 0,
      defects: r.fields["不良数"] || 0,
      qualifiedRate: r.fields["合格率"] ?? null,
      backorder: r.fields["订单累计欠数"] || 0,
      batchNo: r.fields["半成品生产批号"] || "-",
      operator: r.fields["操作人"] || "-",
    });
    m.totalQty += r.fields["当天生产数量"] || 0;
    m.totalDefects += r.fields["不良数"] || 0;
    m.totalBackorder += r.fields["订单累计欠数"] || 0;
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
  lines.push(`## 📊 生产日报 — ${date}`);
  lines.push("");

  // Assembly section
  lines.push(`### 装配部（${assembly.summary.lines} 条产线）`);
  lines.push("| 产线 | 品名 | 计划 | 实际 | 达成率 | 合格率 | 不良 | 欠数 |");
  lines.push("|------|------|------|------|--------|--------|------|------|");
  for (const line of assembly.records) {
    for (const p of line.products) {
      const ach = p.achievementRate != null ? `${(p.achievementRate * 100).toFixed(0)}%` : "-";
      const qual = p.qualifiedRate != null ? `${(p.qualifiedRate * 100).toFixed(1)}%` : "-";
      lines.push(`| ${line.line} | ${p.name} | ${p.planQty.toLocaleString()} | ${p.actualQty.toLocaleString()} | ${ach} | ${qual} | ${p.defects} | ${p.backorder.toLocaleString()} |`);
    }
  }
  lines.push(`| **合计** | | **${assembly.summary.totalPlanQty.toLocaleString()}** | **${assembly.summary.totalActualQty.toLocaleString()}** | **${(assembly.summary.avgAchievementRate * 100).toFixed(0)}%** | **${(assembly.summary.avgQualifiedRate * 100).toFixed(1)}%** | **${assembly.summary.totalDefects}** | **${assembly.summary.totalBackorder.toLocaleString()}** |`);
  lines.push("");

  // Injection section
  lines.push(`### 注塑部（${injection.summary.machines} 个机台班次）`);
  lines.push("| 机台 | 班次 | 品名 | 产量 | 合格率 | 不良 | 欠数 |");
  lines.push("|------|------|------|------|--------|------|------|");
  for (const m of injection.records) {
    for (const p of m.products) {
      const qual = p.qualifiedRate != null ? `${(p.qualifiedRate * 100).toFixed(1)}%` : "-";
      lines.push(`| ${m.machine} | ${m.shift} | ${p.name} | ${p.actualQty.toLocaleString()} | ${qual} | ${p.defects} | ${p.backorder.toLocaleString()} |`);
    }
  }
  lines.push(`| **合计** | | | **${injection.summary.totalQty.toLocaleString()}** | **${(injection.summary.avgQualifiedRate * 100).toFixed(1)}%** | **${injection.summary.totalDefects}** | **${injection.summary.totalBackorder.toLocaleString()}** |`);
  lines.push("");

  // Alert: backorders
  const alerts = [];
  for (const line of assembly.records) {
    if (line.totalBackorder > 0) {
      alerts.push(`⚠️ 装配-${line.line} 欠数 ${line.totalBackorder.toLocaleString()}`);
    }
  }
  for (const m of injection.records) {
    if (m.totalBackorder > 0) {
      alerts.push(`⚠️ 注塑-${m.machine}${m.shift} 欠数 ${m.totalBackorder.toLocaleString()}`);
    }
  }
  if (alerts.length > 0) {
    lines.push(`### ⚠️ 订单积压预警`);
    for (const a of alerts) lines.push(`> ${a}`);
    lines.push("");
  }

  lines.push(`> 数据来源：维格表 · 自动推送 · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);

  return lines.join("\n");
}

async function fetchAndStoreReport(date) {
  const config = readConfig();
  if (!config.enabled) throw new Error("生产日报功能未启用");

  const { start, end } = dateToTimestamps(date);

  // Fetch both departments in parallel
  const [assemblyRaw, injectionRaw] = await Promise.all([
    fetchVikaRecords(config.assemblyDatasheetId, config.assemblyViewId, config.vikaToken, "创建时间", "desc"),
    fetchVikaRecords(config.injectionDatasheetId, config.injectionViewId, config.vikaToken, "日期", "desc"),
  ]);

  const assembly = aggregateAssembly(assemblyRaw, { start, end });
  const injection = aggregateInjection(injectionRaw, { start, end });

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
    const content = buildWecomContent(date, report.assembly, report.injection);
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
    const content = buildWecomContent(date, report.assembly, report.injection);
    res.json({ ok: true, date, content });
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
      let report = readReport(date);
      if (!report) {
        report = await fetchAndStoreReport(date);
      }
      const content = buildWecomContent(date, report.assembly, report.injection);
      await sendWecomMessage(config.wecomWebhook, content);
      console.log(`[production] cron: sent report for ${date}`);
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
