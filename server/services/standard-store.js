import { STANDARD_CATEGORY_NAMES } from "../shared/product-classification.ts";
import { initializeRetirementSchema } from "./standard-retirement-schema.js";
import { resolveStandardImportStatus } from "./standard-source-policy.js";
import { listStandardPage, getStandardQueryVersion, listPendingStandardNotifications } from "./standard-query.js";
export { listStandardPage, getStandardQueryVersion, listPendingStandardNotifications };
import { standardImportIdentity, normalizeStandardImportProject } from "./standard-import-identity.js";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { seasonalStandardFields, standardBusinessFields } from "./standard-fields.js";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { initPublicationOutbox, enqueueStandardPublication, cancelStandardPublications } from "./standard-publication-outbox.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "standards.db");

export const STANDARD_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  PUBLISHED: "published",
  ARCHIVED: "archived",
  OBSOLETE: "obsolete",
  DELETED: "deleted",
};

export const STANDARD_TYPES = {
  FORMAL: "formal",
  TEMPORARY: "temporary",
  NEW_PENDING: "new_pending",
};

const STANDARD_TYPE_LABELS = {
  [STANDARD_TYPES.FORMAL]: "正式标准",
  [STANDARD_TYPES.TEMPORARY]: "临时标准",
  [STANDARD_TYPES.NEW_PENDING]: "新增待定",
};

// 首期 4 个分类的字段模板（每个分类的规格属性/列名不同）
const CATEGORY_SEED = [
  {
    key: "gear_damper",
    name: STANDARD_CATEGORY_NAMES.gear_damper,
    fields: [
      { key: "torque_standard", label: "扭矩标准" },
      { key: "test_standard", label: "夏季／常规测试标准gf.cm" },
      { key: "winter_test_standard", label: "冬季测试标准" },
      { key: "marking", label: "打点颜色/喷码" },
      { key: "gear_spec", label: "齿轮规格" },
      { key: "remark", label: "备注" },
      { key: "import_note", label: "附加说明" },
    ],
  },
  {
    key: "barrel_damper",
    name: STANDARD_CATEGORY_NAMES.barrel_damper,
    fields: [
      { key: "torque_standard", label: "扭矩标准" },
      { key: "test_standard", label: "夏季／常规测试标准" },
      { key: "winter_test_standard", label: "冬季测试标准" },
      { key: "marking", label: "打点颜色/喷码" },
      { key: "rib_return", label: "筋条是否归位" },
      { key: "remark", label: "备注" },
      { key: "import_note", label: "附加说明" },
    ],
  },
  {
    key: "rack_damper",
    name: STANDARD_CATEGORY_NAMES.rack_damper,
    fields: [
      { key: "torque_standard", label: "扭矩标准" },
      { key: "test_standard", label: "夏季／常规测试标准" },
      { key: "winter_test_standard", label: "冬季测试标准" },
      { key: "marking", label: "打码" },
      { key: "torque_direction", label: "扭矩方向" },
      { key: "lock_direction", label: "装锁方向" },
      { key: "remark", label: "备注" },
      { key: "import_note", label: "附加说明" },
    ],
  },
  {
    key: "lock_sync",
    name: STANDARD_CATEGORY_NAMES.lock_sync,
    fields: [
      { key: "torque_standard", label: "扭矩标准" },
      { key: "test_standard", label: "夏季／常规测试标准" },
      { key: "winter_test_standard", label: "冬季测试标准" },
      { key: "marking", label: "打点颜色" },
      { key: "spring", label: "弹簧" },
      { key: "remark", label: "备注" },
      { key: "import_note", label: "附加说明" },
    ],
  },
  {
    key: "air_pull_cord",
    name: STANDARD_CATEGORY_NAMES.air_pull_cord,
    fields: [
      { key: "torque_standard", label: "扭矩标准" },
      { key: "test_standard", label: "夏季／常规测试标准" },
      { key: "winter_test_standard", label: "冬季测试标准" },
      { key: "marking", label: "喷码" },
      { key: "clip", label: "扣件" },
      { key: "seat", label: "下座" },
      { key: "axis_core", label: "轴芯" },
      { key: "spring", label: "弹簧" },
      { key: "pull_cord", label: "拉绳" },
      { key: "remark", label: "备注" },
      { key: "import_note", label: "附加说明" },
    ],
  },
  {
    key: "air_pull_handle",
    name: STANDARD_CATEGORY_NAMES.air_pull_handle,
    fields: [
      { key: "torque_standard", label: "扭矩标准" },
      { key: "test_standard", label: "夏季／常规测试标准" },
      { key: "winter_test_standard", label: "冬季测试标准" },
      { key: "marking", label: "喷码" },
      { key: "material", label: "物料" },
      { key: "remark", label: "备注" },
      { key: "import_note", label: "附加说明" },
    ],
  },
  {
    key: "sanitary_damper",
    name: STANDARD_CATEGORY_NAMES.sanitary_damper,
    fields: [
      { key: "customer_model", label: "客户型号", group: "基本信息" },
      { key: "part_type", label: "产品部位", group: "基本信息", variant: "component" },
      ...[
        ["product_standard", "产品标准"], ["actual_torque", "实际扭矩（kg，原表）"],
        ["oil_no", "使用油号"], ["fall_time", "下落时间"], ["step", "下座台阶"],
        ["length", "产品长度"], ["marking", "印字"],
      ].map(([key, label]) => ({ key, label, group: "产品参数", variant: "component" })),
      ...[ ["lid", "盖", "盖标准"], ["seat", "座垫", "座垫标准"] ].flatMap(([prefix, name, group]) => [
        { key: `${prefix}_standard`, label: `${name}·标准`, variant: "paired", group },
        { key: `${prefix}_torque`, label: `${name}·实际扭矩（kg，原表）`, variant: "paired", group },
        { key: `${prefix}_oil`, label: `${name}·使用油号`, variant: "paired", group },
        { key: `${prefix}_fall_time`, label: `${name}·下落时间`, variant: "paired", group },
        { key: `${prefix}_step`, label: `${name}·下座台阶`, variant: "paired", group },
        { key: `${prefix}_length`, label: `${name}·产品长度`, variant: "paired", group },
        { key: `${prefix}_marking`, label: `${name}·印字`, variant: "paired", group },
      ]),
      { key: "remark", label: "公共备注", group: "公共说明" },
      { key: "import_note", label: "来源附加说明", group: "公共说明" },
    ],
  },
];

let db = null;
let changeSeq = 0;
const importPreviews = new Map();

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

function actor(user) {
  return typeof user === "string" ? { id: "", name: user } : user;
}

function checkRevision(version, expected) {
  if (!version || expected?.versionId !== version.id || expected?.revision !== version.revision) {
    throw httpError(409, "标准已被修改，请刷新后重新查看和操作");
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function initDB() {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS standard_categories (
      key         TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      fields      TEXT NOT NULL,
      sort        INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_standards (
      id           TEXT PRIMARY KEY,
      serial_no    TEXT NOT NULL,
      category_key TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS standard_drawing_sources (
      standard_id TEXT PRIMARY KEY REFERENCES product_standards(id),
      source_standard_id TEXT NOT NULL REFERENCES product_standards(id),
      source_number TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_standard_versions (
      id               TEXT PRIMARY KEY,
      standard_id      TEXT NOT NULL,
      version_no       INTEGER NOT NULL,
      serial_no        TEXT NOT NULL,
      customer         TEXT DEFAULT '',
      model            TEXT DEFAULT '',
      customer_part_no TEXT DEFAULT '',
      vehicle_model    TEXT DEFAULT '',
      category_key     TEXT NOT NULL,
      standard_type    TEXT NOT NULL DEFAULT 'formal',
      fields           TEXT NOT NULL DEFAULT '{}',
      status           TEXT NOT NULL DEFAULT 'draft',
      review_comment   TEXT DEFAULT '',
      created_by       TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      updated_at       TEXT,
      updated_by       TEXT,
      reviewed_by      TEXT DEFAULT '',
      reviewed_at      TEXT,
      published_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_standards_serial ON product_standards(serial_no);
    CREATE INDEX IF NOT EXISTS idx_standards_category ON product_standards(category_key);
    CREATE INDEX IF NOT EXISTS idx_versions_standard ON product_standard_versions(standard_id);
    CREATE INDEX IF NOT EXISTS idx_versions_status ON product_standard_versions(status);

    CREATE TABLE IF NOT EXISTS product_standard_excel_comments (
      id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, version_id TEXT NOT NULL,
      source_cell TEXT NOT NULL, field_key TEXT NOT NULL, field_label TEXT NOT NULL,
      author TEXT NOT NULL, text TEXT NOT NULL, changed_at TEXT DEFAULT '', source_hash TEXT DEFAULT '',
      UNIQUE(version_id, source_cell, author, text)
    );
    CREATE INDEX IF NOT EXISTS idx_excel_comments_standard ON product_standard_excel_comments(standard_id);
    CREATE TABLE IF NOT EXISTS product_standard_changes (
      id          TEXT PRIMARY KEY,
      standard_id TEXT NOT NULL,
      field_key   TEXT NOT NULL DEFAULT '',
      field_label TEXT NOT NULL DEFAULT '',
      author      TEXT NOT NULL DEFAULT '',
      changed_at  TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      sort_date   INTEGER NOT NULL DEFAULT 0,
      seq         INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_changes_standard ON product_standard_changes(standard_id, sort_date, seq);
  `);

  // 变更历史 seq 单调递增，重启后从库中最大值继续，保证同日期内排序稳定
  const maxSeq = d.prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM product_standard_changes").get();
  changeSeq = maxSeq?.m || 0;

  // 迁移：早期版本把 serial_no 建成 UNIQUE，这里在启动时放宽（序号按产品重复，不唯一）
  migrateSerialNoNonUnique(d);

  // 迁移：为已有库补充 vehicle_model 列（车型代号）
  ensureVehicleModelColumn(d);

  const additions = {
    product_standard_versions: { revision: "INTEGER NOT NULL DEFAULT 1", last_submitted_at: "TEXT", created_by_id: "TEXT DEFAULT ''", updated_by_id: "TEXT DEFAULT ''", submitted_by_id: "TEXT DEFAULT ''", submitted_by: "TEXT DEFAULT ''", submitted_at: "TEXT", assigned_reviewer_id: "TEXT DEFAULT ''", assigned_reviewer_name: "TEXT DEFAULT ''", reviewed_by_id: "TEXT DEFAULT ''" },
    product_standard_changes: { version_id: "TEXT DEFAULT ''", source_cell: "TEXT DEFAULT ''" },
  };
  for (const [table, columns] of Object.entries(additions)) {
    const existing = d.prepare(`PRAGMA table_info(${table})`).all();
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing.some(c => c.name === column)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_versions_standard_order ON product_standard_versions(standard_id,version_no DESC);
    CREATE INDEX IF NOT EXISTS idx_versions_standard_status_order ON product_standard_versions(standard_id,status,version_no DESC);
    CREATE INDEX IF NOT EXISTS idx_versions_assigned ON product_standard_versions(status,assigned_reviewer_id,submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_versions_pending ON product_standard_versions(status,submitted_by_id,submitted_at DESC);
    CREATE TABLE IF NOT EXISTS standard_query_state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO standard_query_state(id,revision) VALUES(1,0);
  `);
  for (const table of ["product_standards", "product_standard_versions", "standard_categories"]) {
    for (const event of ["INSERT", "UPDATE", "DELETE"]) {
      d.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_query_${event.toLowerCase()} AFTER ${event} ON ${table}
        BEGIN UPDATE standard_query_state SET revision=revision+1 WHERE id=1; END`);
    }
  }
  d.exec(`CREATE TABLE IF NOT EXISTS product_standard_import_sources (
    version_id TEXT PRIMARY KEY,source_hash TEXT NOT NULL,source_sheet TEXT NOT NULL,source_row INTEGER,
    imported_by_id TEXT NOT NULL,imported_at TEXT NOT NULL,initial_status TEXT NOT NULL
  )`);
  initializeRetirementSchema(d);
  seedCategories();
  initPublicationOutbox(d);
}

function ensureVehicleModelColumn(d) {
  const cols = d.prepare("PRAGMA table_info(product_standard_versions)").all();
  if (cols.some((c) => c.name === "vehicle_model")) return;
  d.exec("ALTER TABLE product_standard_versions ADD COLUMN vehicle_model TEXT DEFAULT ''");
}

function migrateSerialNoNonUnique(d) {
  const table = d
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'product_standards'")
    .get();
  if (!table?.sql) return;

  // 早期版本把 serial_no 建成 UNIQUE，这里检测到内联 UNIQUE 约束就重建表放宽
  if (!/serial_no\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(table.sql)) return;

  d.transaction(() => {
    d.exec(`
      CREATE TABLE product_standards_new (
        id           TEXT PRIMARY KEY,
        serial_no    TEXT NOT NULL,
        category_key TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      INSERT INTO product_standards_new (id, serial_no, category_key, created_at, updated_at)
        SELECT id, serial_no, category_key, created_at, updated_at FROM product_standards;
      DROP TABLE product_standards;
      ALTER TABLE product_standards_new RENAME TO product_standards;
      CREATE INDEX IF NOT EXISTS idx_standards_serial ON product_standards(serial_no);
      CREATE INDEX IF NOT EXISTS idx_standards_category ON product_standards(category_key);
    `);
  })();
}

function seedCategories() {
  const d = getDB();
  const upsert = d.prepare(
    "INSERT INTO standard_categories (key, name, fields, sort) VALUES (@key, @name, @fields, @sort) " +
      "ON CONFLICT(key) DO UPDATE SET name = @name, fields = @fields, sort = @sort"
  );
  CATEGORY_SEED.forEach((category, index) => {
    upsert.run({
      key: category.key,
      name: category.name,
      fields: JSON.stringify(category.fields),
      sort: index,
    });
  });
}

// ---- 工具 ----

function categoryName(key) {
  const found = CATEGORY_SEED.find((c) => c.key === key);
  return found ? found.name : key;
}

function isValidCategory(key) {
  return CATEGORY_SEED.some((c) => c.key === key);
}

function isValidStandardType(type) {
  return Object.values(STANDARD_TYPES).includes(type);
}

function validatePayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw httpError(400, "标准数据格式无效");
  for (const key of ["customer", "model", "customerPartNo", "vehicleModel"]) {
    if (data[key] !== undefined && (typeof data[key] !== "string" || data[key].length > 2000)) throw httpError(400, `${key} 必须为不超过2000字的文本`);
  }
  if (data.standardType !== undefined && !isValidStandardType(data.standardType)) throw httpError(400, "无效的标准性质");
  if (data.categoryKey !== undefined && !isValidCategory(data.categoryKey)) throw httpError(400, "无效的产品分类");
  if (data.fields !== undefined && (!data.fields || typeof data.fields !== "object" || Array.isArray(data.fields) || Object.values(data.fields).some(v => typeof v !== "string" || v.length > 20000))) {
    throw httpError(400, "规格参数必须为文本，单项最多20000字");
  }
}

function parseFields(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function versionToRow(row) {
  return {
    id: row.id,
    revision: row.revision,
    createdById: row.created_by_id || "",
    updatedById: row.updated_by_id || "",
    assignedReviewerId: row.assigned_reviewer_id || "",
    assignedReviewerName: row.assigned_reviewer_name || "",
    submittedById: row.submitted_by_id || "",
    submittedBy: row.submitted_by || "",
    submittedAt: row.submitted_at || "",
    reviewedById: row.reviewed_by_id || "",
    versionNo: row.version_no,
    serialNo: row.serial_no,
    customer: row.customer,
    model: row.model,
    customerPartNo: row.customer_part_no,
    vehicleModel: row.vehicle_model || "",
    categoryKey: row.category_key,
    categoryName: categoryName(row.category_key),
    standardType: row.standard_type,
    fields: standardBusinessFields(row.category_key, parseFields(row.fields)),
    status: row.status,
    reviewComment: row.review_comment || "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || "",
    reviewedBy: row.reviewed_by || "",
    reviewedAt: row.reviewed_at || "",
    publishedAt: row.published_at || "",
  };
}

function findStandardById(d, id) {
  return d.prepare("SELECT * FROM product_standards WHERE id = ?").get(id);
}

function latestVersion(d, standardId) {
  return d
    .prepare("SELECT * FROM product_standard_versions WHERE standard_id = ? AND status!='deleted' ORDER BY version_no DESC LIMIT 1")
    .get(standardId);
}

// ---- 变更历史 ----

function changeDateStr(iso) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// 把统一格式 "YYYY-MM-DD"（可能缺日）转成可比较的整数；无日期返回 0
function changesSortDate(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return 0;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3] || 0);
}

const changeStatements = new WeakMap();

function appendChange(d, standardId, change, user, now) {
  const changedAt = change.changedAt || changeDateStr(now);
  changeSeq += 1;
  let insert = changeStatements.get(d);
  if (!insert) { insert = d.prepare(
    `INSERT INTO product_standard_changes
      (id, standard_id, field_key, field_label, author, changed_at, description, sort_date, seq, created_at, version_id, source_cell)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ); changeStatements.set(d, insert); }
  insert.run(
    randomUUID(),
    standardId,
    change.fieldKey || "",
    change.fieldLabel || "",
    actor(user).name,
    changedAt,
    change.description || "",
    changesSortDate(changedAt),
    changeSeq,
    now,
    change.versionId || latestVersion(d, standardId)?.id || "",
    change.sourceCell || ""
  );
}

function diffDesc(prev, next) {
  if (!prev && next) return `新增：${next}`;
  if (prev && !next) return `删除：${prev}`;
  return `原「${prev}」改为「${next}」`;
}

function rowToChange(row) {
  return {
    id: row.id,
    versionId: row.version_id || "",
    sourceCell: row.source_cell || "",
    fieldKey: row.field_key,
    fieldLabel: row.field_label,
    author: row.author,
    changedAt: row.changed_at,
    description: row.description,
  };
}

function listChangesOf(d, standardId) {
  return d
    .prepare(
      "SELECT * FROM product_standard_changes WHERE standard_id = ? ORDER BY sort_date DESC, seq DESC"
    )
    .all(standardId)
    .map(rowToChange);
}

// ---- 查询 ----

export function listCategories() {
  const d = getDB();
  return d
    .prepare("SELECT * FROM standard_categories ORDER BY sort ASC")
    .all()
    .map((row) => ({ key: row.key, name: row.name, fields: seasonalStandardFields(JSON.parse(row.fields)) }));
}

export function listStandards(options = {}) {
  return listStandardPage({ ...options, pageSize: null }).data;
}

export function getStandard(id, { onlyPublished = false, includeHistory = true, includeCurrentComments = false, reviewerId = "", includeDeleted = false } = {}) {
  const d = getDB();
  const standard = findStandardById(d, id);
  if (!standard) return null;

  const versions = d
    .prepare(`SELECT * FROM product_standard_versions WHERE standard_id = @id ${includeHistory ? "" : "AND status!='archived'"} ${includeDeleted && !onlyPublished ? "" : "AND status!='deleted'"} ${onlyPublished ? "AND (status IN ('published','archived','obsolete') OR (status='pending_review' AND @reviewerId!='' AND assigned_reviewer_id=@reviewerId))" : ""} ORDER BY version_no DESC`)
    .all({id:standard.id,reviewerId})
    .map(versionToRow);

  const visible = onlyPublished ? versions.filter(v => v.status === "published" || v.status === "archived" || v.status === "obsolete" || (reviewerId && v.status === "pending_review" && v.assignedReviewerId === reviewerId)) : versions;
  if (!visible.length) return null;
  const visibleIds = new Set(visible.map(v => v.id));
  const hiddenDeletedIds = !includeDeleted && !onlyPublished && includeHistory
    ? new Set(d.prepare("SELECT id FROM product_standard_versions WHERE standard_id=? AND status='deleted'").all(id).map(row => row.id)) : new Set();
  const current = ((!onlyPublished || reviewerId) && visible.find(v => v.status === STANDARD_STATUS.DRAFT || v.status === STANDARD_STATUS.PENDING_REVIEW)) || visible.find((v) => v.status === STANDARD_STATUS.PUBLISHED) || visible.find(v => v.status !== STANDARD_STATUS.DELETED) || visible[0] || null;

  return {
    id: standard.id,
    serialNo: standard.serial_no,
    categoryKey: current.categoryKey,
    categoryName: current.categoryName,
    standardType: current ? current.standardType : STANDARD_TYPES.FORMAL,
    versions: visible,
    sourceComments: includeHistory || includeCurrentComments ? d.prepare(`SELECT * FROM product_standard_excel_comments WHERE standard_id = ? ${includeHistory ? "" : "AND version_id = ?"} ORDER BY source_cell`).all(...(includeHistory ? [standard.id] : [standard.id, current.id]))
      .filter(c => (!onlyPublished || visibleIds.has(c.version_id)) && !hiddenDeletedIds.has(c.version_id))
      .map(c => ({id:c.id,versionId:c.version_id,sourceCell:c.source_cell,fieldKey:c.field_key,fieldLabel:c.field_label,author:c.author,text:c.text,changedAt:c.changed_at,sourceHash:c.source_hash})) : [],
    changes: includeHistory ? listChangesOf(d, standard.id).filter(c => (!onlyPublished || visibleIds.has(c.versionId)) && !hiddenDeletedIds.has(c.versionId)) : [],
  };
}

export function getStandardHistory(id, { onlyPublished = false, reviewerId = "", section = "versions", page = 1, pageSize = 20, fieldKey = "", includeDeleted = false } = {}) {
  if (!["versions", "changes", "comments"].includes(section)) throw httpError(400, "无效的历史分类");
  if (fieldKey && (fieldKey !== "test_standard" || section === "versions")) throw httpError(400, "无效的历史字段");
  page = Number(page); pageSize = Number(pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) throw httpError(400, "分页格式无效");
  pageSize = Math.min(50, pageSize);
  if (!getStandard(id, { onlyPublished, reviewerId, includeHistory: false, includeDeleted })) return null;
  const d = getDB();
  const table = {versions:"product_standard_versions",changes:"product_standard_changes",comments:"product_standard_excel_comments"}[section];
  const order = {versions:"r.version_no DESC,r.id DESC",changes:"r.sort_date DESC,r.seq DESC,r.id DESC",comments:"r.source_cell ASC,r.id ASC"}[section];
  const visibility = onlyPublished ? (section === "versions" ? "AND (r.status IN ('published','archived','obsolete') OR (r.status='pending_review' AND @reviewerId!='' AND r.assigned_reviewer_id=@reviewerId))" : "AND EXISTS (SELECT 1 FROM product_standard_versions v WHERE v.id=r.version_id AND v.standard_id=r.standard_id AND (v.status IN ('published','archived','obsolete') OR (v.status='pending_review' AND @reviewerId!='' AND v.assigned_reviewer_id=@reviewerId)))")
    : includeDeleted ? "" : section === "versions" ? "AND r.status!='deleted'" : "AND NOT EXISTS (SELECT 1 FROM product_standard_versions v WHERE v.id=r.version_id AND v.status='deleted')";
  const fieldFilter = fieldKey ? "AND r.field_key IN ('test_standard','winter_test_standard')" : "";
  const total = d.prepare(`SELECT COUNT(*) AS total FROM ${table} r WHERE r.standard_id=@id ${visibility} ${fieldFilter}`).get({id,reviewerId}).total;
  const rows = d.prepare(`SELECT r.* FROM ${table} r WHERE r.standard_id=@id ${visibility} ${fieldFilter} ORDER BY ${order} LIMIT @limit OFFSET @offset`).all({id,reviewerId,limit:pageSize,offset:(page-1)*pageSize});
  const data = section === "versions" ? rows.map(versionToRow) : section === "changes" ? rows.map(rowToChange) : rows.map(c => ({id:c.id,versionId:c.version_id,sourceCell:c.source_cell,fieldKey:c.field_key,fieldLabel:c.field_label,author:c.author,text:c.text,changedAt:c.changed_at,sourceHash:c.source_hash}));
  return { data, total, page, pageSize };
}

function publishAdministratorChange(d, id, user, now) {
  if (actor(user).role !== "admin") return;
  const latest = latestVersion(d, id);
  d.prepare("UPDATE product_standard_versions SET status='archived' WHERE standard_id=? AND status='published' AND id!=?").run(id,latest.id);
  d.prepare(`UPDATE product_standard_versions SET status='published',reviewed_by=?,reviewed_by_id=?,reviewed_at=?,published_at=?,review_comment='管理员直接发布',revision=revision+1 WHERE id=?`).run(actor(user).name,actor(user).id,now,now,latest.id);
  appendChange(d,id,{versionId:latest.id,description:"管理员保存并直接发布，保留历史版本"},user,now);
  queuePublishedStandard(d, id, user, { directPublish: true });
}

function queuePublishedStandard(d, id, user, options = {}) {
  const detail = getStandard(id);
  const version = detail.versions.find(item => item.status === "published");
  enqueueStandardPublication(d, detail, version, listCategories().find(item => item.key === version.categoryKey),
    { reviewerName: actor(user).name, ...options });
}

// ---- 变更 ----

export function createStandard(data, user) {
  validatePayload(data);
  if (!data.customer?.trim()) throw httpError(400, "客户名不能为空");
  if (!data.model?.trim()) throw httpError(400, "产品型号不能为空");
  const d = getDB();
  const serialNo = String(data.serialNo ?? "").trim();
  if (!serialNo) throw httpError(400, "序号不能为空");

  const categoryKey = String(data.categoryKey ?? "");
  if (!isValidCategory(categoryKey)) throw httpError(400, "无效的产品分类");

  const standardType = isValidStandardType(data.standardType) ? data.standardType : STANDARD_TYPES.FORMAL;
  const now = new Date().toISOString();
  const standardId = randomUUID();
  const versionId = randomUUID();

  let drawingSource = null;
  if (data.copyDrawingSourceId !== undefined) {
    if (typeof data.copyDrawingSourceId !== 'string' || data.copyDrawingSourceId.length > 100) throw httpError(400, '图纸来源标准格式无效');
    drawingSource = d.prepare(`SELECT s.id,s.serial_no FROM product_standards s
      JOIN product_standard_versions v ON v.standard_id=s.id AND v.status='published'
      WHERE s.id=? LIMIT 1`).get(data.copyDrawingSourceId);
    if (!drawingSource) throw httpError(400, '图纸来源标准不存在或未发布');
  }

  d.transaction(() => {
    d.prepare(
      "INSERT INTO product_standards (id, serial_no, category_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(standardId, serialNo, categoryKey, now, now);

    if (drawingSource) d.prepare('INSERT INTO standard_drawing_sources VALUES(?,?,?,?)')
      .run(standardId, drawingSource.id, drawingSource.serial_no, now);

    d.prepare(
      `INSERT INTO product_standard_versions (
        id, standard_id, version_no, serial_no, customer, model, customer_part_no, vehicle_model,
        category_key, standard_type, fields, status, review_comment,
        created_by, created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      versionId, standardId, 1, serialNo,
      data.customer.trim(), data.model.trim(), data.customerPartNo ?? "", data.vehicleModel ?? "",
      categoryKey, standardType, JSON.stringify(data.fields || {}),
      STANDARD_STATUS.DRAFT, "", actor(user).name, now, now, actor(user).name
    );
    d.prepare("UPDATE product_standard_versions SET created_by_id = ?, updated_by_id = ? WHERE id = ?").run(actor(user).id, actor(user).id, versionId);
    appendChange(d, standardId, { description: "新增标准" }, user, now);
    publishAdministratorChange(d,standardId,user,now);
  })();

  return getStandard(standardId);
}

export function updateStandard(id, data, user) {
  validatePayload(data);
  const d = getDB();
  const standard = findStandardById(d, id);
  if (!standard) throw httpError(404, "标准不存在");

  const latest = latestVersion(d, standard.id);
  checkRevision(latest, data);
  if (latest.status === STANDARD_STATUS.OBSOLETE) throw httpError(400, "该标准已停用，不能编辑或重新提交");
  if (latest?.status === STANDARD_STATUS.PENDING_REVIEW && actor(user).role !== "admin") {
    throw httpError(400, "该标准正在审核中，暂不能编辑");
  }

  const now = new Date().toISOString();
  const categoryKey = isValidCategory(data.categoryKey) ? data.categoryKey : standard.category_key;
  const standardType = isValidStandardType(data.standardType)
    ? data.standardType
    : latest?.standard_type || STANDARD_TYPES.FORMAL;
  const customer = data.customer ?? latest?.customer ?? "";
  const model = data.model ?? latest?.model ?? "";
  if (!customer.trim()) throw httpError(400, "客户名不能为空");
  if (!model.trim()) throw httpError(400, "产品型号不能为空");
  const customerPartNo = data.customerPartNo ?? latest?.customer_part_no ?? "";
  const vehicleModel = data.vehicleModel ?? latest?.vehicle_model ?? "";
  const fields = data.fields ?? (latest ? parseFields(latest.fields) : {});

  // 计算本次修改相对上一版的字段差异，用于生成变更记录
  const changes = [];
  const prevFields = latest ? parseFields(latest.fields) : {};
  const prevCustomer = latest?.customer ?? "";
  const prevModel = latest?.model ?? "";
  const prevPartNo = latest?.customer_part_no ?? "";
  const prevVehicleModel = latest?.vehicle_model ?? "";
  const prevType = latest?.standard_type ?? STANDARD_TYPES.FORMAL;

  if (customer !== prevCustomer) changes.push({ fieldLabel: "客户名", description: diffDesc(prevCustomer, customer) });
  if (vehicleModel !== prevVehicleModel) changes.push({ fieldLabel: "项目代号", description: diffDesc(prevVehicleModel, vehicleModel) });
  if (model !== prevModel) changes.push({ fieldLabel: "型号", description: diffDesc(prevModel, model) });
  if (customerPartNo !== prevPartNo) changes.push({ fieldLabel: "客户料号", description: diffDesc(prevPartNo, customerPartNo) });
  if (categoryKey !== standard.category_key) {
    changes.push({ fieldLabel: "产品分类", description: diffDesc(categoryName(standard.category_key), categoryName(categoryKey)) });
  }
  if (standardType !== prevType) {
    changes.push({
      fieldLabel: "标准性质",
      description: diffDesc(STANDARD_TYPE_LABELS[prevType] || prevType, STANDARD_TYPE_LABELS[standardType] || standardType),
    });
  }
  for (const field of CATEGORY_SEED.find((c) => c.key === categoryKey)?.fields ?? []) {
    const prev = prevFields[field.key] ?? "";
    const next = fields[field.key] ?? "";
    if (prev !== next) {
      changes.push({ fieldKey: field.key, fieldLabel: field.label, description: diffDesc(prev, next) });
    }
  }

  if (latest?.status === STANDARD_STATUS.DRAFT || (latest?.status === STANDARD_STATUS.PENDING_REVIEW && actor(user).role === "admin")) {
    d.transaction(() => {
    d.prepare(
      `UPDATE product_standard_versions SET
        customer = @customer, model = @model, customer_part_no = @customerPartNo, vehicle_model = @vehicleModel,
        category_key = @categoryKey, standard_type = @standardType, fields = @fields,
        updated_at = @now, updated_by = @user
       WHERE id = @id`
    ).run({
      customer, model, customerPartNo, vehicleModel, categoryKey, standardType,
      fields: JSON.stringify(fields), now, user: actor(user).name, id: latest.id,
    });
    d.prepare("UPDATE product_standards SET category_key = ?, updated_at = ? WHERE id = ?").run(
      categoryKey, now, standard.id
    );
    d.prepare("UPDATE product_standard_versions SET revision = revision + 1, updated_by_id = ? WHERE id = ?").run(actor(user).id, latest.id);
    for (const change of changes) appendChange(d, standard.id, change, user, now);
    publishAdministratorChange(d,standard.id,user,now);
    })();
    return getStandard(standard.id);
  }

  const nextVersionNo = d.prepare("SELECT COALESCE(MAX(version_no),0)+1 AS next FROM product_standard_versions WHERE standard_id=?").get(standard.id).next;
  const versionId = randomUUID();
  d.transaction(() => {
    d.prepare(
      `INSERT INTO product_standard_versions (
        id, standard_id, version_no, serial_no, customer, model, customer_part_no, vehicle_model,
        category_key, standard_type, fields, status, review_comment,
        created_by, created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      versionId, standard.id, nextVersionNo, standard.serial_no,
      customer, model, customerPartNo, vehicleModel, categoryKey, standardType,
      JSON.stringify(fields), STANDARD_STATUS.DRAFT, "", actor(user).name, now, now, actor(user).name
    );
    d.prepare("UPDATE product_standard_versions SET created_by_id = ?, updated_by_id = ? WHERE id = ?").run(actor(user).id, actor(user).id, versionId);
    d.prepare("UPDATE product_standards SET category_key = ?, updated_at = ? WHERE id = ?").run(
      categoryKey, now, standard.id
    );
    for (const change of changes) appendChange(d, standard.id, change, user, now);
    publishAdministratorChange(d,standard.id,user,now);
  })();

  return getStandard(standard.id);
}

export function submitStandard(id, user, expected) {
  const d = getDB();
  const now = new Date().toISOString();
  d.transaction(() => {
    const latest = latestVersion(d, id);
    checkRevision(latest, expected);
    if (latest.status !== STANDARD_STATUS.DRAFT && !(latest.status === STANDARD_STATUS.PENDING_REVIEW && !latest.submitted_by_id)) throw httpError(400, "当前没有可提交的草稿");
    const submittedAt = new Date(Math.max(Date.parse(now), (Date.parse(latest.last_submitted_at) || 0) + 1, (Date.parse(latest.submitted_at) || 0) + 1)).toISOString();
    d.prepare(`UPDATE product_standard_versions SET status = ?, submitted_by_id = ?, submitted_by = ?, submitted_at = ?, last_submitted_at = ?, assigned_reviewer_id=?,assigned_reviewer_name=?, revision = revision + 1 WHERE id = ?`)
      .run(STANDARD_STATUS.PENDING_REVIEW, actor(user).id, actor(user).name, submittedAt, submittedAt, expected?.reviewerId || "", expected?.reviewerName || "", latest.id);
    appendChange(d, id, { fieldKey: "review_submission", fieldLabel: "提交审核", description: expected?.reviewerName ? `提交审核，指定审核人：${expected.reviewerName}` : "提交审核" }, user, submittedAt);
  })();
  return getStandard(id);
}

export function reviewStandard(id, { approve, comment, versionId, revision }, user) {
  if (typeof approve !== "boolean") throw httpError(400, "审核结果必须为布尔值");
  if (comment !== undefined && (typeof comment !== "string" || comment.length > 5000)) throw httpError(400, "审核意见必须为不超过5000字的文本");
  const reviewComment = String(comment ?? "").trim();
  if (!approve && !reviewComment) throw httpError(400, "驳回时必须填写意见");
  const d = getDB();
  const now = new Date().toISOString();
  d.transaction(() => {
    const latest = latestVersion(d, id);
    checkRevision(latest, { versionId, revision });
    if (latest.status !== STANDARD_STATUS.PENDING_REVIEW) throw httpError(400, "该标准不在待审核状态");
    const adminReject = !approve && actor(user).role === "admin";
    if (!adminReject && latest.assigned_reviewer_id && latest.assigned_reviewer_id !== actor(user).id) throw httpError(403,"只有指定审核人可处理该标准");
    const submitterId = latest.submitted_by_id;
    if (!adminReject && !submitterId) throw httpError(409, "旧待审记录缺少提交人身份，请工程人员重新提交审核");
    if (!adminReject && submitterId === actor(user).id) {
      throw httpError(400, "不能审核自己提交的标准");
    }
    if (approve) {
      d.prepare("UPDATE product_standard_versions SET status = ? WHERE standard_id = ? AND status = ?")
        .run(STANDARD_STATUS.ARCHIVED, id, STANDARD_STATUS.PUBLISHED);
    }
    d.prepare(`UPDATE product_standard_versions SET status = ?, reviewed_by = ?, reviewed_by_id = ?, reviewed_at = ?, published_at = ?, review_comment = ?, revision = revision + 1 WHERE id = ?`)
      .run(approve ? STANDARD_STATUS.PUBLISHED : STANDARD_STATUS.DRAFT, actor(user).name, actor(user).id, now, approve ? now : null, reviewComment, latest.id);
    appendChange(d, id, { description: approve ? "审核通过并发布" : `${adminReject ? "管理员介入驳回" : "审核驳回"}：${reviewComment}` }, user, now);
    if (approve) queuePublishedStandard(d, id, user, { comment: reviewComment });
  })();
  return getStandard(id);
}

function archiveWorkingVersion(d, id, latest, user, now, description, reviewReason) {
  d.prepare(`UPDATE product_standard_versions SET status='deleted',revision=revision+1,
    updated_by=?,updated_by_id=?,updated_at=? WHERE id=?`)
    .run(actor(user).name,actor(user).id,now,latest.id);
  if (reviewReason !== undefined) d.prepare(`UPDATE product_standard_versions SET review_comment=?,
    reviewed_by=?,reviewed_by_id=?,reviewed_at=? WHERE id=?`)
    .run(reviewReason,actor(user).name,actor(user).id,now,latest.id);
  const published = d.prepare("SELECT category_key FROM product_standard_versions WHERE standard_id=? AND status='published' ORDER BY version_no DESC LIMIT 1").get(id);
  if (published) d.prepare("UPDATE product_standards SET category_key=?,updated_at=? WHERE id=?").run(published.category_key,now,id);
  appendChange(d,id,{versionId:latest.id,description},user,now);
}

export function discardPendingStandard(id, expected, user) {
  if (actor(user)?.role !== "admin") throw httpError(403, "仅管理员可以删除待审内容");
  const reason = expected?.reason;
  if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) throw httpError(400, "删除原因必填，最多2000字");
  const d = getDB(), now = new Date().toISOString();
  d.transaction(() => {
    const latest = latestVersion(d, id);
    checkRevision(latest, expected);
    if (latest.status !== STANDARD_STATUS.PENDING_REVIEW) throw httpError(400, "只能删除待审核内容");
    archiveWorkingVersion(d,id,latest,user,now,`管理员删除待审内容（归档保留）：${reason.trim()}`,reason.trim());
  })();
  return getStandard(id, { includeDeleted: true });
}

export function withdrawStandard(id, expected, user) {
  const d = getDB(), now = new Date().toISOString(), who = actor(user);
  d.transaction(() => {
    const latest = latestVersion(d,id);
    checkRevision(latest,expected);
    if (!who?.id || !latest.submitted_by_id || latest.submitted_by_id !== who.id) throw httpError(403, "仅提交人本人可以撤回审核");
    if (latest.status !== STANDARD_STATUS.PENDING_REVIEW) throw httpError(409, "待审状态已变化，请刷新后重试");
    const lastSubmittedAt = new Date(Math.max(Date.parse(latest.submitted_at) || 0, Date.parse(latest.last_submitted_at) || 0)).toISOString();
    d.prepare(`UPDATE product_standard_versions SET status='draft',revision=revision+1,
      assigned_reviewer_id='',assigned_reviewer_name='',submitted_at=NULL,last_submitted_at=?,reviewed_by='',reviewed_by_id='',
      reviewed_at=NULL,review_comment='',updated_by=?,updated_by_id=?,updated_at=? WHERE id=?`)
      .run(lastSubmittedAt,who.name,who.id,now,latest.id);
    appendChange(d,id,{versionId:latest.id,description:"提交人撤回审核，保留为草稿"},user,now);
  })();
  return getStandard(id);
}

export function discardDraftStandard(id, expected, user) {
  const d = getDB(), now = new Date().toISOString(), who = actor(user);
  d.transaction(() => {
    const latest = latestVersion(d,id);
    checkRevision(latest,expected);
    if (who?.role !== "admin" && (!who?.id || (latest.created_by_id !== who.id && latest.submitted_by_id !== who.id))) {
      throw httpError(403, "仅草稿创建人、原提交人或管理员可以清理草稿");
    }
    if (latest.status !== STANDARD_STATUS.DRAFT) throw httpError(409, "草稿状态已变化，请刷新后重试");
    archiveWorkingVersion(d,id,latest,user,now,"清理草稿：放弃未提交修改并归档保留");
  })();
  return getStandard(id);
}

export function recordStandardOperation(id, description, user, versionId) {
  appendChange(getDB(),id,{versionId,description},user,new Date().toISOString());
}

export function retireStandard(id, expected, user) {
  const reason = String(expected?.reason || "").trim();
  if (!reason || reason.length > 2000) throw httpError(400, "停用原因不能为空，最多2000字");
  const d = getDB(), now = new Date().toISOString();
  d.transaction(() => {
    const latest = latestVersion(d, id);
    checkRevision(latest, expected);
    if (latest.status !== STANDARD_STATUS.PUBLISHED) throw httpError(400, "只能停用当前已发布且没有修订稿的标准");
    d.prepare("UPDATE product_standard_versions SET status=?,revision=revision+1,updated_by=?,updated_by_id=?,updated_at=? WHERE id=?")
      .run(STANDARD_STATUS.OBSOLETE,actor(user).name,actor(user).id,now,latest.id);
    appendChange(d,id,{description:`停用标准：${reason}`},user,now);
    cancelStandardPublications(d, id);
  })();
  return getStandard(id);
}

// ---- 导入 ----

function validateImportRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw httpError(400, "没有可导入的记录");
  }
  if (records.length > 10000) {
    throw httpError(400, "单次导入最多支持 10000 条记录");
  }

  const errors = [];
  const normalized = [];

  for (const [index, record] of records.entries()) {
    try { validatePayload(record); } catch (error) { errors.push({row: index + 1, message: error.message}); continue; }
    const serialNo = String(record?.serialNo ?? "").trim();
    if (!serialNo) {
      errors.push({ row: index + 1, message: "缺少序号" });
      continue;
    }

    const categoryKey = String(record?.categoryKey ?? "");
    if (!isValidCategory(categoryKey)) {
      errors.push({ row: index + 1, message: `序号 ${serialNo} 分类无效` });
      continue;
    }

    const comments = record.comments ?? [];
    if (!Array.isArray(comments) || comments.length > 500 || comments.some(c=>!c || ["fieldKey","fieldLabel","author","text","cell","changedAt"].some(k=>typeof c[k] !== "string") || c.text.length > 50000)) {
      errors.push({row:index + 1,message:"Excel 批注格式无效"}); continue;
    }
    let initialStatus;
    try {
      if (record.sourceHash !== undefined && (typeof record.sourceHash !== "string" || !/^[a-f0-9]{64}$/i.test(record.sourceHash))) throw httpError(400,"来源文件哈希无效");
      if (record.sourceSheet !== undefined && (typeof record.sourceSheet !== "string" || record.sourceSheet.length > 200)) throw httpError(400,"来源工作表无效");
      if (record.sourceRow !== undefined && (!Number.isInteger(record.sourceRow) || record.sourceRow < 1 || record.sourceRow > 10001)) throw httpError(400,"来源行号无效");
      initialStatus = resolveStandardImportStatus({ ...record, serialNo, categoryKey, customer: String(record.customer ?? "").trim(), model: String(record.model ?? "").trim() });
    } catch(error) { errors.push({row:index+1,message:error.message}); continue; }
    const project = normalizeStandardImportProject(record);
    normalized.push({
      initialStatus,
      sourceHash: record.sourceHash || "",
      sourceSheet: record.sourceSheet || "",
      sourceRow: record.sourceRow ?? null,
      comments,
      serialNo,
      customer: project.customer,
      model: String(record?.model ?? "").trim(),
      customerPartNo: String(record?.customerPartNo ?? "").trim(),
      vehicleModel: project.vehicleModel,
      categoryKey,
      standardType: isValidStandardType(record?.standardType) ? record.standardType : STANDARD_TYPES.FORMAL,
      fields: record?.fields && typeof record.fields === "object" ? record.fields : {},
    });
  }

  return { normalized, errors };
}

const commentStatements = new WeakMap();

export function archiveStandardComments(d, standardId, versionId, comments, sourceHash = "") {
  let insert = commentStatements.get(d);
  if (!insert) { insert = d.prepare(`INSERT OR IGNORE INTO product_standard_excel_comments
    (id,standard_id,version_id,source_cell,field_key,field_label,author,text,changed_at,source_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`); commentStatements.set(d, insert); }
  for (const c of comments) insert.run(randomUUID(),standardId,versionId,c.cell,c.fieldKey,c.fieldLabel,c.author,c.text,c.changedAt,sourceHash);
}

function importFingerprint(records) {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

function databaseFingerprint() {
  return importFingerprint(getDB().prepare("SELECT id, revision, status FROM product_standard_versions ORDER BY id").all());
}

export function previewStandardImport(records, user) {
  const { normalized, errors } = validateImportRecords(records);
  for (const [token, preview] of importPreviews) {
    if (preview.expires < Date.now()) importPreviews.delete(token);
  }
  const existing = new Set(getDB().prepare("SELECT serial_no, customer, model, vehicle_model, fields FROM product_standard_versions WHERE version_no = 1").all()
    .map(r => standardImportIdentity({serialNo:r.serial_no,customer:r.customer,model:r.model,vehicleModel:r.vehicle_model,fields:parseFields(r.fields)})));
  let skipped = 0;
  for (const record of normalized) {
    const key = standardImportIdentity(record);
    if (existing.has(key)) skipped += 1;
    existing.add(key);
  }
  const token = errors.length ? null : randomUUID();
  if (token) importPreviews.set(token, { fingerprint: importFingerprint(normalized), database: databaseFingerprint(), userId: actor(user || "").id, expires: Date.now() + 10 * 60 * 1000 });
  return { total: records.length, valid: normalized.length, errors, skipped, token, obsolete: normalized.filter(r => r.initialStatus === STANDARD_STATUS.OBSOLETE).length };
}

export async function confirmStandardImport(records, user, token, authorize = () => {}, { retirePairedSanitaryIds = [] } = {}) {
  if (!Array.isArray(retirePairedSanitaryIds) || retirePairedSanitaryIds.some(id => typeof id !== "string") || new Set(retirePairedSanitaryIds).size !== retirePairedSanitaryIds.length) throw httpError(400, "旧卫浴标准名单无效");
  if (retirePairedSanitaryIds.length && actor(user).role !== "admin") throw httpError(403, "仅管理员可替换旧卫浴配对标准");
  const { normalized, errors } = validateImportRecords(records);
  if (errors.length) throw httpError(400, "导入包含无效记录，请修正后重新预览");
  const preview = importPreviews.get(token);
  const checkPreview = () => {
    if (!preview || preview.expires < Date.now() || preview.userId !== actor(user).id || preview.fingerprint !== importFingerprint(normalized) || preview.database !== databaseFingerprint()) {
      throw httpError(409, "导入预览已失效或内容发生变化，请重新预览");
    }
  };
  checkPreview();
  const d = getDB();
  const now = new Date().toISOString();
  const backupPath = `${DB_PATH}.bak-${Date.now()}-${randomUUID()}`;
  await d.backup(backupPath);
  authorize();
  checkPreview();
  const inserted = [], skipped = [];
  const existingKeys = new Set(d.prepare("SELECT serial_no, customer, model, vehicle_model, fields FROM product_standard_versions WHERE version_no = 1").all()
    .map(row => standardImportIdentity({serialNo:row.serial_no,customer:row.customer,model:row.model,vehicleModel:row.vehicle_model,fields:parseFields(row.fields)})));
  const insertStandard = d.prepare("INSERT INTO product_standards (id, serial_no, category_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  const insertVersion = d.prepare(`INSERT INTO product_standard_versions (
    id, standard_id, version_no, serial_no, customer, model, customer_part_no, vehicle_model,
    category_key, standard_type, fields, status, created_by, created_by_id, created_at, updated_at, updated_by, updated_by_id, published_at
  ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertSource = d.prepare(`INSERT INTO product_standard_import_sources
    (version_id,source_hash,source_sheet,source_row,imported_by_id,imported_at,initial_status) VALUES(?,?,?,?,?,?,?)`);
  d.transaction(() => {
    for (const record of normalized) {
      const key = standardImportIdentity(record);
      if (existingKeys.has(key)) { skipped.push(record.serialNo); continue; }
      const standardId = randomUUID(), versionId = randomUUID();
      insertStandard.run(standardId, record.serialNo, record.categoryKey, now, now);
      insertVersion.run(versionId, standardId, record.serialNo, record.customer, record.model, record.customerPartNo, record.vehicleModel,
        record.categoryKey, record.standardType, JSON.stringify(record.fields), record.initialStatus,
        actor(user).name, actor(user).id, now, now, actor(user).name, actor(user).id, record.initialStatus === STANDARD_STATUS.PUBLISHED ? now : null);
      insertSource.run(versionId,record.sourceHash,record.sourceSheet,record.sourceRow,actor(user).id,now,record.initialStatus);
      appendChange(d, standardId, { versionId, description: record.initialStatus === STANDARD_STATUS.OBSOLETE ? "依据已确认原表决定初始化为停用，保留历史" : "存量初始化导入并发布" }, user, now);
      archiveStandardComments(d, standardId, versionId, record.comments, record.sourceHash);
      for (const comment of record.comments) {
        appendChange(d, standardId, {versionId,fieldKey:comment.fieldKey,fieldLabel:comment.fieldLabel,description:comment.text,changedAt:comment.changedAt,sourceCell:comment.cell}, {id:"",name:comment.author}, now);
      }
      existingKeys.add(key); inserted.push(record.serialNo);
    }
    for (const id of retirePairedSanitaryIds) {
      const current = latestVersion(d, id);
      const fields = current ? parseFields(current.fields) : {};
      if (!current || current.category_key !== "sanitary_damper" || current.status !== "published"
        || current.version_no !== 1 || current.revision !== 1 || fields.part_type
        || !Object.keys(fields).some(key => /^(lid|seat)_/.test(key))) throw httpError(409, "旧卫浴配对标准已变化，整批导入已取消");
      retireStandard(id, {versionId:current.id,revision:current.revision,reason:"依据2026-10-17用户确认：盖和座为独立产品，新卫浴表取代旧配对标准，保留旧历史"}, user);
    }
  })();
  importPreviews.delete(token);
  return { inserted: inserted.length, skipped: skipped.length, skippedSerialNos: skipped, backupPath, retired: retirePairedSanitaryIds.length };
}
