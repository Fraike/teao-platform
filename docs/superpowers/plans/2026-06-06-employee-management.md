# 员工管理模块 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为特澳科技业务工具平台添加员工管理模块，支持在职/离职员工列表、增删改查、合同到期提醒

**Architecture:** Express 后端新增 employees 路由和服务（JSON 文件存储），React 前端新增 EmployeePage（Tab切换+表格+搜索筛选）+ EmployeeFormModal（新增/编辑表单），Dashboard 增加入口卡片和合同到期提醒

**Tech Stack:** React 19, TypeScript, Ant Design 5, Express 4, JSON 文件存储

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `src/types/employee.ts` | Employee 类型定义 |
| 创建 | `server/services/employees.js` | 员工 CRUD + 种子数据 + 计算逻辑 |
| 创建 | `server/data/employees-seed.json` | Excel 转换后的初始数据 (85条) |
| 创建 | `server/routes/employees.js` | REST API 端点 |
| 修改 | `server/server.js` | 注册 employees 路由 |
| 创建 | `src/pages/EmployeePage.tsx` | 员工管理主页面 |
| 创建 | `src/pages/EmployeePage.module.css` | 页面样式 |
| 创建 | `src/components/EmployeeFormModal.tsx` | 新增/编辑弹窗表单 |
| 修改 | `src/App.tsx` | 添加 /employees 路由 |
| 修改 | `src/pages/Dashboard.tsx` | 添加员工管理入口 + 合同到期提醒 |

---

### Task 1: 创建 Employee 类型定义

**Files:**
- Create: `src/types/employee.ts`

- [ ] **Step 1: 创建 employee.ts**

```typescript
export interface Employee {
  id: string;
  employeeNo: string;
  name: string;
  gender: "男" | "女";
  idCard: string;
  birthDate: string;
  age: number;
  phone: string;
  department: string;
  position: string;
  education: string;
  address: string;
  entryDate: string;
  status: "active" | "resigned";
  resignDate?: string;
  dormitory: boolean;
  signedContract: boolean;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  contractRemainingDays: number;
  idCardExpiry: string;
  yearsOfService: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFormData {
  employeeNo: string;
  name: string;
  gender: "男" | "女";
  idCard: string;
  phone: string;
  department: string;
  position: string;
  education: string;
  address: string;
  entryDate: string;
  dormitory: boolean;
  signedContract: boolean;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  idCardExpiry: string;
  remark: string;
}
```

---

### Task 2: 创建后端员工服务

**Files:**
- Create: `server/services/employees.js`

- [ ] **Step 1: 创建 employees.js**

```javascript
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDataDir() {
  const envDir = process.env.DATA_DIR;
  if (envDir) return envDir;
  const prodDir = "/var/www/teao-platform/data";
  try {
    if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
    return prodDir;
  } catch {
    const localDir = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    return localDir;
  }
}

const DATA_DIR = resolveDataDir();
const EMPLOYEES_FILE = path.join(DATA_DIR, "employees.json");
const SEED_FILE = path.join(__dirname, "../data/employees-seed.json");

function generateId() {
  return `emp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function calcAge(birthDate) {
  if (!birthDate) return 0;
  const [y, m, d] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

function calcYearsOfService(entryDate) {
  if (!entryDate) return "";
  const [y, m] = entryDate.split("-").map(Number);
  const now = new Date();
  let years = now.getFullYear() - y;
  let months = now.getMonth() + 1 - m;
  if (months < 0) { years--; months += 12; }
  return `${years}年${months}月`;
}

function calcContractRemaining(contractEndDate) {
  if (!contractEndDate) return 0;
  const end = new Date(contractEndDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeEmployee(emp) {
  return {
    ...emp,
    age: calcAge(emp.birthDate),
    contractRemainingDays: calcContractRemaining(emp.contractEndDate),
    yearsOfService: calcYearsOfService(emp.entryDate),
  };
}

// ---- file I/O ----

function readEmployees() {
  try {
    if (!fs.existsSync(EMPLOYEES_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(EMPLOYEES_FILE, "utf-8"));
    return (data.employees || data).map(normalizeEmployee);
  } catch {
    return [];
  }
}

function writeEmployees(employees) {
  const dir = path.dirname(EMPLOYEES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify({ employees }, null, 2), "utf-8");
}

// ---- seed ----

export function initEmployeeData() {
  if (readEmployees().length > 0) return;
  try {
    if (!fs.existsSync(SEED_FILE)) {
      console.log("[employees] no seed file, skipping");
      return;
    }
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));
    const employees = seed.map((emp) => ({
      ...emp,
      id: generateId(),
      createdAt: today(),
      updatedAt: today(),
    }));
    writeEmployees(employees);
    console.log(`[employees] seeded ${employees.length} employees from Excel data`);
  } catch (err) {
    console.error("[employees] seed failed:", err.message);
  }
}

// ---- public API ----

export function listEmployees(status) {
  let list = readEmployees();
  if (status === "active") list = list.filter((e) => e.status === "active");
  if (status === "resigned") list = list.filter((e) => e.status === "resigned");
  return list;
}

export function getEmployee(id) {
  return readEmployees().find((e) => e.id === id) || null;
}

export function createEmployee(data) {
  const employees = readEmployees();
  const emp = {
    ...data,
    id: generateId(),
    status: "active",
    createdAt: today(),
    updatedAt: today(),
  };
  employees.push(normalizeEmployee(emp));
  writeEmployees(employees);
  return normalizeEmployee(emp);
}

export function updateEmployee(id, data) {
  const employees = readEmployees();
  const idx = employees.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  employees[idx] = {
    ...employees[idx],
    ...data,
    id: employees[idx].id,
    updatedAt: today(),
  };
  writeEmployees(employees);
  return normalizeEmployee(employees[idx]);
}

export function resignEmployee(id) {
  const employees = readEmployees();
  const idx = employees.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  employees[idx].status = "resigned";
  employees[idx].resignDate = today();
  employees[idx].updatedAt = today();
  writeEmployees(employees);
  return normalizeEmployee(employees[idx]);
}

export function getContractReminders() {
  const employees = readEmployees().filter((e) => e.status === "active");
  const expired = employees.filter((e) => e.contractRemainingDays < 0);
  const expiring = employees.filter((e) => e.contractRemainingDays >= 0 && e.contractRemainingDays <= 60);
  return { expired, expiring, total: employees.length };
}
```

---

### Task 3: 创建后端路由 + 接入服务器

**Files:**
- Create: `server/routes/employees.js`
- Modify: `server/server.js`

- [ ] **Step 1: 创建 routes/employees.js**

```javascript
import {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, resignEmployee, getContractReminders,
} from "../services/employees.js";
import { jwtAuth } from "../middleware/jwt-auth.js";

export function registerEmployeeRoutes(app) {
  // 列表 + 合同提醒
  app.get("/api/employees", jwtAuth, (req, res) => {
    const { status } = req.query;
    res.json(listEmployees(status || null));
  });

  app.get("/api/employees/reminders", jwtAuth, (_req, res) => {
    res.json(getContractReminders());
  });

  // 单个员工
  app.get("/api/employees/:id", jwtAuth, (req, res) => {
    const emp = getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });

  // 新增
  app.post("/api/employees", jwtAuth, (req, res) => {
    const data = req.body;
    if (!data.name || !data.department || !data.position) {
      return res.status(400).json({ error: "姓名、部门、职位为必填项" });
    }
    const emp = createEmployee(data);
    res.status(201).json(emp);
  });

  // 编辑
  app.put("/api/employees/:id", jwtAuth, (req, res) => {
    const emp = updateEmployee(req.params.id, req.body);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });

  // 离职（软删除）
  app.delete("/api/employees/:id", jwtAuth, (req, res) => {
    const emp = resignEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });
}
```

- [ ] **Step 2: 修改 server/server.js — 添加 import 和路由注册**

读取 `server/server.js`，在 import 区域末尾添加：
```javascript
import { initEmployeeData } from "./services/employees.js";
import { registerEmployeeRoutes } from "./routes/employees.js";
```

在 `initDefaultAdmin();` 之后添加：
```javascript
initEmployeeData();
```

在 `registerAdminRoutes(app);` 之后添加：
```javascript
registerEmployeeRoutes(app);
```

---

### Task 4: Excel 数据转换 → 种子数据

**Files:**
- Create: `server/data/employees-seed.json`

- [ ] **Step 1: 运行转换脚本生成种子数据**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && node -e "
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const wb = XLSX.readFile('public/members/特澳在职人员名单 .xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Skip header row
const dataRows = rows.slice(1).filter(r => r[0] && String(r[0]).trim());

function parseDate(val) {
  if (!val) return '';
  let s = String(val).trim();
  // Handle '2013年4月28日'
  const cnMatch = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnMatch) return cnMatch[1] + '-' + cnMatch[2].padStart(2,'0') + '-' + cnMatch[3].padStart(2,'0');
  // Normalize separators
  s = s.replace(/[\/.]/g, '-');
  const parts = s.split('-');
  if (parts.length === 3) {
    // Fix swapped year issues
    let [a, b, c] = parts;
    if (a.length === 4) return a + '-' + b.padStart(2,'0') + '-' + c.padStart(2,'0');
    if (c.length === 4) return c + '-' + a.padStart(2,'0') + '-' + b.padStart(2,'0');
  }
  return s;
}

function extractDeptAndPos(raw) {
  const s = String(raw || '').trim();
  const depts = ['装配部','注塑部','品质部','生管部','工程部','行政部','业务部','财务部','总经办'];
  for (const d of depts) {
    if (s.includes(d)) {
      let pos = s.replace(d, '').trim();
      if (!pos) pos = '员工';
      return { department: d, position: pos };
    }
  }
  return { department: '其他', position: s || '员工' };
}

const employees = [];
for (const row of dataRows) {
  const name = String(row[0] || '').trim();
  const deptPos = extractDeptAndPos(row[1]);
  const status = String(row[3] || '').trim() === '离职' ? 'resigned' : 'active';
  const deptPos2 = extractDeptAndPos(row[1]);

  const emp = {
    employeeNo: String(row[2] || '').trim(),
    name,
    gender: String(row[5] || '').trim() === '女' ? '女' : '男',
    idCard: String(row[6] || '').trim(),
    birthDate: parseDate(row[7]),
    age: parseInt(String(row[8] || '0')) || 0,
    phone: String(row[9] || '').trim(),
    entryDate: parseDate(row[10]),
    education: String(row[11] || '').trim(),
    dormitory: String(row[12] || '').trim() === '是',
    signedContract: String(row[13] || '').trim() === '是',
    idCardExpiry: String(row[14] || '').trim(),
    contractType: String(row[16] || '劳动合同').trim(),
    contractStartDate: parseDate(row[17]),
    contractEndDate: parseDate(row[18]),
    contractRemainingDays: parseInt(String(row[19] || '0')) || 0,
    yearsOfService: String(row[20] || '').trim(),
    status,
    address: String(row[4] || '').trim(),
    department: deptPos2.department,
    position: deptPos2.position,
    resignDate: status === 'resigned' ? (parseDate(row[18]) || '') : '',
    remark: '',
  };
  employees.push(emp);
}

const outDir = path.dirname('server/data/employees-seed.json');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync('server/data/employees-seed.json', JSON.stringify(employees, null, 2));
console.log('Converted ' + employees.length + ' employees to seed data');
console.log('Active: ' + employees.filter(e => e.status === 'active').length);
console.log('Resigned: ' + employees.filter(e => e.status === 'resigned').length);
console.log('Departments: ' + [...new Set(employees.map(e => e.department))].join(', '));
"
```

Expected output:
```
Converted 85 employees to seed data
Active: ~80
Resigned: ~5
Departments: 装配部, 注塑部, 品质部, 生管部, 工程部, 行政部, 业务部, 财务部, 其他
```

注意：如果 xlsx 包未安装，需先运行 `npm install xlsx`。

- [ ] **Step 2: 验证种子文件**

```bash
node -e "const d = require('/Users/mikewang/AI_Workspace/teao-platform/server/data/employees-seed.json'); console.log('Total:', d.length); console.log('Sample:', JSON.stringify(d[0], null, 2))"
```

---

### Task 5: 创建员工管理主页面

**Files:**
- Create: `src/pages/EmployeePage.tsx`
- Create: `src/pages/EmployeePage.module.css`

- [ ] **Step 1: 创建 EmployeePage.module.css**

```css
.container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.filterBar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.contractExpired {
  color: #ff4d4f;
  font-weight: 500;
}

.contractExpiring {
  color: #faad14;
  font-weight: 500;
}

.contractNormal {
  color: #52c41a;
}
```

- [ ] **Step 2: 创建 EmployeePage.tsx**

```typescript
import { useEffect, useState, useCallback } from "react";
import {
  Table, Button, Tag, Input, Select, Space, Typography,
  Popconfirm, message, Tabs, Badge,
} from "antd";
import {
  PlusOutlined, SearchOutlined, ExportOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { api } from "../lib/api";
import type { Employee } from "../types/employee";
import { EmployeeFormModal } from "../components/EmployeeFormModal";
import styles from "./EmployeePage.module.css";

const { Title } = Typography;

const DEPARTMENT_OPTIONS = [
  "装配部", "注塑部", "品质部", "生管部", "工程部",
  "行政部", "业务部", "财务部", "总经办", "其他",
];

export default function EmployeePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const status = activeTab === "all" ? null : activeTab;
      const data = await api.get<Employee[]>(
        `/api/employees${status ? `?status=${status}` : ""}`
      );
      setEmployees(data);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleAdd = () => {
    setEditingEmployee(null);
    setModalOpen(true);
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/employees/${id}`);
      message.success("已标记为离职");
      fetchEmployees();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingEmployee(null);
  };

  const handleModalSuccess = () => {
    handleModalClose();
    fetchEmployees();
  };

  // Filter + search
  const filtered = employees.filter((e) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !e.name.toLowerCase().includes(s) &&
        !e.employeeNo.toLowerCase().includes(s) &&
        !e.phone.includes(s)
      ) return false;
    }
    if (deptFilter && e.department !== deptFilter) return false;
    return true;
  });

  const columns: TableColumnsType<Employee> = [
    { title: "姓名", dataIndex: "name", key: "name", width: 100, fixed: "left" },
    { title: "工号", dataIndex: "employeeNo", key: "employeeNo", width: 100 },
    { title: "部门", dataIndex: "department", key: "department", width: 90,
      render: (d: string) => <Tag>{d}</Tag>,
    },
    { title: "职位", dataIndex: "position", key: "position", width: 110 },
    { title: "性别", dataIndex: "gender", key: "gender", width: 60 },
    { title: "手机号", dataIndex: "phone", key: "phone", width: 130 },
    { title: "入职日期", dataIndex: "entryDate", key: "entryDate", width: 110 },
    { title: "工龄", dataIndex: "yearsOfService", key: "yearsOfService", width: 90 },
    { title: "学历", dataIndex: "education", key: "education", width: 70 },
    {
      title: "合同到期", dataIndex: "contractEndDate", key: "contractEndDate", width: 130,
      render: (_: string, record: Employee) => {
        const days = record.contractRemainingDays;
        if (days < 0) return <span className={styles.contractExpired}>⚠ 已过期({Math.abs(days)}天)</span>;
        if (days <= 60) return <span className={styles.contractExpiring}>⚠ {record.contractEndDate} ({days}天)</span>;
        return <span className={styles.contractNormal}>{record.contractEndDate} ({days}天)</span>;
      },
    },
    { title: "合同类型", dataIndex: "contractType", key: "contractType", width: 90 },
    {
      title: "操作", key: "action", width: 140, fixed: "right",
      render: (_: unknown, record: Employee) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          {record.status === "active" && (
            <Popconfirm
              title="确认将该员工标记为离职？"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" danger size="small">离职</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: "active", label: "在职员工" },
    { key: "resigned", label: "离职员工" },
  ];

  const countByStatus = (status: string) => employees.filter((e) => e.status === status).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={4} style={{ margin: 0 }}>员工管理</Title>
        <Space>
          <Button icon={<ExportOutlined />}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增员工
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems.map((t) => ({
          ...t,
          label: (
            <span>
              {t.label}
              {activeTab === t.key && (
                <span style={{ marginLeft: 8, color: '#999' }}>({filtered.length})</span>
              )}
            </span>
          ),
        }))}
      />

      <div className={styles.filterBar}>
        <Input
          placeholder="搜索姓名/工号/手机号"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          placeholder="部门筛选"
          value={deptFilter}
          onChange={setDeptFilter}
          allowClear
          style={{ width: 140 }}
          options={DEPARTMENT_OPTIONS.map((d) => ({ label: d, value: d }))}
        />
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        size="middle"
        pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (t) => `共 ${t} 人` }}
      />

      <EmployeeFormModal
        open={modalOpen}
        employee={editingEmployee}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
```

---

### Task 6: 创建员工表单弹窗

**Files:**
- Create: `src/components/EmployeeFormModal.tsx`

- [ ] **Step 1: 创建 EmployeeFormModal.tsx**

```typescript
import { useEffect, useState } from "react";
import {
  Modal, Form, Input, Select, DatePicker, Radio, Button, message,
  Row, Col, Divider,
} from "antd";
import dayjs from "dayjs";
import { api } from "../lib/api";
import type { Employee, EmployeeFormData } from "../types/employee";

interface EmployeeFormModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DEPARTMENT_OPTIONS = [
  "装配部", "注塑部", "品质部", "生管部", "工程部",
  "行政部", "业务部", "财务部", "总经办",
];

const EDUCATION_OPTIONS = ["小学", "初中", "职高", "中专", "高中", "大专", "本科", "硕士"];

export function EmployeeFormModal({
  open, employee, onClose, onSuccess,
}: EmployeeFormModalProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!employee;

  useEffect(() => {
    if (open) {
      if (employee) {
        form.setFieldsValue({
          ...employee,
          entryDate: employee.entryDate ? dayjs(employee.entryDate) : null,
          contractStartDate: employee.contractStartDate ? dayjs(employee.contractStartDate) : null,
          contractEndDate: employee.contractEndDate ? dayjs(employee.contractEndDate) : null,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, employee, form]);

  const onFinish = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const data = {
        ...values,
        entryDate: values.entryDate
          ? (values.entryDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
        contractStartDate: values.contractStartDate
          ? (values.contractStartDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
        contractEndDate: values.contractEndDate
          ? (values.contractEndDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
      };

      if (isEdit) {
        await api.put(`/api/employees/${employee!.id}`, data);
        message.success("员工信息已更新");
      } else {
        await api.post("/api/employees", data);
        message.success("员工已添加");
      }
      onSuccess();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? "编辑员工" : "新增员工"}
      open={open}
      onCancel={onClose}
      width={720}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          gender: "男",
          education: "初中",
          dormitory: false,
          signedContract: true,
          contractType: "劳动合同",
        }}
      >
        <Divider plain>基本信息</Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: "必填" }]}>
              <Input placeholder="请输入姓名" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="employeeNo" label="工号">
              <Input placeholder="如 TA-004" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
              <Radio.Group>
                <Radio value="男">男</Radio>
                <Radio value="女">女</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="department" label="部门" rules={[{ required: true, message: "必填" }]}>
              <Select placeholder="选择部门" options={DEPARTMENT_OPTIONS.map((d) => ({ label: d, value: d }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="position" label="职位" rules={[{ required: true, message: "必填" }]}>
              <Input placeholder="如 主管、员工" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "必填" }]}>
              <Input placeholder="请输入手机号" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="idCard" label="身份证号">
              <Input placeholder="请输入身份证号" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="education" label="学历">
              <Select options={EDUCATION_OPTIONS.map((d) => ({ label: d, value: d }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="entryDate" label="入职日期" rules={[{ required: true, message: "必填" }]}>
              <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={16}>
            <Form.Item name="address" label="家庭地址">
              <Input placeholder="请输入地址" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="dormitory" label="是否住宿">
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Divider plain>合同信息</Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="contractType" label="合同类型">
              <Select options={[
                { label: "劳动合同", value: "劳动合同" },
                { label: "劳务合同", value: "劳务合同" },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="contractStartDate" label="合同起始时间">
              <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="contractEndDate" label="合同结束时间">
              <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="signedContract" label="是否签署合同">
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="idCardExpiry" label="身份证有效期限">
              <Input placeholder="如 长期 或 2038/2/9" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="remark" label="备注">
              <Input placeholder="备注信息" />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ textAlign: "right", marginTop: 16 }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "保存" : "添加"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
```

---

### Task 7: 接入 App.tsx + Dashboard

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: 修改 App.tsx — 添加 /employees 路由**

在 App.tsx 中：
1. 添加 lazy import（在 protected pages 区域）：
```typescript
const EmployeePage = lazy(() => import("./pages/EmployeePage"));
```

2. 在 AppLayout 的 `<Routes>` 中添加（在 `/process` 路由之后）：
```typescript
<Route path="/employees" element={<AuthGuard><EmployeePage /></AuthGuard>} />
```

3. 在 NAV_ITEMS 中添加导航项（在 `/process` 之后）：
```typescript
{ key: "/employees", icon: <TeamOutlined />, label: "员工管理" },
```

4. 在 @ant-design/icons 导入中添加 `TeamOutlined`

- [ ] **Step 2: 修改 Dashboard.tsx — 添加员工管理入口卡片**

读取现有 Dashboard.tsx，在卡片列表中添加：
```typescript
{
  title: "员工管理",
  description: "在职/离职员工档案，合同到期提醒",
  icon: <TeamOutlined />,
  color: "#eb2f96",
  bgColor: "#fff0f6",
  path: "/employees",
}
```

在 Dashboard.tsx 顶部添加合同到期提醒横幅（读取 `/api/employees/reminders`）。

---

### Task 8: 合同到期提醒 + 端到端验证

- [ ] **Step 1: 启动后端验证**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform/server && DATA_DIR=/Users/mikewang/AI_Workspace/teao-platform/data node server.js
```

Expected: `[employees] seeded 85 employees from Excel data`

- [ ] **Step 2: 测试 API**

```bash
# 列表
curl -s http://127.0.0.1:3899/api/employees -H "Authorization: Bearer $(curl -s -X POST http://127.0.0.1:3899/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"Total: {len(d)}")'

# 合同提醒
curl -s http://127.0.0.1:3899/api/employees/reminders -H "Authorization: Bearer <token>" | python3 -m json.tool
```

- [ ] **Step 3: 前端验证**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npm run dev
```

浏览器验证：
1. 登录 → Dashboard 出现"员工管理"入口
2. 点击进入 → 在职员工列表正常显示（~80人）
3. 切换到离职 Tab → 显示离职员工（~5人）
4. 搜索功能正常
5. 部门筛选正常
6. 合同到期红色/黄色标记正确
7. 新增员工 → 表单提交 → 列表刷新
8. 编辑员工 → 修改 → 保存
9. 标记离职 → 确认 → 员工移到离职 Tab

- [ ] **Step 4: TypeScript 编译验证**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit
```

Expected: 零错误
