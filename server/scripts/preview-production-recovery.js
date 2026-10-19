import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { fingerprintDailyTable, restorePreImportRowsOnCopy } from "../services/production-recovery.js";

const [sourcePath, outputPath, assemblyHash, injectionHash, preserveCountText, injectionLastDate] = process.argv.slice(2);
const preserveCount = Number(preserveCountText);
if (!sourcePath || !outputPath || !/^[a-f0-9]{64}$/.test(assemblyHash || "") || !/^[a-f0-9]{64}$/.test(injectionHash || "") ||
    !Number.isSafeInteger(preserveCount) || preserveCount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(injectionLastDate || "") || process.argv.length !== 8) {
  console.error("用法：node preview-production-recovery.js <只读源数据库> <新的演练副本路径> <装配整表SHA256> <注塑整表SHA256> <导入后新增注塑记录数> <注塑最新日期>");
  process.exit(2);
}
const source = path.resolve(sourcePath);
const output = path.resolve(outputPath);
if (source === output || !fs.existsSync(source) || fs.existsSync(output)) {
  console.error("源文件必须存在，演练副本不得已存在或与源文件相同");
  process.exit(2);
}

const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  if (db.pragma("quick_check", { simple: true }) !== "ok") throw new Error("源数据库完整性校验失败");
  if (fingerprintDailyTable(db, "assembly_records") !== assemblyHash || fingerprintDailyTable(db, "injection_records") !== injectionHash) {
    throw new Error("源数据库内容与恢复前核对的指纹不同");
  }
  await db.backup(output);
} finally {
  db.close();
}

const copy = new Database(output);
try {
  if (copy.pragma("quick_check", { simple: true }) !== "ok") throw new Error("演练副本备份校验失败");
  if (fingerprintDailyTable(copy, "assembly_records") !== assemblyHash || fingerprintDailyTable(copy, "injection_records") !== injectionHash) {
    throw new Error("演练副本与源数据库指纹不同");
  }
  const result = restorePreImportRowsOnCopy(copy, {
    assembly: 2808, injection: 3711 + preserveCount, lastAuditId: 19794 + preserveCount,
    assemblyHash, injectionHash,
    assemblyFingerprint: { firstId: 5512, lastId: 8319, lastDate: "2026-09-23" },
    injectionFingerprint: { firstId: 7336, lastId: 11046 + preserveCount, lastDate: injectionLastDate },
    ...(preserveCount ? { preservePostImport: { firstAuditId: 19795, count: preserveCount } } : {}),
  });
  if (copy.pragma("quick_check", { simple: true }) !== "ok") throw new Error("演练副本完整性校验失败");
  const dates = Object.fromEntries(["assembly_records", "injection_records"].map((table) => [table,
    copy.prepare(`SELECT MIN(date) AS fromDate, MAX(date) AS toDate, SUM(daily_qty) AS totalDailyQty, SUM(defects) AS totalDefects FROM ${table}`).get()]));
  const daily = Object.fromEntries(["assembly_records", "injection_records"].map((table) => [table,
    copy.prepare(`SELECT date, COUNT(*) AS count, SUM(daily_qty) AS dailyQty, SUM(defects) AS defects FROM ${table} GROUP BY date ORDER BY date`).all()]));
  console.log(JSON.stringify({ output, restored: result, dates, daily }, null, 2));
} finally {
  copy.close();
}
