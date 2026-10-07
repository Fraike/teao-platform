import cron from "node-cron";
import { createHash } from "node:crypto";
import { readConfig, writeConfig } from "../config.js";
import { getDB } from "./production-store.js";
import {
  generateProductionReport,
  generateProductionReportRange,
  getProductionReportRecordPage,
  buildWecomContent,
  buildEmptyContent,
  hasProductionData,
} from "./report.js";
import { sendWecomMessage } from "./wecom.js";

let busy = false;

function apiError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function logDB() {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS production_report_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL,
      data_source TEXT NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS production_report_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
      data_source TEXT NOT NULL, trigger_type TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_production_report_send_date ON production_report_sends(date, status);
  `);
  const extraColumns = {
    production_report_operations: ["target_source", "error_code"],
    production_report_sends: ["actor", "content_hash", "error_code"],
  };
  for (const [table, fields] of Object.entries(extraColumns)) {
    const existing = d.prepare(`PRAGMA table_info(${table})`).all();
    for (const field of fields) {
      if (!existing.some((column) => column.name === field)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${field} TEXT`);
    }
  }
  return d;
}

async function withOperation(action, actor, run, changesConfig = false) {
  if (busy) throw apiError(409, "生产日报正在处理，请稍后重试", "PRODUCTION_BUSY");
  busy = true;
  let d;
  let id;
  try {
    const config = readConfig();
    d = logDB();
    const now = new Date().toISOString();
    id = d.prepare("INSERT INTO production_report_operations (action, data_source, actor, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
      .run(action, config.dataSource, actor || "user", now, now).lastInsertRowid;
    const result = await run(config, d);
    const targetSource = changesConfig ? result.nextConfig.dataSource : config.dataSource;
    // A log failure must happen before config persistence. No await between success log and commit.
    d.prepare("UPDATE production_report_operations SET status = 'success', target_source = ?, updated_at = ? WHERE id = ?").run(targetSource, new Date().toISOString(), id);
    if (changesConfig) writeConfig(result.nextConfig);
    return changesConfig ? result.response : result;
  } catch (error) {
    try {
      if (id) d.prepare("UPDATE production_report_operations SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ?").run(error.code || `HTTP_${error.status || 500}`, new Date().toISOString(), id);
    } catch { console.error("[production] operation failure could not be logged"); }
    throw error;
  } finally {
    busy = false;
  }
}

export function isProductionSourceReady(config) {
  try {
    getDB().prepare("SELECT 1 FROM assembly_records LIMIT 1").get();
    getDB().prepare("SELECT 1 FROM injection_records LIMIT 1").get();
    return true;
  } catch {
    return false;
  }
}

export async function updateProductionConfig(updates, actor) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw apiError(400, "配置格式无效");
  if (Object.hasOwn(updates, "dataSource")) throw apiError(400, "生产日报已固定使用内部平台数据");
  return withOperation("update_config", actor, async (config) => {
    const fields = ["wecomWebhook", "cronExpression", "enabled", "restDays", "makeupWorkdays"];
    const next = { ...config };
    for (const field of fields) if (updates[field] !== undefined) next[field] = updates[field];
    if (!cron.validate(next.cronExpression)) throw apiError(400, "定时表达式无效");
    return { nextConfig: next, response: { ok: true } };
  }, true);
}

function validateDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw apiError(400, "日期格式无效", "INVALID_DATE");
  }
}

function validateRange(dateFrom, dateTo) {
  validateDate(dateFrom);
  validateDate(dateTo);
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (from > to) throw apiError(400, "开始日期不能晚于结束日期", "INVALID_DATE_RANGE");
  const days = Math.floor((to - from) / 86400000) + 1;
  if (days > 365) throw apiError(400, "单次最多查询365个自然日", "DATE_RANGE_TOO_LARGE");
}

export async function getProductionReport(date, actor) {
  validateDate(date);
  return withOperation("generate_report", actor, (config) => generateProductionReport(date, config));
}

export async function getProductionReportRange(dateFrom, dateTo, actor) {
  validateRange(dateFrom, dateTo);
  return withOperation("generate_range_report", actor, () => generateProductionReportRange(dateFrom, dateTo));
}

export async function getProductionReportRecords(department, dateFrom, dateTo, page = 1, pageSize = 50) {
  validateRange(dateFrom, dateTo);
  if (!['assembly', 'injection'].includes(department)) throw apiError(400, "部门参数无效", "INVALID_DEPARTMENT");
  if (!Number.isInteger(page) || page < 1) throw apiError(400, "页码必须为正整数", "INVALID_PAGE");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw apiError(400, "每页数量必须在1到100之间", "INVALID_PAGE_SIZE");
  return getProductionReportRecordPage(department, dateFrom, dateTo, page, pageSize);
}

export async function previewProductionReport(date, actor) {
  const report = await getProductionReport(date, actor);
  return { ok: true, date, dataSource: report.dataSource, generatedAt: report.generatedAt, missingDepartments: report.missingDepartments,
    hasData: hasProductionData(report), content: reportContent(report) };
}

function reportContent(report) {
  return hasProductionData(report) ? buildWecomContent(report.date, report.assembly, report.injection, report.dataSource) : buildEmptyContent(report.date, report.dataSource);
}

function repeatState(d, date) {
  const uncertain = d.prepare("SELECT 1 FROM production_report_sends WHERE date = ? AND status IN ('pending', 'unknown') LIMIT 1").get(date);
  if (uncertain) return "skipped_uncertain";
  return d.prepare("SELECT 1 FROM production_report_sends WHERE date = ? AND status = 'sent' LIMIT 1").get(date) ? "skipped_duplicate" : null;
}

export async function sendProductionReport(date, { automatic = false, confirmRepeat = false, actor } = {}) {
  validateDate(date);
  return withOperation("send_report", actor || (automatic ? "cron" : "user"), async (config, d) => {
    const repeated = repeatState(d, date);
    if (repeated && automatic) return { ok: true, date, dataSource: config.dataSource, status: repeated };
    if (repeated && !confirmRepeat) throw apiError(409, "该日报已发送或发送结果待核查，请确认是否重复发送", "REPEAT_CONFIRMATION_REQUIRED");
    const report = await generateProductionReport(date, config);
    if (automatic && !hasProductionData(report)) return { ok: true, date, dataSource: config.dataSource, status: "skipped_empty" };
    if (!config.wecomWebhook) throw apiError(400, "未配置企微 Webhook");
    const now = new Date().toISOString();
    const content = reportContent(report);
    const contentHash = createHash("sha256").update(content).digest("hex");
    const id = d.prepare("INSERT INTO production_report_sends (date, data_source, trigger_type, status, created_at, updated_at, actor, content_hash) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)")
      .run(date, config.dataSource, automatic ? "automatic" : "manual", now, now, actor || (automatic ? "cron" : "user"), contentHash).lastInsertRowid;
    try {
      await sendWecomMessage(config.wecomWebhook, content);
      d.prepare("UPDATE production_report_sends SET status = 'sent', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    } catch (error) {
      d.prepare("UPDATE production_report_sends SET status = ?, error_code = ?, updated_at = ? WHERE id = ?")
        .run(error.code === "SEND_REJECTED" ? "rejected" : "unknown", error.code || "SEND_RESULT_UNCERTAIN", new Date().toISOString(), id);
      throw error;
    }
    return { ok: true, date, dataSource: config.dataSource, status: "sent", message: "已推送到企业微信群" };
  });
}
