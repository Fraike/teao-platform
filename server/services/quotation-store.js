import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DATA_DIR } from "../config.js";

const DB_PATH = process.env.QUOTATION_DB_PATH || path.join(DATA_DIR, "quotation.db");
let db = null;

function getDB() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeQuotationDB() {
  if (db) {
    db.close();
    db = null;
  }
}

export function initQuotationDB() {
  const database = getDB();
  database.exec(`
    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      market TEXT NOT NULL CHECK (market IN ('domestic', 'international')),
      quote_no TEXT NOT NULL,
      quote_date TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT '',
      sales_name TEXT NOT NULL DEFAULT '',
      product_count INTEGER NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      quotation_json TEXT NOT NULL,
      legacy_history_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quotations_updated_at ON quotations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotations_quote_no ON quotations(quote_no);
    CREATE INDEX IF NOT EXISTS idx_quotations_customer_name ON quotations(customer_name);
    CREATE INDEX IF NOT EXISTS idx_quotations_market ON quotations(market);

    CREATE TABLE IF NOT EXISTS quotation_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id TEXT NOT NULL,
      action TEXT NOT NULL,
      quotation_json TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_revisions_quote ON quotation_revisions(quotation_id, changed_at DESC);
  `);

  const columns = database.prepare("PRAGMA table_info(quotations)").all();
  if (!columns.some((column) => column.name === "legacy_history_id")) {
    database.exec("ALTER TABLE quotations ADD COLUMN legacy_history_id TEXT");
  }
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_legacy_history_id ON quotations(legacy_history_id)");
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function asText(value, field, { required = false, max = 500 } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw validationError(`${field}不能为空`);
  if (text.length > max) throw validationError(`${field}不能超过${max}个字符`);
  return text;
}

function asNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function validateQuotation(market, quotation) {
  if (market !== "domestic" && market !== "international") {
    throw validationError("报价类型无效");
  }
  if (!quotation || typeof quotation !== "object") {
    throw validationError("报价内容无效");
  }
  if (!quotation.customer || !quotation.quoteMeta || !Array.isArray(quotation.products)) {
    throw validationError("报价内容不完整");
  }

  const customerName = asText(quotation.customer.name, "客户名称", { required: true });
  const quoteNo = asText(quotation.quoteMeta.no, "报价单号", { required: true, max: 100 });
  const quoteDate = asText(quotation.quoteMeta.date, "报价日期", { required: true, max: 30 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quoteDate)) {
    throw validationError("报价日期格式无效");
  }
  if (quotation.products.length === 0) {
    throw validationError("至少需要一个产品");
  }
  if (quotation.products.length > 500) {
    throw validationError("单份报价最多支持500个产品");
  }

  quotation.products.forEach((product, index) => {
    if (!product || typeof product !== "object") {
      throw validationError(`第${index + 1}个产品无效`);
    }
    asText(product.name, `第${index + 1}个产品名称`, { required: true });
    if (asNumber(product.price) < 0 || asNumber(product.qty) < 0 || asNumber(product.freight) < 0) {
      throw validationError(`第${index + 1}个产品的数量或金额不能小于0`);
    }
  });

  const snapshot = JSON.stringify(quotation);
  if (Buffer.byteLength(snapshot, "utf8") > 15 * 1024 * 1024) {
    throw validationError("报价内容过大，单份报价不能超过15MB");
  }

  const totalAmount = quotation.products.reduce(
    (sum, product) => sum + asNumber(product.qty || 1) * asNumber(product.price) + asNumber(product.freight),
    0,
  );
  return {
    market,
    quoteNo,
    quoteDate,
    customerName,
    currency: asText(quotation.quoteMeta.currency, "币种", { max: 30 }),
    salesName: asText(quotation.quoteMeta.salesName, "报价人", { max: 100 }),
    productCount: quotation.products.length,
    totalAmount,
    quotationJson: snapshot,
  };
}

function rowToQuotation(row) {
  if (!row) return null;
  return {
    id: row.id,
    market: row.market,
    quoteNo: row.quote_no,
    quoteDate: row.quote_date,
    customerName: row.customer_name,
    currency: row.currency,
    salesName: row.sales_name,
    productCount: row.product_count,
    totalAmount: row.total_amount,
    quotation: JSON.parse(row.quotation_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function rowToSummary(row) {
  const { quotation_json: _quotationJson, ...summary } = row;
  let previewProducts = [];
  try {
    const quotation = JSON.parse(_quotationJson);
    previewProducts = Array.isArray(quotation.products)
      ? quotation.products.slice(0, 20).map((product) => ({
        id: String(product.id || ""),
        name: String(product.name || ""),
        partNo: String(product.partNo || ""),
        spec: String(product.spec || ""),
        image: typeof product.image === "string" ? product.image : undefined,
      }))
      : [];
  } catch {
    previewProducts = [];
  }
  return {
    id: summary.id,
    market: summary.market,
    quoteNo: summary.quote_no,
    quoteDate: summary.quote_date,
    customerName: summary.customer_name,
    currency: summary.currency,
    salesName: summary.sales_name,
    productCount: summary.product_count,
    totalAmount: summary.total_amount,
    previewProducts,
    createdAt: summary.created_at,
    updatedAt: summary.updated_at,
    createdBy: summary.created_by,
    updatedBy: summary.updated_by,
  };
}

export function listQuotations({ keyword = "", market = "", dateFrom = "", dateTo = "", createdBy = "", page = 1, pageSize = 20 } = {}) {
  const database = getDB();
  const conditions = [];
  const params = {};

  if (keyword) {
    conditions.push("(quote_no LIKE @keyword OR customer_name LIKE @keyword OR sales_name LIKE @keyword)");
    params.keyword = `%${keyword.trim()}%`;
  }
  if (market === "domestic" || market === "international") {
    conditions.push("market = @market");
    params.market = market;
  }
  if (dateFrom) {
    conditions.push("quote_date >= @dateFrom");
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    conditions.push("quote_date <= @dateTo");
    params.dateTo = dateTo;
  }
  if (createdBy) {
    conditions.push("created_by = @createdBy");
    params.createdBy = createdBy;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const total = database.prepare(`SELECT COUNT(*) AS total FROM quotations ${where}`).get(params).total;
  const rows = database.prepare(`
    SELECT * FROM quotations ${where}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: safePageSize, offset: (safePage - 1) * safePageSize });

  return { data: rows.map(rowToSummary), total, page: safePage, pageSize: safePageSize };
}

export function getQuotation(id) {
  return rowToQuotation(getDB().prepare("SELECT * FROM quotations WHERE id = ?").get(id));
}

export function createQuotation({ market, quotation }, user) {
  const values = validateQuotation(market, quotation);
  const database = getDB();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const createdBy = user || "unknown";
  database.transaction(() => {
    database.prepare(`
      INSERT INTO quotations (
        id, market, quote_no, quote_date, customer_name, currency, sales_name, product_count,
        total_amount, quotation_json, created_at, updated_at, created_by, updated_by
      ) VALUES (
        @id, @market, @quoteNo, @quoteDate, @customerName, @currency, @salesName, @productCount,
        @totalAmount, @quotationJson, @createdAt, @updatedAt, @createdBy, @updatedBy
      )
    `).run({ ...values, id, createdAt: now, updatedAt: now, createdBy, updatedBy: createdBy });
    database.prepare(`
      INSERT INTO quotation_revisions (quotation_id, action, quotation_json, changed_at, changed_by)
      VALUES (?, 'created', ?, ?, ?)
    `).run(id, values.quotationJson, now, createdBy);
  })();
  return getQuotation(id);
}

export function migrateLegacyHistory(records) {
  if (!Array.isArray(records) || records.length === 0) return 0;
  const database = getDB();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO quotations (
      id, market, quote_no, quote_date, customer_name, currency, sales_name, product_count,
      total_amount, quotation_json, legacy_history_id, created_at, updated_at, created_by, updated_by
    ) VALUES (
      @id, @market, @quoteNo, @quoteDate, @customerName, @currency, @salesName, @productCount,
      @totalAmount, @quotationJson, @legacyHistoryId, @createdAt, @updatedAt, 'legacy-history', 'legacy-history'
    )
  `);
  const insertRevision = database.prepare(`
    INSERT INTO quotation_revisions (quotation_id, action, quotation_json, changed_at, changed_by)
    VALUES (?, 'migrated', ?, ?, 'legacy-history')
  `);
  let migrated = 0;
  database.transaction(() => {
    for (const record of records) {
      if (!record?.id || !record.quoteNo || !record.customerName || !Array.isArray(record.products)) continue;
      const createdAt = record.createdAt || new Date().toISOString();
      const quotation = {
        customer: { name: record.customerName, contact: record.contact || "" },
        quoteMeta: {
          no: record.quoteNo,
          date: record.date || createdAt.slice(0, 10),
          salesName: record.salesName || "",
          salesTel: "",
          currency: record.currency || "",
          taxNote: "",
          showStamp: false,
          showMold: Array.isArray(record.molds) && record.molds.length > 0,
          showAmount: true,
          tableColumnWidths: {},
        },
        products: record.products,
        terms: Array.isArray(record.terms) ? record.terms : [],
        molds: Array.isArray(record.molds) ? record.molds : [],
      };
      const quotationJson = JSON.stringify(quotation);
      const result = insert.run({
        id: `legacy_${record.id}`,
        market: record.currency && record.currency !== "CNY" && record.currency !== "¥" ? "international" : "domestic",
        quoteNo: record.quoteNo,
        quoteDate: quotation.quoteMeta.date,
        customerName: record.customerName,
        currency: record.currency || "",
        salesName: record.salesName || "",
        productCount: record.products.length,
        totalAmount: asNumber(record.totalAmount),
        quotationJson,
        legacyHistoryId: String(record.id),
        createdAt,
        updatedAt: createdAt,
      });
      if (result.changes > 0) {
        insertRevision.run(`legacy_${record.id}`, quotationJson, createdAt);
        migrated += 1;
      }
    }
  })();
  return migrated;
}

export function updateQuotation(id, { market, quotation }, user) {
  const existing = getQuotation(id);
  if (!existing) return null;
  const values = validateQuotation(market, quotation);
  const database = getDB();
  const now = new Date().toISOString();
  const updatedBy = user || "unknown";
  database.transaction(() => {
    database.prepare(`
      UPDATE quotations SET
        market = @market, quote_no = @quoteNo, quote_date = @quoteDate, customer_name = @customerName,
        currency = @currency, sales_name = @salesName, product_count = @productCount,
        total_amount = @totalAmount, quotation_json = @quotationJson, updated_at = @updatedAt,
        updated_by = @updatedBy
      WHERE id = @id
    `).run({ ...values, id, updatedAt: now, updatedBy });
    database.prepare(`
      INSERT INTO quotation_revisions (quotation_id, action, quotation_json, changed_at, changed_by)
      VALUES (?, 'updated', ?, ?, ?)
    `).run(id, values.quotationJson, now, updatedBy);
  })();
  return getQuotation(id);
}

export function deleteQuotation(id, user) {
  const existing = getQuotation(id);
  if (!existing) return false;
  const database = getDB();
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`
      INSERT INTO quotation_revisions (quotation_id, action, quotation_json, changed_at, changed_by)
      VALUES (?, 'deleted', ?, ?, ?)
    `).run(id, JSON.stringify(existing.quotation), now, user || "unknown");
    database.prepare("DELETE FROM quotations WHERE id = ?").run(id);
  })();
  return true;
}
