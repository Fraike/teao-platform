import crypto from "node:crypto";

const RECOVERY = {
  assembly: { table: "assembly_records", firstAuditId: 9499, lastAuditId: 16986, expected: 3090 },
  injection: { table: "injection_records", firstAuditId: 5788, lastAuditId: 13275, expected: 4037 },
};

function columnsFor(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

export function fingerprintDailyTable(db, table) {
  if (!["assembly_records", "injection_records"].includes(table)) throw new Error("未知日报表");
  const digest = crypto.createHash("sha256");
  for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY id`).iterate()) {
    digest.update(JSON.stringify(row));
    digest.update("\n");
  }
  return digest.digest("hex");
}

function auditValue(value, column) {
  if (value === null) return null;
  if (/INT|REAL|NUMERIC/i.test(column.type) && value !== "") return Number(value);
  return value;
}

export function rebuildPreImportRows(db, department, plans = RECOVERY) {
  const plan = plans[department];
  if (!plan) throw new Error("未知生产部门");
  const columns = columnsFor(db, plan.table);
  const columnMap = new Map(columns.map((column) => [column.name, column]));
  const logs = db.prepare(`SELECT * FROM audit_log WHERE record_type = ? AND id BETWEEN ? AND ? ORDER BY id`)
    .all(department, plan.firstAuditId, plan.lastAuditId);
  if (!logs.length || logs[0].id !== plan.firstAuditId || logs.at(-1).id !== plan.lastAuditId) {
    throw new Error(`${department} 审计范围不完整，禁止恢复`);
  }
  const rows = new Map();
  for (const log of logs) {
    if (log.action === "INSERT") {
      const snapshot = JSON.parse(log.new_value);
      if (snapshot.id !== log.record_id || rows.has(snapshot.id)) throw new Error("审计插入记录冲突");
      rows.set(snapshot.id, snapshot);
    } else if (log.action === "UPDATE") {
      const row = rows.get(log.record_id);
      const column = columnMap.get(log.field_name);
      if (!row || !column) throw new Error(`审计修改缺少基底：${log.id}`);
      row[log.field_name] = auditValue(log.new_value, column);
      row.updated_at = log.changed_at;
      row.updated_by = log.changed_by;
    } else if (log.action === "DELETE") {
      if (!rows.delete(log.record_id)) throw new Error(`审计删除缺少基底：${log.id}`);
    } else {
      throw new Error(`未知审计操作：${log.action}`);
    }
  }
  if (rows.size !== plan.expected) throw new Error(`${department} 回放条数不符：${rows.size}`);
  for (const row of rows.values()) {
    for (const column of columns) {
      if (column.name in row) continue;
      if (column.name === "product_id" || column.name === "product_number") row[column.name] = "";
      else throw new Error(`记录 ${row.id} 字段不完整：${column.name}`);
    }
  }
  return [...rows.values()].sort((a, b) => a.id - b.id);
}

export function restorePreImportRowsOnCopy(db, expectedCurrent, plans = RECOVERY) {
  const firstAuditId = Math.min(...Object.values(plans).map((plan) => plan.firstAuditId));
  const lastAuditId = Math.max(...Object.values(plans).map((plan) => plan.lastAuditId));
  const auditRange = db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE id BETWEEN ? AND ?").get(firstAuditId, lastAuditId).count;
  if (auditRange !== lastAuditId - firstAuditId + 1) throw new Error("审计范围存在缺失，禁止恢复");
  const assembly = rebuildPreImportRows(db, "assembly", plans);
  const injection = rebuildPreImportRows(db, "injection", plans);
  const actual = Object.fromEntries(Object.values(plans).map(({ table }) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  if (actual.assembly_records !== expectedCurrent.assembly || actual.injection_records !== expectedCurrent.injection) {
    throw new Error("当前日报条数与预期不同，禁止恢复");
  }
  if (db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id !== expectedCurrent.lastAuditId) {
    throw new Error("审计末尾已变化，禁止恢复");
  }
  if (!expectedCurrent.assemblyHash || !expectedCurrent.injectionHash) throw new Error("缺少当前日报整表指纹，禁止恢复");
  if (fingerprintDailyTable(db, "assembly_records") !== expectedCurrent.assemblyHash ||
      fingerprintDailyTable(db, "injection_records") !== expectedCurrent.injectionHash) {
    throw new Error("当前日报内容指纹不符，禁止恢复");
  }
  for (const [department, plan] of Object.entries(plans)) {
    const expected = expectedCurrent[`${department}Fingerprint`];
    if (!expected) continue;
    const current = db.prepare(`SELECT MIN(id) AS firstId, MAX(id) AS lastId, MAX(date) AS lastDate FROM ${plan.table}`).get();
    if (current.firstId !== expected.firstId || current.lastId !== expected.lastId || current.lastDate !== expected.lastDate) {
      throw new Error(`${department} 当前记录与导入后基线不同，禁止恢复`);
    }
  }
  const restore = db.transaction(() => {
    if (db.prepare("SELECT MAX(id) AS id FROM audit_log").get().id !== expectedCurrent.lastAuditId ||
        fingerprintDailyTable(db, "assembly_records") !== expectedCurrent.assemblyHash ||
        fingerprintDailyTable(db, "injection_records") !== expectedCurrent.injectionHash) {
      throw new Error("恢复事务开始前数据库已变化");
    }
    for (const [department, rows] of [["assembly", assembly], ["injection", injection]]) {
      const { table } = plans[department];
      const names = columnsFor(db, table).map((column) => column.name);
      const insert = db.prepare(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map((name) => `@${name}`).join(",")})`);
      db.prepare(`DELETE FROM ${table}`).run();
      for (const row of rows) insert.run(row);
      if (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count !== plans[department].expected) throw new Error("恢复校验失败");
    }
    db.prepare(`INSERT INTO audit_log (record_type, record_id, action, field_name, old_value, new_value, changed_by, changed_at)
      VALUES ('recovery', 0, 'RESTORE', '*', ?, ?, 'system', ?)`)
      .run(JSON.stringify(actual), JSON.stringify({ assembly: 3090, injection: 4037 }), new Date().toISOString());
  });
  restore();
  return { assembly: assembly.length, injection: injection.length };
}
