# 生产日报填写功能 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现装配部生产日报填写功能，替代维格表录入：SQLite 存储 + CRUD API + 审计日志 + 前端 10 天分组卡片展示 + 筛选搜索 + 表单抽屉录入

**Architecture:** 后端 SQLite（better-sqlite3）存储生产记录和审计日志，Express API 提供 CRUD + 分组查询，前端新页面独立于现有 ProductionReportPage，复用现有商品/客户/员工 API 作为关联数据源

**Tech Stack:** React 19, TypeScript, Ant Design 5, Zustand 5, Express 4, better-sqlite3

## Global Constraints

- 使用 TypeScript，禁止 `any`
- 新代码使用 CSS modules（`*.module.css`）
- 不提交代码，等用户确认
- 不动 `ProductionReportPage.tsx`
- 品名从 `/api/kingdee/materials?category=<成品ID>` 选择
- 人员从 `/api/employees?status=active` 选择
- 客户从 `/api/kingdee/customers` 选择

---

### Task 1: 安装依赖 + 创建数据库服务层

**Files:**
- Create: `server/services/production-store.js`
- Modify: `package.json`（`npm install better-sqlite3`）

**Interfaces:**
- Produces: `initDB()` → void, `queryEntries(filters)` → `{groups, total, hasMore}`, `createEntry(data, user)` → entry, `updateEntry(id, data, user)` → entry, `deleteEntry(id, user)` → void, `getHistory(id)` → audit[]
- Produces: `formatDate(d)` → string, `calcAchievementRate(daily, plan)` → number|null, `calcQualifiedRate(daily, defects)` → number|null, `calcPPM(defects, cumulative)` → number|null, `calcBackorder(order, cumulative)` → number

- [ ] **Step 1: 安装 better-sqlite3**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npm install better-sqlite3
```

- [ ] **Step 2: 创建 `server/services/production-store.js`**

```js
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/production.db");

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

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id   INTEGER NOT NULL,
      action      TEXT NOT NULL,
      field_name  TEXT NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      changed_by  TEXT NOT NULL,
      changed_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(changed_at);
  `);
}

// 计算字段工具
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

function buildSummary(records) {
  const lines = new Set(records.map((r) => r.line)).size;
  const totalOrderQty = records.reduce((s, r) => s + (r.order_qty || 0), 0);
  const totalPlanQty = records.reduce((s, r) => s + (r.plan_qty || 0), 0);
  const totalDailyQty = records.reduce((s, r) => s + (r.daily_qty || 0), 0);
  const totalCumulativeQty = records.reduce((s, r) => s + (r.cumulative_qty || 0), 0);
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
    // 计算字段
    achievementRate: calcAchievementRate(row.daily_qty, row.plan_qty),
    qualifiedRate: calcQualifiedRate(row.daily_qty, row.defects),
    ppm: calcPPM(row.defects, row.cumulative_qty),
    backorder: calcBackorder(row.order_qty, row.cumulative_qty),
  };
}

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

  // 获取总记录数
  const countRow = d.prepare(`SELECT COUNT(*) as cnt FROM assembly_records ${where}`).get(params);
  const total = countRow.cnt;

  // 按日期分组查询：先获取符合条件的日期列表（分页），再获取这些日期的所有记录
  const dateRows = d.prepare(
    `SELECT DISTINCT date FROM assembly_records ${where} ORDER BY date DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset });

  const dates = dateRows.map((r) => r.date);
  if (dates.length === 0) return { groups: [], total: 0, hasMore: false };

  const placeholders = dates.map((_, i) => `@date${i}`).join(",");
  const dateParams = {};
  dates.forEach((dt, i) => { dateParams[`date${i}`] = dt; });

  const allRows = d.prepare(
    `SELECT * FROM assembly_records WHERE date IN (${placeholders}) ORDER BY date DESC, line ASC, id ASC`
  ).all(dateParams);

  // 按日期分组
  const groupMap = new Map();
  for (const row of allRows) {
    const d = row.date;
    if (!groupMap.has(d)) groupMap.set(d, []);
    groupMap.get(d).push(recordToRow(row));
  }

  const groups = dates.map((date) => {
    const records = groupMap.get(date) || [];
    return { date, records, summary: buildSummary(records) };
  });

  return {
    groups,
    total,
    hasMore: offset + limit < total,
  };
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

  // 审计日志: INSERT
  const row = d.prepare("SELECT * FROM assembly_records WHERE id = ?").get(result.lastInsertRowid);
  d.prepare(
    "INSERT INTO audit_log (record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(result.lastInsertRowid, "INSERT", "*", null, JSON.stringify(row), user, now);

  return recordToRow(row);
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

  // 批量写审计日志
  const auditStmt = d.prepare(
    "INSERT INTO audit_log (record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES (@record_id, @action, @field_name, @old_value, @new_value, @changed_by, @changed_at)"
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
  d.prepare(
    "INSERT INTO audit_log (record_id, action, field_name, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "DELETE", "*", JSON.stringify(old), null, user, now);

  d.prepare("DELETE FROM assembly_records WHERE id = ?").run(id);
  return true;
}

export function getHistory(id) {
  const d = getDB();
  return d.prepare(
    "SELECT * FROM audit_log WHERE record_id = ? ORDER BY changed_at DESC"
  ).all(id);
}
```

- [ ] **Step 3: 验证数据库初始化**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && node -e "
import('./server/services/production-store.js').then(m => {
  m.initDB();
  console.log('DB initialized OK');
  console.log('Tables:', require('better-sqlite3')('data/production.db').prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name));
}).catch(e => console.error(e));
"
```

预期：`DB initialized OK` + 表名列表包含 `assembly_records`, `audit_log`

---

### Task 2: 创建 API 路由

**Files:**
- Create: `server/routes/production-entry.js`

**Interfaces:**
- Consumes: `initDB`, `queryEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `getHistory` from `server/services/production-store.js`

- [ ] **Step 1: 创建 `server/routes/production-entry.js`**

```js
import { jwtAuth } from "../middleware/jwt-auth.js";
import {
  initDB,
  queryEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getHistory,
} from "../services/production-store.js";

// 确保数据库已初始化
initDB();

export function registerProductionEntryRoutes(app) {
  // 查询列表（按日期分组）
  app.get("/api/production/entries", jwtAuth, (req, res) => {
    try {
      const { dateFrom, dateTo, line, product, customer, search, limit, offset } = req.query;
      const result = queryEntries({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        line: line || undefined,
        product: product || undefined,
        customer: customer || undefined,
        search: search || undefined,
        limit: limit ? parseInt(limit, 10) : 10,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      res.json({ ok: true, data: result });
    } catch (err) {
      console.error("[production-entry] query error:", err);
      res.status(500).json({ error: "查询失败", detail: err.message });
    }
  });

  // 新增
  app.post("/api/production/entries", jwtAuth, (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const entry = createEntry(req.body, user);
      res.status(201).json({ ok: true, data: entry });
    } catch (err) {
      console.error("[production-entry] create error:", err);
      res.status(500).json({ error: "新增失败", detail: err.message });
    }
  });

  // 更新
  app.put("/api/production/entries/:id", jwtAuth, (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const entry = updateEntry(parseInt(req.params.id, 10), req.body, user);
      if (!entry) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true, data: entry });
    } catch (err) {
      console.error("[production-entry] update error:", err);
      res.status(500).json({ error: "更新失败", detail: err.message });
    }
  });

  // 删除
  app.delete("/api/production/entries/:id", jwtAuth, (req, res) => {
    try {
      const user = req.user?.username || "unknown";
      const ok = deleteEntry(parseInt(req.params.id, 10), user);
      if (!ok) return res.status(404).json({ error: "记录不存在" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[production-entry] delete error:", err);
      res.status(500).json({ error: "删除失败", detail: err.message });
    }
  });

  // 修改历史
  app.get("/api/production/entries/:id/history", jwtAuth, (req, res) => {
    try {
      const history = getHistory(parseInt(req.params.id, 10));
      res.json({ ok: true, data: history });
    } catch (err) {
      console.error("[production-entry] history error:", err);
      res.status(500).json({ error: "查询历史失败", detail: err.message });
    }
  });
}
```

- [ ] **Step 2: 注册路由到 `server/server.js`**

在 `server/server.js` 顶部 import 区域添加：

```js
import { registerProductionEntryRoutes } from "./routes/production-entry.js";
```

在 `registerKingdeeRoutes(app);` 之后添加：

```js
registerProductionEntryRoutes(app);
```

---

### Task 3: 创建 TypeScript 类型定义

**Files:**
- Create: `src/types/production.ts`

- [ ] **Step 1: 创建 `src/types/production.ts`**

```ts
export interface ProductionRecord {
  id: number;
  date: string; // YYYY-MM-DD
  line: string;
  customer: string;
  spec: string;
  productName: string;
  materialBatch: string;
  workHours: number;
  productionBatch: string;
  orderQty: number;
  dailyQty: number;
  planQty: number;
  cumulativeQty: number;
  defects: number;
  oilInjection: string;
  rubberRing: string;
  capping: string;
  shaftCore: string;
  ultrasonic: string;
  testing: string;
  gear: string;
  filler: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  // 计算字段
  achievementRate: number | null;
  qualifiedRate: number | null;
  ppm: number | null;
  backorder: number;
}

export interface DailyGroup {
  date: string;
  records: ProductionRecord[];
  summary: DailySummary;
}

export interface DailySummary {
  lines: number;
  totalOrderQty: number;
  totalPlanQty: number;
  totalDailyQty: number;
  totalCumulativeQty: number;
  totalDefects: number;
  achievementRate: number | null;
  qualifiedRate: number | null;
  totalBackorder: number;
}

export interface ProductionQuery {
  ok: boolean;
  data: {
    groups: DailyGroup[];
    total: number;
    hasMore: boolean;
  };
}

export interface ProductionEntryInput {
  date: string;
  line: string;
  customer: string;
  spec?: string;
  productName: string;
  materialBatch?: string;
  workHours?: number;
  productionBatch?: string;
  orderQty?: number;
  dailyQty?: number;
  planQty?: number;
  cumulativeQty?: number;
  defects?: number;
  oilInjection?: string;
  rubberRing?: string;
  capping?: string;
  shaftCore?: string;
  ultrasonic?: string;
  testing?: string;
  gear?: string;
  filler?: string;
  remark?: string;
}

export interface AuditLog {
  id: number;
  record_id: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
}

// 产线选项
export const ASSEMBLY_LINES = [
  "12#", "15#", "16#", "17#", "18#", "19#", "20#",
  "21#", "22#", "23#", "24#", "25#", "26#", "27#",
];

// 工序字段列表
export const PROCESS_FIELDS: { key: keyof ProductionEntryInput; label: string }[] = [
  { key: "oilInjection", label: "注油" },
  { key: "rubberRing", label: "装胶圈" },
  { key: "capping", label: "盖盖子" },
  { key: "shaftCore", label: "放轴芯" },
  { key: "ultrasonic", label: "超声" },
  { key: "testing", label: "测试" },
  { key: "gear", label: "装齿轮" },
];
```

---

### Task 4: 创建 Zustand 筛选状态 Store

**Files:**
- Create: `src/lib/productionStore.ts`

- [ ] **Step 1: 创建 `src/lib/productionStore.ts`**

```ts
import { create } from "zustand";

interface ProductionFilterState {
  dateFrom: string;
  dateTo: string;
  line: string | null;
  product: string;
  customer: string | null;
  search: string;
  // actions
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setLine: (v: string | null) => void;
  setProduct: (v: string) => void;
  setCustomer: (v: string | null) => void;
  setSearch: (v: string) => void;
  resetFilters: () => void;
}

function getDefaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 9);
  return d.toISOString().slice(0, 10);
}

function getDefaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useProductionStore = create<ProductionFilterState>((set) => ({
  dateFrom: getDefaultDateFrom(),
  dateTo: getDefaultDateTo(),
  line: null,
  product: "",
  customer: null,
  search: "",

  setDateFrom: (v) => set({ dateFrom: v }),
  setDateTo: (v) => set({ dateTo: v }),
  setLine: (v) => set({ line: v }),
  setProduct: (v) => set({ product: v }),
  setCustomer: (v) => set({ customer: v }),
  setSearch: (v) => set({ search: v }),
  resetFilters: () =>
    set({
      dateFrom: getDefaultDateFrom(),
      dateTo: getDefaultDateTo(),
      line: null,
      product: "",
      customer: null,
      search: "",
    }),
}));
```

---

### Task 5: 创建主页面 ProductionEntryPage

**Files:**
- Create: `src/pages/ProductionEntryPage.tsx`
- Create: `src/pages/ProductionEntryPage.module.css`

- [ ] **Step 1: 创建 CSS Module `src/pages/ProductionEntryPage.module.css`**

```css
.page {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}

.dailyCard {
  margin-bottom: 16px;
}

.dailyCardHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summaryRow {
  padding: 12px 16px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #666;
}

.summaryItem {
  display: flex;
  align-items: center;
  gap: 4px;
}

.summaryValue {
  font-weight: 600;
  color: #333;
}

.addRowBtn {
  padding: 8px 16px;
  color: #1677ff;
  cursor: pointer;
  border-top: 1px dashed #f0f0f0;
  text-align: center;
  font-size: 13px;
}

.addRowBtn:hover {
  background: #e6f4ff;
}

.loadMore {
  text-align: center;
  padding: 24px;
  color: #999;
}
```

- [ ] **Step 2: 创建 `src/pages/ProductionEntryPage.tsx`**

```tsx
import { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, DatePicker, Select, Input, Tag,
  Space, Typography, Spin, message, Popconfirm, Tooltip,
} from "antd";
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../lib/api";
import { useProductionStore } from "../lib/productionStore";
import { useIsMobile } from "../lib/useIsMobile";
import {
  ProductionRecord, DailyGroup, ProductionQuery, ASSEMBLY_LINES,
} from "../types/production";
import { EntryDrawer } from "../components/production/EntryDrawer";
import styles from "./ProductionEntryPage.module.css";

const { Title } = Typography;
const { RangePicker } = DatePicker;

export function ProductionEntryPage() {
  const isMobile = useIsMobile();
  const {
    dateFrom, dateTo, line, product, customer, search,
    setDateFrom, setDateTo, setLine, setProduct, setCustomer, setSearch,
    resetFilters,
  } = useProductionStore();

  const [groups, setGroups] = useState<DailyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");

  const fetchData = useCallback(
    async (append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (line) params.set("line", line);
        if (product) params.set("product", product);
        if (customer) params.set("customer", customer);
        if (search) params.set("search", search);
        params.set("limit", "10");
        params.set("offset", String(append ? offset : 0));

        const res = await api.get<ProductionQuery["data"]>(
          `/api/production/entries?${params.toString()}`
        ) as unknown as ProductionQuery["data"];
        // api.get returns T directly, but here we need the wrapper
        // Actually let's use the raw response

        const data = await fetch(
          `/api/production/entries?${params.toString()}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` } }
        ).then((r) => r.json());

        if (data.ok) {
          const d = data.data as ProductionQuery["data"];
          setGroups(append ? [...groups, ...d.groups] : d.groups);
          setTotal(d.total);
          setHasMore(d.hasMore);
          if (!append) setOffset(10);
          else setOffset((prev) => prev + 10);
        }
      } catch (err) {
        message.error("加载数据失败");
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, line, product, customer, search, offset]
  );

  // 注意：上述 fetchData 有两个问题：1) offset 闭包问题 2) 直接用 fetch 绕过了 api 工具
  // 修复版本：
  const fetchDataFixed = useCallback(
    async (currentOffset: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (line) params.set("line", line);
        if (product) params.set("product", product);
        if (customer) params.set("customer", customer);
        if (search) params.set("search", search);
        params.set("limit", "10");
        params.set("offset", String(currentOffset));

        const data = await api.get<ProductionQuery>(
          `/api/production/entries?${params.toString()}`
        ) as unknown as { ok: boolean; data: ProductionQuery["data"] };

        if (data.ok) {
          const d = data.data;
          setGroups(append ? [...groups, ...d.groups] : d.groups);
          setTotal(d.total);
          setHasMore(d.hasMore);
          setOffset(currentOffset + 10);
        }
      } catch (err) {
        message.error("加载数据失败");
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, line, product, customer, search, groups]
  );

  // 用正确版本替代
  const doFetch = useCallback(
    (append = false) => {
      fetchDataFixed(append ? offset : 0, append);
    },
    [fetchDataFixed, offset]
  );

  useEffect(() => {
    doFetch(false);
  }, [dateFrom, dateTo, line, product, customer, search]);

  const handleAdd = (date?: string) => {
    setEditingRecord(null);
    setDefaultDate(date || dateTo);
    setDrawerOpen(true);
  };

  const handleEdit = (record: ProductionRecord) => {
    setEditingRecord(record);
    setDefaultDate("");
    setDrawerOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/production/entries/${id}`);
      message.success("删除成功");
      doFetch(false);
    } catch (err) {
      message.error("删除失败");
    }
  };

  const handleDrawerClose = (saved: boolean) => {
    setDrawerOpen(false);
    setEditingRecord(null);
    if (saved) doFetch(false);
  };

  const columns = [
    { title: "品名", dataIndex: "productName", key: "productName", width: 150, ellipsis: true },
    { title: "规格", dataIndex: "spec", key: "spec", width: 90 },
    { title: "客户", dataIndex: "customer", key: "customer", width: 100 },
    { title: "生产批号", dataIndex: "productionBatch", key: "productionBatch", width: 110 },
    {
      title: "订单数量", dataIndex: "orderQty", key: "orderQty", width: 85,
      render: (v: number) => v?.toLocaleString() || "-",
    },
    {
      title: "计划数量", dataIndex: "planQty", key: "planQty", width: 85,
      render: (v: number) => v?.toLocaleString() || "-",
    },
    {
      title: "当天生产", dataIndex: "dailyQty", key: "dailyQty", width: 85,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v?.toLocaleString() || "-"}</span>,
    },
    {
      title: "累计生产", dataIndex: "cumulativeQty", key: "cumulativeQty", width: 85,
      render: (v: number) => v?.toLocaleString() || "-",
    },
    {
      title: "不良数", dataIndex: "defects", key: "defects", width: 65,
      render: (v: number) =>
        v > 0 ? <span style={{ color: "#ff4d4f" }}>{v}</span> : "0",
    },
    {
      title: "合格率", dataIndex: "qualifiedRate", key: "qualifiedRate", width: 75,
      render: (v: number | null) =>
        v != null ? <Tag color={v >= 0.95 ? "success" : "error"}>{(v * 100).toFixed(1)}%</Tag> : "-",
    },
    {
      title: "达成率", dataIndex: "achievementRate", key: "achievementRate", width: 75,
      render: (v: number | null) =>
        v != null ? <Tag color={v >= 1 ? "success" : v >= 0.9 ? "warning" : "error"}>{(v * 100).toFixed(0)}%</Tag> : "-",
    },
    {
      title: "欠数", dataIndex: "backorder", key: "backorder", width: 70,
      render: (v: number) =>
        v > 0 ? <span style={{ color: "#faad14" }}>{v.toLocaleString()}</span> : "-",
    },
    { title: "备注", dataIndex: "remark", key: "remark", width: 100, ellipsis: true },
    {
      title: "操作", key: "actions", width: 80, fixed: "right" as const,
      render: (_: unknown, record: ProductionRecord) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.page} style={{ padding: isMobile ? "12px" : "24px" }}>
      {/* Header */}
      <div className={styles.header}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>生产日报录入 — 装配部</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => doFetch(false)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>
            新增录入
          </Button>
        </Space>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <RangePicker
          value={dateFrom && dateTo ? [dayjs(dateFrom), dayjs(dateTo)] : null}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setDateFrom(dates[0].format("YYYY-MM-DD"));
              setDateTo(dates[1].format("YYYY-MM-DD"));
            } else {
              resetFilters();
            }
          }}
          allowClear
          size="small"
        />
        <Select
          placeholder="产线"
          value={line}
          onChange={setLine}
          allowClear
          size="small"
          style={{ width: 90 }}
          options={ASSEMBLY_LINES.map((l) => ({ value: l, label: l }))}
        />
        <Input
          placeholder="品名搜索"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          allowClear
          size="small"
          style={{ width: 140 }}
        />
        <Input
          placeholder="客户"
          value={customer || ""}
          onChange={(e) => setCustomer(e.target.value || null)}
          allowClear
          size="small"
          style={{ width: 120 }}
        />
        <Input
          placeholder="全局搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          size="small"
          style={{ width: 160 }}
          prefix={<SearchOutlined />}
        />
      </div>

      {/* Content */}
      <Spin spinning={loading}>
        {groups.length === 0 && !loading ? (
          <Card style={{ textAlign: "center", padding: 60 }}>
            <div style={{ color: "#999", marginBottom: 16 }}>暂无生产数据</div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>
              新增第一条记录
            </Button>
          </Card>
        ) : (
          <>
            {groups.map((group) => (
              <Card
                key={group.date}
                className={styles.dailyCard}
                title={
                  <div className={styles.dailyCardHeader}>
                    <span>
                      {group.date}（{dayjs(group.date).format("M月D日 ddd")}）
                      <Tag style={{ marginLeft: 8 }}>{group.summary.lines} 条产线</Tag>
                    </span>
                  </div>
                }
                extra={
                  <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAdd(group.date)}>
                    新增
                  </Button>
                }
                size="small"
              >
                <Table
                  columns={columns}
                  dataSource={group.records.map((r) => ({ ...r, key: r.id }))}
                  pagination={false}
                  size="small"
                  scroll={{ x: 1400 }}
                  bordered
                />
                {/* 当日汇总 */}
                <div className={styles.summaryRow}>
                  <div className={styles.summaryItem}>
                    产线 <span className={styles.summaryValue}>{group.summary.lines}</span> 条
                  </div>
                  <div className={styles.summaryItem}>
                    订单总量 <span className={styles.summaryValue}>{group.summary.totalOrderQty.toLocaleString()}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    计划 <span className={styles.summaryValue}>{group.summary.totalPlanQty.toLocaleString()}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    当天生产 <span className={styles.summaryValue} style={{ color: "#1677ff" }}>{group.summary.totalDailyQty.toLocaleString()}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    累计 <span className={styles.summaryValue}>{group.summary.totalCumulativeQty.toLocaleString()}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    达成率{" "}
                    <span className={styles.summaryValue} style={{ color: (group.summary.achievementRate ?? 0) >= 1 ? "#52c41a" : "#ff4d4f" }}>
                      {group.summary.achievementRate != null ? `${(group.summary.achievementRate * 100).toFixed(0)}%` : "-"}
                    </span>
                  </div>
                  <div className={styles.summaryItem}>
                    不良 <span className={styles.summaryValue} style={{ color: group.summary.totalDefects > 0 ? "#ff4d4f" : "#52c41a" }}>{group.summary.totalDefects}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    合格率{" "}
                    <span className={styles.summaryValue} style={{ color: (group.summary.qualifiedRate ?? 1) >= 0.95 ? "#52c41a" : "#ff4d4f" }}>
                      {group.summary.qualifiedRate != null ? `${(group.summary.qualifiedRate * 100).toFixed(1)}%` : "-"}
                    </span>
                  </div>
                  <div className={styles.summaryItem}>
                    欠数 <span className={styles.summaryValue} style={{ color: group.summary.totalBackorder > 0 ? "#faad14" : "#333" }}>{group.summary.totalBackorder.toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            ))}
            {hasMore && (
              <div className={styles.loadMore}>
                <Button onClick={() => doFetch(true)} loading={loading}>
                  加载更多（共 {total} 条）
                </Button>
              </div>
            )}
          </>
        )}
      </Spin>

      {/* Entry Drawer */}
      <EntryDrawer
        open={drawerOpen}
        record={editingRecord}
        defaultDate={defaultDate}
        onClose={handleDrawerClose}
      />
    </div>
  );
}
```

注意：上面 fetchData 有 bug（闭包 offset、直接 fetch 绕过了 api 工具），实际实现时使用 fetchDataFixed 版本。为简洁，最终文件只保留正确的 `doFetch` 实现。

---

### Task 6: 创建表单抽屉组件 EntryDrawer

**Files:**
- Create: `src/components/production/EntryDrawer.tsx`

- [ ] **Step 1: 创建 `src/components/production/EntryDrawer.tsx`**

```tsx
import { useState, useEffect } from "react";
import {
  Drawer, Form, Select, Input, InputNumber, DatePicker, Divider,
  Button, Space, message, Descriptions,
} from "antd";
import dayjs from "dayjs";
import { api } from "../../lib/api";
import {
  ProductionRecord, ProductionEntryInput,
  ASSEMBLY_LINES, PROCESS_FIELDS,
} from "../../types/production";

interface EntryDrawerProps {
  open: boolean;
  record: ProductionRecord | null;
  defaultDate: string;
  onClose: (saved: boolean) => void;
}

export function EntryDrawer({ open, record, defaultDate, onClose }: EntryDrawerProps) {
  const [form] = Form.useForm<ProductionEntryInput>();
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<{ value: string; label: string; spec?: string }[]>([]);
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);
  const [employees, setEmployees] = useState<{ value: string; label: string }[]>([]);
  const isEdit = !!record;

  // 加载关联数据
  useEffect(() => {
    if (!open) return;
    // 加载品名（成品分类）
    fetch("/api/kingdee/materials?category=成品")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setMaterials(
            d.data.map((m: { name: string; spec?: string }) => ({
              value: m.name,
              label: m.name,
              spec: m.spec || "",
            }))
          );
        }
      })
      .catch(() => {});

    // 加载客户
    fetch("/api/kingdee/customers")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setCustomers(d.data.map((c: { name: string }) => ({ value: c.name, label: c.name })));
      })
      .catch(() => {});

    // 加载员工
    fetch("/api/employees?status=active")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setEmployees(d.map((e: { name: string }) => ({ value: e.name, label: e.name })));
      })
      .catch(() => {});
  }, [open]);

  // 编辑模式回填
  useEffect(() => {
    if (!open) return;
    if (record) {
      form.setFieldsValue({
        date: record.date,
        line: record.line,
        productName: record.productName,
        customer: record.customer,
        spec: record.spec,
        productionBatch: record.productionBatch,
        materialBatch: record.materialBatch,
        workHours: record.workHours,
        orderQty: record.orderQty,
        planQty: record.planQty,
        dailyQty: record.dailyQty,
        cumulativeQty: record.cumulativeQty,
        defects: record.defects,
        oilInjection: record.oilInjection,
        rubberRing: record.rubberRing,
        capping: record.capping,
        shaftCore: record.shaftCore,
        ultrasonic: record.ultrasonic,
        testing: record.testing,
        gear: record.gear,
        filler: record.filler,
        remark: record.remark,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        date: defaultDate || dayjs().format("YYYY-MM-DD"),
        workHours: 10,
      });
    }
  }, [open, record, defaultDate, form]);

  const handleProductSelect = (value: string) => {
    const mat = materials.find((m) => m.value === value);
    if (mat?.spec) {
      form.setFieldValue("spec", mat.spec);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const payload = {
        ...values,
        date: typeof values.date === "string" ? values.date : dayjs(values.date).format("YYYY-MM-DD"),
      };

      if (isEdit) {
        await api.put(`/api/production/entries/${record!.id}`, payload);
        message.success("更新成功");
      } else {
        await api.post("/api/production/entries", payload);
        message.success("新增成功");
      }
      onClose(true);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return; // form validation
      message.error((err as Error).message || "保存失败");
    } finally {
      setLoading(false);
    }
  };

  // 计算预览
  const dailyQty = Form.useWatch("dailyQty", form) || 0;
  const planQty = Form.useWatch("planQty", form) || 0;
  const defects = Form.useWatch("defects", form) || 0;
  const cumulativeQty = Form.useWatch("cumulativeQty", form) || 0;
  const orderQty = Form.useWatch("orderQty", form) || 0;
  const achievementRate = planQty > 0 ? dailyQty / planQty : null;
  const qualifiedRate = dailyQty > 0 ? (dailyQty - defects) / dailyQty : null;
  const ppm = cumulativeQty > 0 ? Math.round((defects / cumulativeQty) * 1000000) : null;
  const backorder = orderQty - cumulativeQty;

  return (
    <Drawer
      title={isEdit ? "编辑生产记录" : "新增生产记录"}
      open={open}
      onClose={() => onClose(false)}
      width={520}
      extra={
        <Space>
          <Button onClick={() => onClose(false)}>取消</Button>
          <Button type="primary" onClick={handleSubmit} loading={loading}>保存</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" size="small">
        <Form.Item label="日期" name="date" rules={[{ required: true, message: "必填" }]}>
          <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="产线" name="line" rules={[{ required: true, message: "必填" }]}>
          <Select options={ASSEMBLY_LINES.map((l) => ({ value: l, label: l }))} />
        </Form.Item>
        <Form.Item label="品名" name="productName" rules={[{ required: true, message: "必填" }]}>
          <Select
            showSearch
            placeholder="搜索并选择商品（成品）"
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={materials}
            onSelect={handleProductSelect}
          />
        </Form.Item>
        <Form.Item label="客户" name="customer" rules={[{ required: true, message: "必填" }]}>
          <Select
            showSearch
            placeholder="搜索并选择客户"
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={customers}
          />
        </Form.Item>
        <Form.Item label="规格" name="spec">
          <Input disabled placeholder="选品名后自动带入" />
        </Form.Item>
        <Form.Item label="生产批号" name="productionBatch">
          <Input />
        </Form.Item>
        <Form.Item label="原材料批号" name="materialBatch">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="工作时间（小时）" name="workHours">
          <InputNumber style={{ width: "100%" }} min={0} max={24} />
        </Form.Item>

        <Divider>生产数据</Divider>

        <Form.Item label="订单数量" name="orderQty">
          <InputNumber style={{ width: "100%" }} min={0} />
        </Form.Item>
        <Form.Item label="计划生产数量" name="planQty">
          <InputNumber style={{ width: "100%" }} min={0} />
        </Form.Item>
        <Form.Item label="当天生产数量" name="dailyQty" rules={[{ required: true, message: "必填" }]}>
          <InputNumber style={{ width: "100%" }} min={0} />
        </Form.Item>
        <Form.Item label="累计生产数量" name="cumulativeQty">
          <InputNumber style={{ width: "100%" }} min={0} />
        </Form.Item>
        <Form.Item label="不良数" name="defects">
          <InputNumber style={{ width: "100%" }} min={0} />
        </Form.Item>

        <Divider>工序人员</Divider>

        {PROCESS_FIELDS.map(({ key, label }) => (
          <Form.Item key={key} label={label} name={key}>
            <Select
              mode="tags"
              showSearch
              placeholder={`选择${label}人员`}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={employees}
              maxTagCount={3}
            />
          </Form.Item>
        ))}

        <Divider>其他</Divider>

        <Form.Item label="填表人" name="filler">
          <Select
            showSearch
            placeholder="选择填表人"
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={employees}
          />
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Divider>计算预览（只读）</Divider>

        <Descriptions size="small" column={2}>
          <Descriptions.Item label="计划达成率">
            {achievementRate != null ? `${(achievementRate * 100).toFixed(0)}%` : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="合格率">
            {qualifiedRate != null ? `${(qualifiedRate * 100).toFixed(1)}%` : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="PPM">
            {ppm != null ? ppm.toLocaleString() : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="订单累计欠数">
            {backorder.toLocaleString()}
          </Descriptions.Item>
        </Descriptions>

        {isEdit && record && (
          <>
            <Divider>编辑信息</Divider>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="最后编辑">
                {record.updatedBy}，{record.updatedAt ? dayjs(record.updatedAt).format("YYYY-MM-DD HH:mm") : "-"}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Form>
    </Drawer>
  );
}
```

---

### Task 7: 修复 main.tsx dayjs 中文locale + 注册路由到 App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 App.tsx 注册路由**

在 `App.tsx` 中的 lazy imports 区域添加：

```tsx
const ProductionEntryPage = lazy(() => import("./pages/ProductionEntryPage").then((m) => ({ default: m.ProductionEntryPage })));
```

在 `<Routes>` 内部的 `<Route path="*" element={<AppLayout />}>` 之前，或者在 AppLayout 内部的 Routes 里添加：

```tsx
<Route path="/production-entry" element={<AuthGuard permission="production"><ProductionEntryPage /></AuthGuard>} />
```

由于 `ProductionEntryPage` 有独立的 header 和布局（不共享 AppLayout 的 Header），需要将其放在外部 Routes 中，不走 AppLayout。

在 `App.tsx` 的 主 `<Routes>` 里，在 `AppLayout` 之前添加独立路由：

```tsx
<Route path="/production-entry" element={
  <AuthGuard permission="production">
    <Suspense fallback={<PageLoader />}>
      <ProductionEntryPage />
    </Suspense>
  </AuthGuard>
} />
```

- [ ] **Step 2: 在侧边栏添加菜单项**

在 `NAV_ITEMS` 数组中，`production` 的 `children` 里添加：

```tsx
{
  key: "production",
  icon: <ToolOutlined />,
  label: "装配部",
  permission: "production",
  children: [
    { key: "/production-report", label: "生产日报" },
    { key: "/production-entry", label: "生产日报录入" },
  ],
},
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit --skipLibCheck
```

---

### Task 8: 从 Excel 导入假数据

**Files:**
- Create: `scripts/seed-production-data.js`（临时脚本，运行后删除）

- [ ] **Step 1: 创建并运行种子数据脚本**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && node -e "
import('./server/services/production-store.js').then(async (m) => {
  m.initDB();
  const { createEntry } = m;
  const now = new Date().toISOString();

  const sampleData = [
    { date:'2026-07-23', line:'12#', customer:'润丰', spec:'235-285', productName:'RD-T011-润丰-235-285', materialBatch:'座:20250224-156-5\\n盖:20260403-019-8', workHours:10, productionBatch:'20260420-001', orderQty:25000, dailyQty:7500, planQty:7500, cumulativeQty:7500, defects:6, oilInjection:'唐丽菊', rubberRing:'外发', capping:'陈丽敏', shaftCore:'陈丽敏', ultrasonic:'陈宇', testing:'叶宗姐,黄彩玉', gear:'杨嘉雯', filler:'18898510355', remark:'' },
    { date:'2026-07-23', line:'12#', customer:'润丰', spec:'290-350g', productName:'润丰RD-T011 290-350g', materialBatch:'下座:20250224-156-5', workHours:10, productionBatch:'20260420-003', orderQty:10000, dailyQty:1400, planQty:1400, cumulativeQty:1400, defects:5, oilInjection:'仇琼', rubberRing:'外发', capping:'陈丽敏', shaftCore:'陈丽敏', ultrasonic:'叶运青', testing:'叶宗姐,黄彩玉', gear:'杨嘉雯', filler:'18898510355', remark:'' },
    { date:'2026-07-22', line:'12#', customer:'润丰', spec:'235-285', productName:'RD-T011-润丰-235-285', materialBatch:'座:20250224-156-5', workHours:11, productionBatch:'20260420-001', orderQty:25000, dailyQty:7900, planQty:7700, cumulativeQty:15400, defects:0, oilInjection:'唐丽菊', rubberRing:'外发', capping:'陈丽敏', shaftCore:'陈丽敏', ultrasonic:'陈宇', testing:'叶宗姐,黄彩玉', gear:'杨嘉雯', filler:'18898510355', remark:'' },
    { date:'2026-07-22', line:'15#', customer:'华泰', spec:'200-250', productName:'HT-S003-华泰-200-250', materialBatch:'座:20260315-001-2', workHours:10, productionBatch:'20260718-002', orderQty:15000, dailyQty:5000, planQty:5000, cumulativeQty:10000, defects:3, oilInjection:'李四', rubberRing:'自产', capping:'王五', shaftCore:'王五', ultrasonic:'赵六', testing:'周七', gear:'吴八', filler:'admin', remark:'' },
    { date:'2026-07-21', line:'12#', customer:'润丰', spec:'235-285', productName:'RD-T011-润丰-235-285', materialBatch:'座:20250224-156-5', workHours:11, productionBatch:'20260420-001', orderQty:25000, dailyQty:8700, planQty:8800, cumulativeQty:24100, defects:0, oilInjection:'唐丽菊,杨彩珍', rubberRing:'外发', capping:'陈丽敏', shaftCore:'陈丽敏', ultrasonic:'陈宇', testing:'叶宗姐,黄彩玉', gear:'杨嘉雯', filler:'18898510355', remark:'' },
    { date:'2026-07-21', line:'15#', customer:'华泰', spec:'200-250', productName:'HT-S003-华泰-200-250', materialBatch:'座:20260315-001-2', workHours:10, productionBatch:'20260718-002', orderQty:15000, dailyQty:5200, planQty:5000, cumulativeQty:15200, defects:2, oilInjection:'李四', rubberRing:'自产', capping:'王五', shaftCore:'王五', ultrasonic:'赵六', testing:'周七', gear:'吴八', filler:'admin', remark:'超产' },
    { date:'2026-07-20', line:'12#', customer:'润丰', spec:'235-285', productName:'RD-T011-润丰-235-285', materialBatch:'座:20250224-156-5', workHours:2, productionBatch:'20260420-001', orderQty:25000, dailyQty:900, planQty:900, cumulativeQty:25000, defects:0, oilInjection:'杨彩珍', rubberRing:'外发', capping:'刘文静', shaftCore:'刘文静', ultrasonic:'陈宇', testing:'叶宗姐', gear:'杨嘉雯', filler:'18898510355', remark:'收尾' },
  ];

  for (const d of sampleData) {
    createEntry(d, 'admin');
  }
  console.log('Seeded ' + sampleData.length + ' records');
}).catch(e => console.error(e));
"
```

---

### 验证清单

- [ ] `npm run build` 无错误
- [ ] 访问 `/production-entry` 看到 7 条假数据按日期分组
- [ ] 点击 [+ 新增录入] 弹出抽屉，品名/客户/员工可选择
- [ ] 填写并保存一条新记录，页面自动刷新
- [ ] 编辑一条记录，保存后页面更新
- [ ] 删除一条记录
- [ ] 按日期范围筛选有效
- [ ] 按产线筛选有效
- [ ] 全局搜索有效
- [ ] 计算字段（达成率/合格率/PPM/欠数）实时显示正确
- [ ] 当日汇总数据正确
