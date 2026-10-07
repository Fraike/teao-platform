import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = process.env.PORT || 3899;

const PRODUCTION_DATA_DIR = "/var/www/teao-platform/data";
export const DATA_DIR = process.env.DATA_DIR
  || (fs.existsSync(PRODUCTION_DATA_DIR) ? PRODUCTION_DATA_DIR : path.join(__dirname, "..", "data"));
export const DATA_FILE = path.join(DATA_DIR, "history.json");
export const REPORTS_DIR = path.join(DATA_DIR, "production-reports");

const OLD_CONFIG_FILE = path.join(DATA_DIR, "production-config.json");
export const CONFIG_FILE = process.env.PRODUCTION_CONFIG_PATH || path.join(__dirname, "production-config.json");
const configListeners = new Set();

export function onProductionConfigChange(listener) {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}

export const DEFAULT_CONFIG = {
  dataSource: "internal",
  wecomWebhook: process.env.WECOM_WEBHOOK || "",
  cronExpression: process.env.CRON_EXPRESSION || "0 0 13 * * *",
  enabled: process.env.PRODUCTION_REPORT_ENABLED !== "false",
  restDays: [],
  makeupWorkdays: [],
};

export function readConfig() {
  try {
    const current = readExistingConfig(CONFIG_FILE);
    if (current) return current;
    const old = process.env.PRODUCTION_CONFIG_PATH ? null : readExistingConfig(OLD_CONFIG_FILE);
    const config = old || { ...DEFAULT_CONFIG };
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    try {
      // Do not overwrite a config another process created after our ENOENT read.
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code === "EEXIST") return readExistingConfig(CONFIG_FILE);
      throw error;
    }
    return config;
  } catch {
    const error = new Error("生产日报配置无法读取，请管理员核查；已停止本次操作，未改变数据来源");
    error.code = "PRODUCTION_CONFIG_READ_FAILED";
    error.status = 503;
    throw error;
  }
}

function readExistingConfig(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid config object");
  // Legacy Vika fields remain untouched on disk for a safe rollout, but the
  // runtime is internal-only from this version onward.
  return { ...DEFAULT_CONFIG, ...value, dataSource: "internal" };
}

export function writeConfig(config) {
  if (!fs.existsSync(path.dirname(CONFIG_FILE))) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  }
  let mode = 0o600;
  try {
    mode &= fs.statSync(CONFIG_FILE).mode;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${CONFIG_FILE}.${randomUUID()}.tmp`;
  writePrivateFile(temporary, config, mode, "wx");
  fs.renameSync(temporary, CONFIG_FILE);
  for (const listener of configListeners) {
    try { listener(); } catch { console.error("[production] configuration committed; notification failed"); }
  }
}

function writePrivateFile(file, data, mode = 0o600, flag = "w") {
  const fd = fs.openSync(file, flag, mode);
  try {
    // Set permissions before writing private contents, including existing cache files.
    fs.fchmodSync(fd, mode);
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), "utf-8");
  } finally { fs.closeSync(fd); }
}

// ---- data helpers ----

export function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), "utf-8");
}

export function readReport(date) {
  try {
    const file = path.join(REPORTS_DIR, `${date}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

export function writeReport(date, data) {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, `${date}.json`), JSON.stringify(data, null, 2), "utf-8");
}

export function writeGeneratedReport(report) {
  if (report.dataSource !== "internal" || !/^\d{4}-\d{2}-\d{2}$/.test(report.date)) {
    throw new Error("Invalid generated report cache key");
  }
  const base = path.join(REPORTS_DIR, "source-cache");
  const sourceDir = path.join(base, report.dataSource);
  fs.mkdirSync(sourceDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(base, 0o700);
  fs.chmodSync(sourceDir, 0o700);
  writePrivateFile(path.join(sourceDir, `${report.date}.json`), report);
}

// ---- date helper ----

export function formatShanghaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isRestDay(dateStr, config) {
  if (config.makeupWorkdays?.includes(dateStr)) return false;
  if (config.restDays?.includes(dateStr)) return true;
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCDay() === 0;
}

export function getLastWorkingDay(todayStr, config) {
  // Business dates are calendar values, not instants in the host timezone.
  const d = new Date(todayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < 60; i++) {
    const dateStr = d.toISOString().slice(0, 10);
    if (!isRestDay(dateStr, config)) return dateStr;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  throw new Error("无法找到上一个工作日，请检查 restDays/makeupWorkdays 配置");
}
