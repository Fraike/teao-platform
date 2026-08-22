import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const DB_PATH = process.env.PRODUCTION_DB_PATH || path.join(DATA_DIR, "production.db");

let db = null;

export function getDB() {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

export function initDB() {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS assembly_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT NOT NULL,
      line            TEXT NOT NULL,
      customer        TEXT NOT NULL,
      spec            TEXT DEFAULT '',
      product_name    TEXT NOT NULL,
      material_batch  TEXT DEFAULT '',
      work_hours      REAL DEFAULT 0,
      production_batch TEXT DEFAULT '',
      order_qty       INTEGER DEFAULT 0,
      daily_qty       INTEGER DEFAULT 0,
      plan_qty        INTEGER DEFAULT 0,
      cumulative_qty  INTEGER DEFAULT 0,
      defects         INTEGER DEFAULT 0,
      oil_injection   TEXT DEFAULT '',
      rubber_ring     TEXT DEFAULT '',
      capping         TEXT DEFAULT '',
      shaft_core      TEXT DEFAULT '',
      ultrasonic      TEXT DEFAULT '',
      testing         TEXT DEFAULT '',
      gear            TEXT DEFAULT '',
      filler          TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      created_by      TEXT NOT NULL,
      updated_by      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assembly_date ON assembly_records(date);
    CREATE INDEX IF NOT EXISTS idx_assembly_line ON assembly_records(line);
    CREATE INDEX IF NOT EXISTS idx_assembly_product ON assembly_records(product_name);
    CREATE INDEX IF NOT EXISTS idx_assembly_customer ON assembly_records(customer);
    CREATE INDEX IF NOT EXISTS idx_assembly_date_line ON assembly_records(date, line);
    CREATE INDEX IF NOT EXISTS idx_assembly_date_customer ON assembly_records(date, customer);

    CREATE TABLE IF NOT EXISTS injection_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT NOT NULL,
      machine         TEXT NOT NULL,
      product_name    TEXT NOT NULL,
      material        TEXT DEFAULT '',
      material_batch  TEXT DEFAULT '',
      shift           TEXT NOT NULL,
      operator        TEXT DEFAULT '',
      order_qty       INTEGER DEFAULT 0,
      daily_qty       INTEGER DEFAULT 0,
      cumulative_qty  INTEGER DEFAULT 0,
      defects         INTEGER DEFAULT 0,
      batch_no        TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      created_by      TEXT NOT NULL,
      updated_by      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_injection_date ON injection_records(date);
    CREATE INDEX IF NOT EXISTS idx_injection_machine ON injection_records(machine);
    CREATE INDEX IF NOT EXISTS idx_injection_product ON injection_records(product_name);
    CREATE INDEX IF NOT EXISTS idx_injection_shift ON injection_records(shift);
    CREATE INDEX IF NOT EXISTS idx_injection_date_machine ON injection_records(date, machine);

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL DEFAULT 'assembly',
      record_id   INTEGER NOT NULL,
      action      TEXT NOT NULL,
      field_name  TEXT NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      changed_by  TEXT NOT NULL,
      changed_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(changed_at);
  `);

  const auditColumns = d.prepare("PRAGMA table_info(audit_log)").all();
  if (!auditColumns.some((column) => column.name === "record_type")) {
    d.exec("ALTER TABLE audit_log ADD COLUMN record_type TEXT NOT NULL DEFAULT 'assembly'");
  }
  d.exec("CREATE INDEX IF NOT EXISTS idx_audit_record_type ON audit_log(record_type, record_id)");
}

// ---- 计算字段工具 ----

export function calcAchievementRate(daily, plan) {
  if (!plan || plan === 0) return null;
  return daily / plan;
}

export function calcQualifiedRate(daily, defects) {
  if (!daily || daily === 0) return null;
  return (daily - defects) / daily;
}

export function calcPPM(defects, cumulative) {
  if (!cumulative || cumulative === 0) return null;
  return Math.round((defects / cumulative) * 1000000);
}

export function calcBackorder(order, cumulative) {
  return (order || 0) - (cumulative || 0);
}

// ---- 内部工具 ----

function buildSummary(records) {
  const lines = new Set(records.map((r) => r.line)).size;
  const totalOrderQty = records.reduce((s, r) => s + (r.orderQty || 0), 0);
  const totalPlanQty = records.reduce((s, r) => s + (r.planQty || 0), 0);
  const totalDailyQty = records.reduce((s, r) => s + (r.dailyQty || 0), 0);
  const totalCumulativeQty = records.reduce((s, r) => s + (r.cumulativeQty || 0), 0);
  const totalDefects = records.reduce((s, r) => s + (r.defects || 0), 0);
  return {
    lines,
    totalOrderQty,
    totalPlanQty,
    totalDailyQty,
    totalCumulativeQty,
    totalDefects,
    achievementRate: calcAchievementRate(totalDailyQty, totalPlanQty),
    qualifiedRate: calcQualifiedRate(totalDailyQty, totalDefects),
    totalBackorder: calcBackorder(totalOrderQty, totalCumulativeQty),
  };
}

function recordToRow(row) {
  return {
    id: row.id,
    date: row.date,
    line: row.line,
    customer: row.customer,
    spec: row.spec,
    productName: row.product_name,
    materialBatch: row.material_batch,
    workHours: row.work_hours,
    productionBatch: row.production_batch,
    orderQty: row.order_qty,
    dailyQty: row.daily_qty,
    planQty: row.plan_qty,
    cumulativeQty: row.cumulative_qty,
    defects: row.defects,
    oilInjection: row.oil_injection,
    rubberRing: row.rubber_ring,
    capping: row.capping,
    shaftCore: row.shaft_core,
    ultrasonic: row.ultrasonic,
    testing: row.testing,
    gear: row.gear,
    filler: row.filler,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    achievementRate: calcAchievementRate(row.daily_qty, row.plan_qty),
    qualifiedRate: calcQualifiedRate(row.daily_qty, row.defects),
    ppm: calcPPM(row.defects, row.cumulative_qty),
    backorder: calcBackorder(row.order_qty, row.cumulative_qty),
  };
}

function writeAudit(d, recordType, values) {
  d.prepare(
    "INSERT INTO audit_log (record_type, record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES (@record_type, @record_id, @action, @field_name, @old_value, @new_value, @changed_by, @changed_at)"
  ).run({ record_type: recordType, ...values });
}

function countDates(d, table, where, params) {
  return d.prepare(`SELECT COUNT(DISTINCT date) as cnt FROM ${table} ${where}`).get(params).cnt;
}

function importValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateImportedRecords(records, requiredFields) {
  if (!Array.isArray(records) || records.length === 0) {
    throw importValidationError("没有可导入的记录");
  }
  if (records.length > 10000) {
    throw importValidationError("单次导入最多支持 10000 条记录");
  }

  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object") {
      throw importValidationError(`第 ${index + 1} 行格式无效`);
    }
    for (const field of requiredFields) {
      if (!String(record[field] ?? "").trim()) {
        throw importValidationError(`第 ${index + 1} 行缺少必填字段：${field}`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.date))) {
      throw importValidationError(`第 ${index + 1} 行日期格式无效`);
    }
    for (const field of ["orderQty", "dailyQty", "planQty", "cumulativeQty", "defects", "workHours"]) {
      if (record[field] !== undefined && (!Number.isFinite(Number(record[field])) || Number(record[field]) < 0)) {
        throw importValidationError(`第 ${index + 1} 行 ${field} 必须是非负数字`);
      }
    }
    if (Number(record.defects || 0) > Number(record.dailyQty || 0)) {
      throw importValidationError(`第 ${index + 1} 行不良数不能大于当天生产数量`);
    }
  }
}

// ---- 公开 API ----

export function queryEntries({
  dateFrom, dateTo, line, product, customer, search,
  limit = 10, offset = 0,
} = {}) {
  const d = getDB();
  const conditions = [];
  const params = {};

  if (dateFrom) { conditions.push("date >= @dateFrom"); params.dateFrom = dateFrom; }
  if (dateTo) { conditions.push("date <= @dateTo"); params.dateTo = dateTo; }
  if (line) { conditions.push("line = @line"); params.line = line; }
  if (product) { conditions.push("product_name LIKE @product"); params.product = `%${product}%`; }
  if (customer) { conditions.push("customer LIKE @customer"); params.customer = `%${customer}%`; }
  if (search) {
    conditions.push(
      "(product_name LIKE @search OR customer LIKE @search OR production_batch LIKE @search OR remark LIKE @search)"
    );
    params.search = `%${search}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // 非日期筛选条件（用于第二查询）—— 排除 dateFrom/dateTo
  const nonDateConditions = conditions.filter(c => !c.startsWith("date"));
  const nonDateWhere = nonDateConditions.length > 0 ? `AND ${nonDateConditions.join(" AND ")}` : "";

  const countRow = d.prepare(`SELECT COUNT(*) as cnt FROM assembly_records ${where}`).get(params);
  const total = countRow.cnt;
  const totalGroups = countDates(d, "assembly_records", where, params);

  const dateRows = d.prepare(
    `SELECT DISTINCT date FROM assembly_records ${where} ORDER BY date DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset });

  const dates = dateRows.map((r) => r.date);
  if (dates.length === 0) return { groups: [], total, totalGroups, hasMore: false };

  const placeholders = dates.map((_, i) => `@date${i}`).join(",");
  const dateParams = {};
  dates.forEach((dt, i) => { dateParams[`date${i}`] = dt; });

  const allRows = d.prepare(
    `SELECT * FROM assembly_records WHERE date IN (${placeholders}) ${nonDateWhere} ORDER BY date DESC, line ASC, id ASC`
  ).all({ ...dateParams, ...params });

  const groupMap = new Map();
  for (const row of allRows) {
    const dt = row.date;
    if (!groupMap.has(dt)) groupMap.set(dt, []);
    groupMap.get(dt).push(recordToRow(row));
  }

  const groups = dates.map((date) => {
    const records = groupMap.get(date) || [];
    return { date, records, summary: buildSummary(records) };
  });

  return { groups, total, totalGroups, hasMore: offset + limit < totalGroups };
}

export function exportAssemblyEntries(filters = {}) {
  return queryEntries({ ...filters, limit: 100000, offset: 0 });
}

export function createEntry(data, user) {
  const d = getDB();
  const now = new Date().toISOString();
  const stmt = d.prepare(`
    INSERT INTO assembly_records (
      date, line, customer, spec, product_name, material_batch, work_hours,
      production_batch, order_qty, daily_qty, plan_qty, cumulative_qty, defects,
      oil_injection, rubber_ring, capping, shaft_core, ultrasonic, testing, gear,
      filler, remark, created_at, updated_at, created_by, updated_by
    ) VALUES (
      @date, @line, @customer, @spec, @product_name, @material_batch, @work_hours,
      @production_batch, @order_qty, @daily_qty, @plan_qty, @cumulative_qty, @defects,
      @oil_injection, @rubber_ring, @capping, @shaft_core, @ultrasonic, @testing, @gear,
      @filler, @remark, @created_at, @updated_at, @created_by, @updated_by
    )
  `);
  const result = stmt.run({
    date: data.date, line: data.line, customer: data.customer,
    spec: data.spec || "", product_name: data.productName,
    material_batch: data.materialBatch || "", work_hours: data.workHours || 0,
    production_batch: data.productionBatch || "",
    order_qty: data.orderQty || 0, daily_qty: data.dailyQty || 0,
    plan_qty: data.planQty || 0, cumulative_qty: data.cumulativeQty || 0,
    defects: data.defects || 0,
    oil_injection: data.oilInjection || "", rubber_ring: data.rubberRing || "",
    capping: data.capping || "", shaft_core: data.shaftCore || "",
    ultrasonic: data.ultrasonic || "", testing: data.testing || "",
    gear: data.gear || "", filler: data.filler || "", remark: data.remark || "",
    created_at: now, updated_at: now, created_by: user, updated_by: user,
  });

  const row = d.prepare("SELECT * FROM assembly_records WHERE id = ?").get(result.lastInsertRowid);
  writeAudit(d, "assembly", {
    record_id: result.lastInsertRowid,
    action: "INSERT",
    field_name: "*",
    old_value: null,
    new_value: JSON.stringify(row),
    changed_by: user,
    changed_at: now,
  });

  return recordToRow(row);
}

export function replaceAssemblyEntries(records, user) {
  validateImportedRecords(records, ["date", "line", "customer", "productName"]);
  const d = getDB();
  d.transaction((rows) => {
    d.prepare("DELETE FROM assembly_records").run();
    for (const row of rows) createEntry(row, user);
  })(records);
  return { count: records.length };
}

export function updateEntry(id, data, user) {
  const d = getDB();
  const old = d.prepare("SELECT * FROM assembly_records WHERE id = ?").get(id);
  if (!old) return null;

  const now = new Date().toISOString();
  const fieldMap = {
    date: "date", line: "line", customer: "customer", spec: "spec",
    productName: "product_name", materialBatch: "material_batch", workHours: "work_hours",
    productionBatch: "production_batch", orderQty: "order_qty", dailyQty: "daily_qty",
    planQty: "plan_qty", cumulativeQty: "cumulative_qty", defects: "defects",
    oilInjection: "oil_injection", rubberRing: "rubber_ring", capping: "capping",
    shaftCore: "shaft_core", ultrasonic: "ultrasonic", testing: "testing",
    gear: "gear", filler: "filler", remark: "remark",
  };

  const updates = [];
  const auditLogs = [];

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined) {
      const newVal = data[jsKey];
      const oldVal = old[dbCol];
      if (String(newVal) !== String(oldVal)) {
        updates.push(`${dbCol} = @${dbCol}`);
        auditLogs.push({
          record_id: id,
          action: "UPDATE",
          field_name: dbCol,
          old_value: String(oldVal ?? ""),
          new_value: String(newVal ?? ""),
          changed_by: user,
          changed_at: now,
        });
      }
    }
  }

  if (updates.length === 0) return recordToRow(old);

  updates.push("updated_at = @updated_at");
  updates.push("updated_by = @updated_by");

  const params = {};
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined) params[dbCol] = data[jsKey];
  }
  params.updated_at = now;
  params.updated_by = user;
  params.id = id;

  d.prepare(`UPDATE assembly_records SET ${updates.join(", ")} WHERE id = @id`).run(params);

  const auditStmt = d.prepare(
    "INSERT INTO audit_log (record_type, record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES ('assembly', @record_id, @action, @field_name, @old_value, @new_value, @changed_by, @changed_at)"
  );
  for (const log of auditLogs) auditStmt.run(log);

  const updated = d.prepare("SELECT * FROM assembly_records WHERE id = ?").get(id);
  return recordToRow(updated);
}

export function deleteEntry(id, user) {
  const d = getDB();
  const old = d.prepare("SELECT * FROM assembly_records WHERE id = ?").get(id);
  if (!old) return false;

  const now = new Date().toISOString();
  writeAudit(d, "assembly", {
    record_id: id,
    action: "DELETE",
    field_name: "*",
    old_value: JSON.stringify(old),
    new_value: null,
    changed_by: user,
    changed_at: now,
  });

  d.prepare("DELETE FROM assembly_records WHERE id = ?").run(id);
  return true;
}

export function getHistory(recordType, id) {
  const d = getDB();
  return d.prepare(
    "SELECT * FROM audit_log WHERE record_type = ? AND record_id = ? ORDER BY changed_at DESC"
  ).all(recordType, id);
}

export function getAssemblyEntriesForDate(date) {
  return getDB()
    .prepare("SELECT * FROM assembly_records WHERE date = ? ORDER BY line ASC, id ASC")
    .all(date)
    .map(recordToRow);
}

// ======================== 注塑部 ========================

function injectionRow(row) {
  return {
    id: row.id, date: row.date, machine: row.machine,
    productName: row.product_name, material: row.material,
    materialBatch: row.material_batch, shift: row.shift,
    operator: row.operator,
    orderQty: row.order_qty, dailyQty: row.daily_qty,
    cumulativeQty: row.cumulative_qty, defects: row.defects,
    batchNo: row.batch_no, remark: row.remark,
    createdAt: row.created_at, updatedAt: row.updated_at,
    createdBy: row.created_by, updatedBy: row.updated_by,
    qualifiedRate: calcQualifiedRate(row.daily_qty, row.defects),
    backorder: calcBackorder(row.order_qty, row.cumulative_qty),
  };
}

function injectionSummary(records) {
  const machines = new Set(records.map((r) => r.machine)).size;
  const totalOrderQty = records.reduce((s, r) => s + (r.orderQty || 0), 0);
  const totalDailyQty = records.reduce((s, r) => s + (r.dailyQty || 0), 0);
  const totalCumulativeQty = records.reduce((s, r) => s + (r.cumulativeQty || 0), 0);
  const totalDefects = records.reduce((s, r) => s + (r.defects || 0), 0);
  return {
    machines, totalOrderQty, totalDailyQty, totalCumulativeQty, totalDefects,
    qualifiedRate: calcQualifiedRate(totalDailyQty, totalDefects),
    totalBackorder: calcBackorder(totalOrderQty, totalCumulativeQty),
  };
}

export function queryInjectionEntries({ dateFrom, dateTo, machine, product, search, limit = 10, offset = 0 } = {}) {
  const d = getDB();
  const conditions = []; const params = {};
  if (dateFrom) { conditions.push("date >= @dateFrom"); params.dateFrom = dateFrom; }
  if (dateTo) { conditions.push("date <= @dateTo"); params.dateTo = dateTo; }
  if (machine) { conditions.push("machine = @machine"); params.machine = machine; }
  if (product) { conditions.push("product_name LIKE @product"); params.product = `%${product}%`; }
  if (search) { conditions.push("(product_name LIKE @search OR material LIKE @search OR batch_no LIKE @search OR remark LIKE @search)"); params.search = `%${search}%`; }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const nonDateConditions = conditions.filter(c => !c.startsWith("date"));
  const nonDateWhere = nonDateConditions.length > 0 ? `AND ${nonDateConditions.join(" AND ")}` : "";
  const countRow = d.prepare(`SELECT COUNT(*) as cnt FROM injection_records ${where}`).get(params);
  const total = countRow.cnt;
  const totalGroups = countDates(d, "injection_records", where, params);
  const dateRows = d.prepare(`SELECT DISTINCT date FROM injection_records ${where} ORDER BY date DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });
  const dates = dateRows.map((r) => r.date);
  if (dates.length === 0) return { groups: [], total, totalGroups, hasMore: false };
  const placeholders = dates.map((_, i) => `@date${i}`).join(",");
  const dateParams = {}; dates.forEach((dt, i) => { dateParams[`date${i}`] = dt; });
  const allRows = d.prepare(`SELECT * FROM injection_records WHERE date IN (${placeholders}) ${nonDateWhere} ORDER BY date DESC, machine ASC, shift ASC, id ASC`).all({ ...dateParams, ...params });
  const groupMap = new Map();
  for (const row of allRows) { const dt = row.date; if (!groupMap.has(dt)) groupMap.set(dt, []); groupMap.get(dt).push(injectionRow(row)); }
  const groups = dates.map((date) => { const records = groupMap.get(date) || []; return { date, records, summary: injectionSummary(records) }; });
  return { groups, total, totalGroups, hasMore: offset + limit < totalGroups };
}

export function exportInjectionEntries(filters = {}) {
  return queryInjectionEntries({ ...filters, limit: 100000, offset: 0 });
}

export function createInjectionEntry(data, user) {
  const d = getDB(); const now = new Date().toISOString();
  const stmt = d.prepare(`INSERT INTO injection_records (date, machine, product_name, material, material_batch, shift, operator, order_qty, daily_qty, cumulative_qty, defects, batch_no, remark, created_at, updated_at, created_by, updated_by) VALUES (@date, @machine, @product_name, @material, @material_batch, @shift, @operator, @order_qty, @daily_qty, @cumulative_qty, @defects, @batch_no, @remark, @created_at, @updated_at, @created_by, @updated_by)`);
  const result = stmt.run({
    date: data.date, machine: data.machine, product_name: data.productName,
    material: data.material || "", material_batch: data.materialBatch || "",
    shift: data.shift, operator: data.operator || "",
    order_qty: data.orderQty || 0, daily_qty: data.dailyQty || 0,
    cumulative_qty: data.cumulativeQty || 0, defects: data.defects || 0,
    batch_no: data.batchNo || "", remark: data.remark || "",
    created_at: now, updated_at: now, created_by: user, updated_by: user,
  });
  const row = d.prepare("SELECT * FROM injection_records WHERE id = ?").get(result.lastInsertRowid);
  writeAudit(d, "injection", {
    record_id: result.lastInsertRowid,
    action: "INSERT",
    field_name: "*",
    old_value: null,
    new_value: JSON.stringify(row),
    changed_by: user,
    changed_at: now,
  });
  return injectionRow(row);
}

export function replaceInjectionEntries(records, user) {
  validateImportedRecords(records, ["date", "machine", "shift", "productName"]);
  const d = getDB();
  d.transaction((rows) => {
    d.prepare("DELETE FROM injection_records").run();
    for (const row of rows) createInjectionEntry(row, user);
  })(records);
  return { count: records.length };
}

export function updateInjectionEntry(id, data, user) {
  const d = getDB(); const old = d.prepare("SELECT * FROM injection_records WHERE id = ?").get(id);
  if (!old) return null;
  const now = new Date().toISOString();
  const fieldMap = { date: "date", machine: "machine", productName: "product_name", material: "material", materialBatch: "material_batch", shift: "shift", operator: "operator", orderQty: "order_qty", dailyQty: "daily_qty", cumulativeQty: "cumulative_qty", defects: "defects", batchNo: "batch_no", remark: "remark" };
  const updates = []; const auditLogs = [];
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined && String(data[jsKey]) !== String(old[dbCol] ?? "")) {
      updates.push(`${dbCol} = @${dbCol}`);
      auditLogs.push({ record_id: id, action: "UPDATE", field_name: dbCol, old_value: String(old[dbCol] ?? ""), new_value: String(data[jsKey] ?? ""), changed_by: user, changed_at: now });
    }
  }
  if (updates.length === 0) return injectionRow(old);
  updates.push("updated_at = @updated_at", "updated_by = @updated_by");
  const params = {}; for (const [jsKey, dbCol] of Object.entries(fieldMap)) { if (data[jsKey] !== undefined) params[dbCol] = data[jsKey]; }
  params.updated_at = now; params.updated_by = user; params.id = id;
  d.prepare(`UPDATE injection_records SET ${updates.join(", ")} WHERE id = @id`).run(params);
  const auditStmt = d.prepare("INSERT INTO audit_log (record_type, record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES ('injection', @record_id, @action, @field_name, @old_value, @new_value, @changed_by, @changed_at)");
  for (const log of auditLogs) auditStmt.run(log);
  return injectionRow(d.prepare("SELECT * FROM injection_records WHERE id = ?").get(id));
}

export function deleteInjectionEntry(id, user) {
  const d = getDB(); const old = d.prepare("SELECT * FROM injection_records WHERE id = ?").get(id);
  if (!old) return false;
  const now = new Date().toISOString();
  writeAudit(d, "injection", {
    record_id: id,
    action: "DELETE",
    field_name: "*",
    old_value: JSON.stringify(old),
    new_value: null,
    changed_by: user,
    changed_at: now,
  });
  d.prepare("DELETE FROM injection_records WHERE id = ?").run(id);
  return true;
}

export function getInjectionEntriesForDate(date) {
  return getDB()
    .prepare("SELECT * FROM injection_records WHERE date = ? ORDER BY machine ASC, shift ASC, id ASC")
    .all(date)
    .map(injectionRow);
}
