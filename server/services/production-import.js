import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDB, replaceAssemblyEntries, replaceInjectionEntries, validateProductionImportRecords } from "./production-store.js";
import { hasProductionImportAccess } from "./users.js";

const TABLES = { assembly: "assembly_records", injection: "injection_records" };
const previews = new Map();
const PREVIEW_MS = 10 * 60 * 1000;

function failure(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function currentRows(db, department) {
  return db.prepare(`SELECT * FROM ${TABLES[department]} ORDER BY id`).all();
}

function range(rows) {
  const dates = rows.map((row) => row.date).sort();
  return dates.length ? { from: dates[0], to: dates.at(-1) } : null;
}

export function previewProductionImport(department, records, userId) {
  validateProductionImportRecords(department, records);
  const oldRows = currentRows(getDB(), department);
  const oldDates = new Map();
  for (const row of oldRows) oldDates.set(row.date, (oldDates.get(row.date) || 0) + 1);
  const newDates = new Map();
  for (const row of records) newDates.set(row.date, (newDates.get(row.date) || 0) + 1);
  const disappearingDates = [...oldDates].filter(([date]) => !newDates.has(date))
    .map(([date, count]) => ({ date, count }));
  const dateDifferences = [...new Set([...oldDates.keys(), ...newDates.keys()])].sort()
    .map((date) => ({ date, currentCount: oldDates.get(date) || 0, incomingCount: newDates.get(date) || 0 }))
    .filter(({ currentCount, incomingCount }) => currentCount !== incomingCount);
  const token = crypto.randomUUID();
  previews.set(token, {
    department, userId, payloadHash: hash(records), databaseHash: hash(oldRows),
    expiresAt: Date.now() + PREVIEW_MS,
  });
  for (const [key, value] of previews) if (value.expiresAt < Date.now()) previews.delete(key);
  return {
    previewToken: token,
    currentCount: oldRows.length,
    incomingCount: records.length,
    currentDateRange: range(oldRows),
    incomingDateRange: range(records),
    disappearingDates,
    dateDifferences,
    replacedCount: oldRows.length,
  };
}

export async function confirmProductionImport(department, records, previewToken, userId, actor) {
  const preview = previews.get(previewToken);
  if (!preview || preview.department !== department || preview.userId !== userId || preview.expiresAt < Date.now()) {
    throw failure("预览已失效，请重新预览");
  }
  previews.delete(previewToken);
  validateProductionImportRecords(department, records);
  if (preview.payloadHash !== hash(records)) throw failure("文件内容已变化，请重新预览");
  const db = getDB();
  if (preview.databaseHash !== hash(currentRows(db, department))) throw failure("线上日报数据已变化，请重新预览");

  const backupDir = path.join(path.dirname(db.name), "production-import-backups");
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDir, 0o700);
  const backupPath = path.join(backupDir, `production-${department}-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.db`);
  try {
    await db.backup(backupPath);
    fs.chmodSync(backupPath, 0o600);
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma("quick_check", { simple: true }) !== "ok") throw failure("备份完整性检查失败，已取消导入", 500);
      if (hash(currentRows(backup, department)) !== preview.databaseHash) throw failure("备份内容与预览不一致，已取消导入");
    } finally {
      backup.close();
    }
    if (preview.databaseHash !== hash(currentRows(db, department))) throw failure("备份期间日报数据已变化，请重新预览");
    if (!hasProductionImportAccess(userId)) throw failure("导入权限已被撤销，请重新联系管理员", 403);
    const backupFile = path.basename(backupPath);
    const result = department === "assembly" ? replaceAssemblyEntries(records, actor, backupFile) : replaceInjectionEntries(records, actor, backupFile);
    return { ...result, backupFile };
  } catch (error) {
    // A failed import must never proceed; retain any backup for forensic inspection.
    throw error;
  }
}
