import Database from "better-sqlite3";
import { fingerprintDailyTable } from "../services/production-recovery.js";

const [sourcePath] = process.argv.slice(2);
if (!sourcePath || process.argv.length !== 3) {
  console.error("用法：node inspect-production-recovery.js <生产数据库路径>（只读）");
  process.exit(2);
}

const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
try {
  const tables = Object.fromEntries(["assembly_records", "injection_records"].map((table) => [table, {
    ...db.prepare(`SELECT COUNT(*) AS count, MIN(id) AS firstId, MAX(id) AS lastId, MIN(date) AS firstDate, MAX(date) AS lastDate FROM ${table}`).get(),
    sha256: fingerprintDailyTable(db, table),
  }]));
  console.log(JSON.stringify({
    integrity: db.pragma("quick_check", { simple: true }),
    lastAuditId: db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id,
    tables,
  }, null, 2));
} finally {
  db.close();
}
