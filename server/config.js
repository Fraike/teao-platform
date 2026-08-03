import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = process.env.PORT || 3899;

const PRODUCTION_DATA_DIR = "/var/www/teao-platform/data";
export const DATA_DIR = process.env.DATA_DIR
  || (fs.existsSync(PRODUCTION_DATA_DIR) ? PRODUCTION_DATA_DIR : path.join(__dirname, "..", "data"));
export const DATA_FILE = path.join(DATA_DIR, "history.json");
export const REPORTS_DIR = path.join(DATA_DIR, "production-reports");

const OLD_CONFIG_FILE = path.join(DATA_DIR, "production-config.json");
export const CONFIG_FILE = path.join(__dirname, "production-config.json");

export const DEFAULT_CONFIG = {
  vikaToken: process.env.VIKA_TOKEN || "",
  assemblyDatasheetId: process.env.ASSEMBLY_DATASHEET_ID || "",
  assemblyViewId: process.env.ASSEMBLY_VIEW_ID || "",
  injectionDatasheetId: process.env.INJECTION_DATASHEET_ID || "",
  injectionViewId: process.env.INJECTION_VIEW_ID || "",
  wecomWebhook: process.env.WECOM_WEBHOOK || "",
  cronExpression: process.env.CRON_EXPRESSION || "0 0 13 * * *",
  enabled: process.env.PRODUCTION_REPORT_ENABLED !== "false",
  restDays: [],
  makeupWorkdays: [],
};

export function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) };
    }
    if (fs.existsSync(OLD_CONFIG_FILE)) {
      const oldConfig = JSON.parse(fs.readFileSync(OLD_CONFIG_FILE, "utf-8"));
      const configDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(oldConfig, null, 2), "utf-8");
      console.log("[production] config migrated from data/ to server/");
      return { ...DEFAULT_CONFIG, ...oldConfig };
    }
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    return { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config) {
  if (!fs.existsSync(path.dirname(CONFIG_FILE))) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
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
  const d = new Date(dateStr + "T00:00:00+08:00");
  return d.getDay() === 0;
}

export function getLastWorkingDay(todayStr, config) {
  const d = new Date(todayStr + "T00:00:00+08:00");
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    const dateStr = formatShanghaiDate(d);
    if (!isRestDay(dateStr, config)) return dateStr;
    d.setDate(d.getDate() - 1);
  }
  throw new Error("无法找到上一个工作日，请检查 restDays/makeupWorkdays 配置");
}
