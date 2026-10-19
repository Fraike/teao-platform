import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { fingerprintDailyTable, restorePreImportRowsOnCopy } from "../services/production-recovery.js";

const [dbPath, backupPath, backupHash, assemblyHash, injectionHash, countText, injectionLastDate, flag] = process.argv.slice(2);
const preserveCount = Number(countText);
if (!dbPath || !backupPath || path.resolve(dbPath) === path.resolve(backupPath) ||
    ![backupHash, assemblyHash, injectionHash].every((value) => /^[a-f0-9]{64}$/.test(value || "")) ||
    !Number.isSafeInteger(preserveCount) || preserveCount < 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(injectionLastDate || "") || flag !== "--apply" || process.argv.length !== 10) {
  console.error("用法：node apply-production-recovery.js <线上数据库> <已验证备份> <备份文件SHA256> <装配整表SHA256> <注塑整表SHA256> <导入后新增注塑记录数> <注塑最新日期> --apply");
  process.exit(2);
}

const status = spawnSync("systemctl", ["is-active", "teao-api"], { encoding: "utf8" });
if (status.stdout.trim() !== "inactive") throw new Error("旧版 teao-api 未确认停止，禁止恢复");
if (!fs.existsSync(dbPath) || !fs.existsSync(backupPath)) throw new Error("线上数据库或备份不存在");
const actualBackupHash = crypto.createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex");
if (actualBackupHash !== backupHash) throw new Error("备份文件摘要不符，禁止恢复");

function tableHash(db, table) {
  const hash = crypto.createHash("sha256");
  for (const row of db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).iterate()) {
    hash.update(JSON.stringify(row));
    hash.update("\n");
  }
  return hash.digest("hex");
}

const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
const live = new Database(dbPath, { fileMustExist: true });
try {
  if (backup.pragma("quick_check", { simple: true }) !== "ok" || live.pragma("quick_check", { simple: true }) !== "ok") {
    throw new Error("数据库完整性校验失败，禁止恢复");
  }
  const tables = backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((row) => row.name);
  if (JSON.stringify(tables) !== JSON.stringify(live.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)) ||
      tables.some((table) => tableHash(backup, table) !== tableHash(live, table))) {
    throw new Error("线上数据库与已验证备份不一致，禁止恢复");
  }
  const expected = {
    assembly: 2808, injection: 3711 + preserveCount, lastAuditId: 19794 + preserveCount,
    assemblyHash, injectionHash,
    assemblyFingerprint: { firstId: 5512, lastId: 8319, lastDate: "2026-09-23" },
    injectionFingerprint: { firstId: 7336, lastId: 11046 + preserveCount, lastDate: injectionLastDate },
    ...(preserveCount ? { preservePostImport: { firstAuditId: 19795, count: preserveCount } } : {}),
  };
  if (fingerprintDailyTable(backup, "assembly_records") !== assemblyHash ||
      fingerprintDailyTable(backup, "injection_records") !== injectionHash) {
    throw new Error("备份中的日报指纹不符，禁止恢复");
  }
  const restored = restorePreImportRowsOnCopy(live, expected);
  if (live.pragma("quick_check", { simple: true }) !== "ok") throw new Error("恢复后数据库完整性校验失败");
  console.log(JSON.stringify({ restored, lastAuditId: live.prepare("SELECT MAX(id) AS id FROM audit_log").get().id }));
} finally {
  backup.close();
  live.close();
}
