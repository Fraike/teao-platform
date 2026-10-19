# 生产日报填写功能 — 设计文档

**日期:** 2026-07-23  
**状态:** 已确认  
**目标:** 替代维格表录入，提供更优的数据录入和管理体验

---

## 一、目标与范围

### 1.1 核心目标
在特澳后台系统内新增生产日报填写功能，替代现有的维格表（Vikadata）录入方式。从录入体验、数据整理、操作效率三个方面超越维格表。

### 1.2 分期规划
- **第一期（本次）：** 装配部生产日报填写 + 查看
- **第二期（后续）：** 注塑部生产日报填写
- **后续迭代：** 数据导出、统计分析、自动报表

### 1.3 设计原则
- 录入体验优于维格表：智能填充、批量操作、快捷键
- 数据质量高于维格表：关联校验、自动计算、操作留痕
- 查询效率快于维格表：筛选、搜索、分组汇总

---

## 二、架构设计

### 2.1 整体架构

```
src/pages/ProductionEntryPage.tsx      ← 新建：生产日报录入页面
src/components/production/             ← 新建：生产日报组件
server/routes/production-entry.js      ← 新建：CRUD API + 审计日志
server/services/production-store.js    ← 新建：SQLite 数据访问层
data/production.db                     ← SQLite 数据库（git-ignored）
```

**与现有系统的关系：**
- 不修改 `ProductionReportPage.tsx`（企业微信汇总页面）
- 复用 `/api/kingdee/materials`、`/api/kingdee/customers`、`/api/employees` API
- 路由 `/production-entry` 挂载在侧边栏"装配部"菜单下

### 2.2 数据流

```
[录入页面] ←→ [API 层] ←→ [SQLite]
    ↓                        ↓
[关联数据]               [审计日志]
← 商品/客户/员工 API →   [audit_log 表]
```

### 2.3 技术栈

| 层 | 技术 |
|------|------|
| 前端页面 | React 19 + TypeScript + Ant Design 5 |
| 状态管理 | Zustand（筛选条件持久化） |
| 样式 | CSS Modules（`*.module.css`） |
| 数据存储 | SQLite（`better-sqlite3`） |
| API | Express 4 路由 + JWT 认证 |

---

## 三、数据库设计

### 3.1 主表 `assembly_records`

```sql
CREATE TABLE assembly_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT NOT NULL,           -- YYYY-MM-DD
  line            TEXT NOT NULL,           -- 产线
  customer        TEXT NOT NULL,           -- 客户名称
  spec            TEXT,                    -- 规格
  product_name    TEXT NOT NULL,           -- 品名（关联商品资料）
  material_batch  TEXT,                    -- 原材料批号
  work_hours      REAL,                    -- 当天工作时间
  production_batch TEXT,                   -- 生产批号
  order_qty       INTEGER DEFAULT 0,       -- 订单数量
  daily_qty       INTEGER DEFAULT 0,       -- 当天生产数量
  plan_qty        INTEGER DEFAULT 0,       -- 计划生产数量
  cumulative_qty  INTEGER DEFAULT 0,       -- 累计生产数量
  defects         INTEGER DEFAULT 0,       -- 不良数
  -- 工序人员
  oil_injection   TEXT,                    -- 注油
  rubber_ring     TEXT,                    -- 装胶圈
  capping         TEXT,                    -- 盖盖子
  shaft_core      TEXT,                    -- 放轴芯
  ultrasonic      TEXT,                    -- 超声
  testing         TEXT,                    -- 测试
  gear            TEXT,                    -- 装齿轮
  -- 元数据
  filler          TEXT,                    -- 填表人
  remark          TEXT,                    -- 备注
  created_at      TEXT NOT NULL,           -- ISO 时间戳
  updated_at      TEXT NOT NULL,           -- ISO 时间戳
  created_by      TEXT NOT NULL,           -- 创建人用户名
  updated_by      TEXT NOT NULL            -- 最后编辑人用户名
);

CREATE INDEX idx_assembly_date ON assembly_records(date);
CREATE INDEX idx_assembly_line ON assembly_records(line);
CREATE INDEX idx_assembly_product ON assembly_records(product_name);
CREATE INDEX idx_assembly_customer ON assembly_records(customer);
```

### 3.2 计算字段（不入库，查询时实时计算）

| 字段 | 公式 |
|------|------|
| 计划达成率 | `daily_qty / plan_qty`（plan_qty > 0 时） |
| 合格率 | `(daily_qty - defects) / daily_qty`（daily_qty > 0 时） |
| PPM | `(defects / cumulative_qty) × 1,000,000`（cumulative_qty > 0 时） |
| 订单累计欠数 | `order_qty - cumulative_qty` |

### 3.3 审计日志表 `audit_log`

```sql
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id   INTEGER NOT NULL,          -- 关联 assembly_records.id
  action      TEXT NOT NULL,             -- INSERT | UPDATE | DELETE
  field_name  TEXT NOT NULL,             -- 变更字段（* 表示整行）
  old_value   TEXT,                      -- 旧值（JSON string）
  new_value   TEXT,                      -- 新值（JSON string）
  changed_by  TEXT NOT NULL,             -- 操作人用户名
  changed_at  TEXT NOT NULL              -- ISO 时间戳
);

CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_time ON audit_log(changed_at);
```

---

## 四、页面设计

### 4.1 页面路由和菜单

- 路由: `/production-entry`
- 侧边栏位置: "装配部"菜单下新增"生产日报录入"子菜单
- 权限: `production` 权限可访问

### 4.2 页面布局

```
┌──────────────────────────────────────────────────────────┐
│  生产日报录入 — 装配部                                      │
├──────────────────────────────────────────────────────────┤
│  筛选栏                                                    │
│  [日期范围: 2026-07-14 ~ 2026-07-23] [产线▼] [品名搜索...]  │
│  [客户▼] [全局搜索...]                          [+ 新增录入] │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─ 2026-07-23 ────────────────────────────────────────┐  │
│  │  品名│规格│客户│批号│计划│当天│累计│不良│合格率│工序│操作│  │
│  │  xxx │xxx │xxx │xxx │7500│7500│7500│ 6  │99.9%│... │✏️🗑│  │
│  │  yyy │yyy │yyy │yyy │5000│5000│5000│ 0  │100% │... │✏️🗑│  │
│  │  [+ 新增一行（当天）]                                 │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │  当日汇总: 产线 2条 │ 计划 12500 │ 实际 12500 │       │  │
│  │           达成率 100% │ 不良 6 │ 合格率 99.9%         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ 2026-07-22 ────────────────────────────────────────┐  │
│  │  ...（同上结构）                                       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ... 共展示最近 10 天，向下滚动加载更多 ...                  │
└──────────────────────────────────────────────────────────┘
```

### 4.3 表单设计（Drawer 侧边抽屉）

```
┌──────────────────────────────────────────────┐
│  新增生产记录 / 编辑生产记录              [✕]  │
├──────────────────────────────────────────────┤
│  基本信息                                      │
│  日期 *        [2026-07-23]                   │
│  产线 *        [▼ 12# / 15# / ...]           │
│  品名 *        [🔍 搜索商品...（成品分类）]     │
│  客户 *        [🔍 搜索客户...]               │
│  规格           [选品名后自动带入]              │
│  生产批号      [_______________]              │
│  原材料批号    [_______________]              │
│  工作时间      [____] 小时                    │
│  ────────────────────────────────             │
│  生产数据                                      │
│  订单数量      [________]                     │
│  计划生产数量  [________]                     │
│  当天生产数量  [________]                     │
│  累计生产数量  [________]                     │
│  不良数        [________]                     │
│  ────────────────────────────────             │
│  工序人员                                      │
│  注油   [🔍 选员工...（可多选）]              │
│  装胶圈 [🔍 选员工...]                        │
│  盖盖子 [🔍 选员工...]                        │
│  放轴芯 [🔍 选员工...]                        │
│  超声   [🔍 选员工...]                        │
│  测试   [🔍 选员工...]                        │
│  装齿轮 [🔍 选员工...]                        │
│  ────────────────────────────────             │
│  其他                                          │
│  填表人   [🔍 选员工...]                      │
│  备注     [________________]                  │
│  ────────────────────────────────             │
│  计算预览（只读）                               │
│  计划达成率  100%   合格率  99.9%              │
│  PPM         800    订单累计欠数  0            │
│  ────────────────────────────────             │
│  最后编辑: 张三, 2026-07-23 14:30（仅编辑模式）  │
├──────────────────────────────────────────────┤
│              [取消]    [保存]                  │
└──────────────────────────────────────────────┘
```

### 4.4 关联数据选择器

| 字段 | 数据源 | API | 过滤条件 |
|------|--------|-----|----------|
| 品名 | 商品资料 | `GET /api/kingdee/materials` | `?category=<成品ID>` |
| 客户 | 客户资料 | `GET /api/kingdee/customers` | `?search=` |
| 工序人员 | 员工档案 | `GET /api/employees` | `?status=active` |
| 填表人 | 员工档案 | `GET /api/employees` | `?status=active` |

所有选择器均使用 Ant Design `Select` 组件，`showSearch` + `filterOption` 实现前端搜索，或使用 `onSearch` 远程搜索。

### 4.5 表格列定义

以当天卡片内表格为准，按重要性排列：

| 列 | 宽度 | 可编辑 | 说明 |
|------|------|--------|------|
| 品名 | 150 | 否 | 来自商品资料 |
| 规格 | 90 | 否 | 自动带入 |
| 客户 | 100 | 否 | 来自客户资料 |
| 生产批号 | 110 | 否 | — |
| 订单数量 | 85 | 否 | — |
| 计划生产数量 | 95 | 否 | — |
| 当天生产数量 | 95 | 是（行内编辑） | 核心字段 |
| 累计生产数量 | 95 | 否 | — |
| 不良数 | 70 | 是（行内编辑） | — |
| 合格率 | 75 | 否 | 自动计算 |
| 达成率 | 70 | 否 | 自动计算 |
| 欠数 | 70 | 否 | 自动计算 |
| 工序人员 | 120 | 否 | 缩略显示 |
| 备注 | 120 | 否 | — |
| 操作 | 80 | — | 编辑/删除按钮 |

---

## 五、API 设计

### 5.1 查询列表

```
GET /api/production/entries
  ?dateFrom=2026-07-14
  &dateTo=2026-07-23
  &line=12%23
  &product=xxx
  &customer=xxx
  &search=xxx
  &limit=10
  &offset=0

Response:
{
  "ok": true,
  "data": {
    "groups": [
      {
        "date": "2026-07-23",
        "records": [...],
        "summary": {
          "lines": 2,
          "totalPlanQty": 12500,
          "totalDailyQty": 12500,
          "totalCumulativeQty": 12500,
          "totalDefects": 6,
          "totalOrderQty": 25000,
          "achievementRate": 1.0,
          "qualifiedRate": 0.999,
          "totalBackorder": 12500
        }
      }
    ],
    "total": 1703,
    "hasMore": true
  }
}
```

### 5.2 新增记录

```
POST /api/production/entries
Body: { date, line, customer, product_name, ... }

Response:
{ "ok": true, "data": { "id": 1704, ... } }

副作用: 自动写入 audit_log（action=INSERT）
```

### 5.3 更新记录

```
PUT /api/production/entries/:id
Body: { daily_qty: 8000, defects: 3 }

Response:
{ "ok": true, "data": { ... } }

副作用: 逐字段比对 old/new，差异写入 audit_log（action=UPDATE）
```

### 5.4 删除记录

```
DELETE /api/production/entries/:id

Response:
{ "ok": true }

副作用: 写入 audit_log（action=DELETE，记录完整行数据）
```

### 5.5 查看修改历史

```
GET /api/production/entries/:id/history

Response:
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "action": "UPDATE",
      "field_name": "daily_qty",
      "old_value": "7500",
      "new_value": "8000",
      "changed_by": "张三",
      "changed_at": "2026-07-23T14:30:00.000Z"
    }
  ]
}
```

---

## 六、筛选和搜索

### 6.1 筛选条件

| 筛选项 | 组件 | 逻辑 |
|------|------|------|
| 日期范围 | `DatePicker.RangePicker` | `date BETWEEN from AND to` |
| 产线 | `Select` 多选 | `line IN (...)` |
| 品名 | `AutoComplete` | `product_name LIKE %search%` |
| 客户 | `Select` | `customer LIKE %search%` |
| 全局搜索 | `Input.Search` | 匹配品名/客户/批号/备注多字段 |

### 6.2 交互规则

- 默认展示最近 10 天数据（按 `date DESC`），滚动加载更早日期
- 筛选条件变更时 300ms 防抖后重新查询
- 搜索结果高亮匹配文本
- 筛选条件持久化到 Zustand + localStorage

---

## 七、操作留痕

### 7.1 记录内容

每次增删改操作自动写入 `audit_log` 表：

- **INSERT：** 记录 `action=INSERT, field_name="*", new_value=<整行JSON>`
- **UPDATE：** 逐字段比对旧值/新值，仅记录差异字段
- **DELETE：** 记录 `action=DELETE, field_name="*", old_value=<整行JSON>`

### 7.2 历史查看

每条记录旁有"历史"按钮，点击展示修改时间线：

```
2026-07-23 14:30 张三 修改 当天生产数量: 7500 → 8000
2026-07-23 11:00 李四 修改 不良数: 10 → 6
2026-07-22 09:00 张三 创建 此记录
```

---

## 八、性能策略

- **SQLite 索引：** `date`, `line`, `product_name`, `customer` 字段建索引
- **分页加载：** API 以"天"为单位分组返回，默认 10 天，`offset` 游标分页
- **防抖搜索：** 用户输入停止 300ms 后发起请求
- **计算字段不入库：** 达成率/合格率/PPM/欠数查询时 SQL 实时计算
- **行内编辑：** 仅"当天生产数量"和"不良数"支持行内编辑，减少抽屉打开频率
- **虚拟化评估：** 单日通常 <50 条记录，10 天 <500 条，无需虚拟滚动；后续超 1000 条时启用

---

## 九、边界情况

| 场景 | 处理 |
|------|------|
| 品名列表为空 | 显示"暂无商品数据"，提供跳转链接到商品资料页 |
| 员工列表为空 | 显示"暂无活跃员工"，工序人员字段退化为文本输入 |
| 旧日期数据 | 允许在任意历史日期新增/编辑记录 |
| 删除当天唯一记录 | 删除后该日期的卡片自动消失 |
| 并发编辑 | 保存时检查 `updated_at`，冲突时提示用户刷新 |
| 网络错误 | 操作失败时显示错误提示，不回退本地状态 |

---

## 十、超越维格表的体验优化

| 维度 | 维格表 | 本系统 |
|------|--------|--------|
| 品名输入 | 手动打字 | 搜索选择，自动带出规格 |
| 人员输入 | 手动打字 | 从员工档案选择，支持多选 |
| 计算字段 | 手动公式/复制 | 实时自动计算 |
| 数据校验 | 无 | 必填校验、数值范围校验 |
| 修改追溯 | 无 | 字段级审计日志 |
| 筛选查找 | 表格筛选 | 多维筛选+全局搜索 |
| 汇总统计 | 手动求和 | 每日自动汇总卡片 |
| 录入效率 | 逐行逐列填写 | 表单一次填写 + 行内快捷编辑 |
