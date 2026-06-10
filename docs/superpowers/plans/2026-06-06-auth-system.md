# 登录权限系统 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为特澳科技业务工具平台添加基于 JWT 的登录/注册/管理员审核权限系统

**Architecture:** Express 后端新增 auth/admin 路由 + JWT 中间件，React 前端新增登录/注册/管理页面 + AuthGuard 路由守卫，用户数据存储在 `data/users.json`

**Tech Stack:** Express 4, jsonwebtoken, Node.js crypto (scrypt), React 19, Zustand 5, Ant Design 5, react-router-dom v7

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `server/services/users.js` | 用户 CRUD，密码哈希，默认管理员初始化 |
| 创建 | `server/middleware/jwt-auth.js` | JWT 验证中间件 |
| 创建 | `server/routes/auth.js` | 登录/注册/获取当前用户 |
| 创建 | `server/routes/admin.js` | 管理员：用户列表/审核通过/驳回 |
| 修改 | `server/server.js` | 注册新路由，启动时初始化默认管理员 |
| 修改 | `server/package.json` | 添加 jsonwebtoken 依赖 |
| 创建 | `src/types/auth.ts` | User, LoginRequest, RegisterRequest 类型 |
| 创建 | `src/lib/api.ts` | API 请求封装（自动携带 JWT） |
| 创建 | `src/lib/authStore.ts` | Zustand 认证状态管理 |
| 创建 | `src/components/AuthGuard.tsx` | 路由守卫 |
| 创建 | `src/pages/LoginPage.tsx` | 登录页 |
| 创建 | `src/pages/LoginPage.module.css` | 登录页样式 |
| 创建 | `src/pages/RegisterPage.tsx` | 注册申请页 |
| 创建 | `src/pages/RegisterPage.module.css` | 注册页样式 |
| 创建 | `src/pages/AdminPage.tsx` | 管理员审核页 |
| 创建 | `src/pages/AdminPage.module.css` | 管理页样式 |
| 修改 | `src/App.tsx` | 添加路由、AuthGuard、导航栏用户信息 |

---

### Task 1: 安装 jsonwebtoken 依赖

- [ ] **Step 1: 安装 jsonwebtoken**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform/server && npm install jsonwebtoken
```

- [ ] **Step 2: 验证安装**

```bash
node -e "const jwt = require('jsonwebtoken'); console.log('jwt ok');"
```
Expected: `jwt ok`

---

### Task 2: 创建用户服务

**Files:**
- Create: `server/services/users.js`

- [ ] **Step 1: 创建 users.js**

```javascript
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || "/var/www/teao-platform/data";
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JWT_SECRET = process.env.JWT_SECRET || "teao-jwt-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")).users || [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), "utf-8");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString("hex") === hash);
    });
  });
}

function generateId() {
  return `u_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---- public API ----

export function initDefaultAdmin() {
  const users = readUsers();
  if (users.some((u) => u.role === "admin")) return;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync("admin123", salt, 64).toString("hex");
  users.push({
    id: generateId(),
    name: "管理员",
    username: "admin",
    passwordHash: `${salt}:${hash}`,
    role: "admin",
    status: "active",
    createdAt: new Date().toISOString(),
  });
  writeUsers(users);
  console.log("[auth] default admin created (admin / admin123)");
}

export async function registerUser({ name, username, password }) {
  const users = readUsers();
  if (users.some((u) => u.username === username)) {
    return { error: "用户名已存在" };
  }
  const passwordHash = await hashPassword(password);
  const user = {
    id: generateId(),
    name,
    username,
    passwordHash,
    role: "user",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return { ok: true };
}

export async function loginUser({ username, password }) {
  const users = readUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return { error: "用户名或密码错误" };
  if (user.status !== "active") return { error: "账号尚未通过审核，请联系管理员" };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: "用户名或密码错误" };
  // dynamic import to avoid top-level require in ES module
  const jwt = await import("jsonwebtoken");
  const token = jwt.default.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  return {
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  };
}

export function getUserById(id) {
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  return { id: user.id, name: user.name, username: user.username, role: user.role, status: user.status };
}

export function listUsers() {
  return readUsers().map(({ passwordHash, ...u }) => u);
}

export function approveUser(id) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return { error: "用户不存在" };
  if (users[idx].role === "admin") return { error: "不能审核管理员" };
  users[idx].status = "active";
  writeUsers(users);
  return { ok: true };
}

export function rejectUser(id) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return { error: "用户不存在" };
  if (users[idx].role === "admin") return { error: "不能驳回管理员" };
  users.splice(idx, 1);
  writeUsers(users);
  return { ok: true };
}

export { JWT_SECRET };
```

---

### Task 3: 创建 JWT 验证中间件

**Files:**
- Create: `server/middleware/jwt-auth.js`

- [ ] **Step 1: 创建 jwt-auth.js**

```javascript
import { JWT_SECRET } from "../services/users.js";

export function jwtAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录" });
  }
  const token = header.slice(7);
  // dynamic import for ES module compatibility
  import("jsonwebtoken").then((jwt) => {
    try {
      const payload = jwt.default.verify(token, JWT_SECRET);
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "登录已过期，请重新登录" });
    }
  }).catch(() => {
    return res.status(500).json({ error: "服务器错误" });
  });
}

export function adminAuth(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "无权限" });
  }
  next();
}
```

---

### Task 4: 创建认证路由

**Files:**
- Create: `server/routes/auth.js`

- [ ] **Step 1: 创建 auth.js**

```javascript
import { registerUser, loginUser, getUserById } from "../services/users.js";
import { jwtAuth } from "../middleware/jwt-auth.js";

export function registerAuthRoutes(app) {
  // 登录
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "请输入用户名和密码" });
    }
    const result = await loginUser({ username, password });
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });

  // 注册（提交申请）
  app.post("/api/auth/register", async (req, res) => {
    const { name, username, password } = req.body || {};
    if (!name || !username || !password) {
      return res.status(400).json({ error: "请填写完整信息" });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: "用户名需要 2-20 个字符" });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "密码至少 4 位" });
    }
    const result = await registerUser({ name, username, password });
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, message: "申请已提交，等待管理员审核" });
  });

  // 获取当前用户信息
  app.get("/api/auth/me", jwtAuth, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }
    res.json(user);
  });
}
```

---

### Task 5: 创建管理员路由

**Files:**
- Create: `server/routes/admin.js`

- [ ] **Step 1: 创建 admin.js**

```javascript
import { listUsers, approveUser, rejectUser } from "../services/users.js";
import { jwtAuth, adminAuth } from "../middleware/jwt-auth.js";

export function registerAdminRoutes(app) {
  // 获取所有用户
  app.get("/api/admin/users", jwtAuth, adminAuth, (_req, res) => {
    res.json(listUsers());
  });

  // 审核通过
  app.post("/api/admin/users/:id/approve", jwtAuth, adminAuth, (req, res) => {
    const result = approveUser(req.params.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // 驳回
  app.post("/api/admin/users/:id/reject", jwtAuth, adminAuth, (req, res) => {
    const result = rejectUser(req.params.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  });
}
```

---

### Task 6: 接入服务器

**Files:**
- Modify: `server/server.js`
- Modify: `server/package.json`

- [ ] **Step 1: 修改 server.js — 在路由注册区域添加新路由和初始化调用**

找到 `server/server.js` 中这两行：
```javascript
registerHistoryRoutes(app);
registerProductionRoutes(app);
```

替换为：
```javascript
import { initDefaultAdmin } from "./services/users.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";

// ---- init ----
initDefaultAdmin();

// ---- routes ----
registerHistoryRoutes(app);
registerProductionRoutes(app);
registerAuthRoutes(app);
registerAdminRoutes(app);
```

同时，在文件顶部 import 区域（`import { registerHistoryRoutes } ...` 之后）添加上面的 import 语句。

注意：`registerHistoryRoutes` 和 `registerProductionRoutes` 的 import 保持不变。

- [ ] **Step 2: 添加 package.json scripts 中的 type 确认**

`server/package.json` 已有 `"type": "module"`，无需修改。仅需确认 `jsonwebtoken` 已在 dependencies 中（Task 1 安装后自动添加）。

---

### Task 7: 创建前端类型定义

**Files:**
- Create: `src/types/auth.ts`

- [ ] **Step 1: 创建 auth.ts**

```typescript
export interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "user";
  status: "active" | "pending";
  createdAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  name: string;
  username: string;
  password: string;
}
```

---

### Task 8: 创建 API 请求封装

**Files:**
- Create: `src/lib/api.ts`

- [ ] **Step 1: 创建 api.ts**

```typescript
const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body) }),
};
```

---

### Task 9: 创建认证 Zustand Store

**Files:**
- Create: `src/lib/authStore.ts`

- [ ] **Step 1: 创建 authStore.ts**

```typescript
import { create } from "zustand";
import type { User, LoginRequest, RegisterRequest } from "../types/auth";
import { api, setToken, clearToken, getToken } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<string>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (req) => {
    const data = await api.post<{ token: string; user: User }>(
      "/api/auth/login",
      req
    );
    setToken(data.token);
    set({ user: data.user });
  },

  register: async (req) => {
    const data = await api.post<{ ok: boolean; message: string }>(
      "/api/auth/register",
      req
    );
    return data.message;
  },

  logout: () => {
    clearToken();
    set({ user: null });
  },

  fetchMe: async () => {
    const token = getToken();
    if (!token) {
      set({ initialized: true });
      return;
    }
    set({ loading: true });
    try {
      const user = await api.get<User>("/api/auth/me");
      set({ user, loading: false, initialized: true });
    } catch {
      clearToken();
      set({ user: null, loading: false, initialized: true });
    }
  },
}));
```

---

### Task 10: 创建 AuthGuard 路由守卫

**Files:**
- Create: `src/components/AuthGuard.tsx`

- [ ] **Step 1: 创建 AuthGuard.tsx**

```typescript
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuthStore } from "../lib/authStore";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, loading, initialized, fetchMe } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!initialized) {
      fetchMe();
    }
  }, [initialized, fetchMe]);

  if (!initialized || loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

---

### Task 11: 创建登录页

**Files:**
- Create: `src/pages/LoginPage.tsx`
- Create: `src/pages/LoginPage.module.css`

- [ ] **Step 1: 创建 LoginPage.module.css**

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
}

.card {
  width: 400px;
  max-width: 90vw;
}
```

- [ ] **Step 2: 创建 LoginPage.tsx**

```typescript
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message, Space } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import styles from "./LoginPage.module.css";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values);
      message.success("登录成功");
      navigate(from, { replace: true });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <Title level={3}>特澳科技业务工具平台</Title>
            <Text type="secondary">请登录以继续</Text>
          </div>
          <Form onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: "center" }}>
            <Text>没有账号？</Text> <Link to="/register">申请注册</Link>
          </div>
        </Space>
      </Card>
    </div>
  );
}
```

---

### Task 12: 创建注册页

**Files:**
- Create: `src/pages/RegisterPage.tsx`
- Create: `src/pages/RegisterPage.module.css`

- [ ] **Step 1: 创建 RegisterPage.module.css**

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
}

.card {
  width: 440px;
  max-width: 90vw;
}
```

- [ ] **Step 2: 创建 RegisterPage.tsx**

```typescript
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message, Space, Alert } from "antd";
import { UserOutlined, LockOutlined, IdcardOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import styles from "./RegisterPage.module.css";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const onFinish = async (values: {
    name: string;
    username: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error("两次密码输入不一致");
      return;
    }
    setLoading(true);
    try {
      const msg = await register({
        name: values.name,
        username: values.username,
        password: values.password,
      });
      message.success(msg);
      setSubmitted(true);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div style={{ textAlign: "center" }}>
              <Title level={3}>申请已提交</Title>
              <Text type="secondary">请等待管理员审核通过后，再登录系统</Text>
            </div>
            <Button type="primary" block onClick={() => navigate("/login")}>
              返回登录
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <Title level={3}>申请注册</Title>
            <Text type="secondary">请使用真实姓名提交注册申请</Text>
          </div>
          <Alert
            message="请使用真实姓名注册，提交后需等待管理员审核通过方可登录。"
            type="info"
            showIcon
          />
          <Form onFinish={onFinish} size="large">
            <Form.Item
              name="name"
              rules={[{ required: true, message: "请输入真实姓名" }]}
            >
              <Input prefix={<IdcardOutlined />} placeholder="真实姓名" />
            </Form.Item>
            <Form.Item
              name="username"
              rules={[
                { required: true, message: "请输入用户名" },
                { min: 2, message: "用户名至少 2 个字符" },
                { max: 20, message: "用户名最多 20 个字符" },
                { pattern: /^[a-zA-Z0-9_]+$/, message: "用户名只能包含字母、数字和下划线" },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名（英文+数字）" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 4, message: "密码至少 4 位" },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              rules={[
                { required: true, message: "请确认密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("两次密码输入不一致"));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                提交申请
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: "center" }}>
            <Text>已有账号？</Text> <Link to="/login">去登录</Link>
          </div>
        </Space>
      </Card>
    </div>
  );
}
```

---

### Task 13: 创建管理员审核页

**Files:**
- Create: `src/pages/AdminPage.tsx`
- Create: `src/pages/AdminPage.module.css`

- [ ] **Step 1: 创建 AdminPage.module.css**

```css
.container {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}
```

- [ ] **Step 2: 创建 AdminPage.tsx**

```typescript
import { useEffect, useState } from "react";
import { Table, Button, Tag, message, Popconfirm, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "../lib/api";
import type { User } from "../types/auth";
import styles from "./AdminPage.module.css";

const { Title } = Typography;

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get<User[]>("/api/admin/users");
      setUsers(data);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/api/admin/users/${id}/approve`);
      message.success("已通过审核");
      fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.post(`/api/admin/users/${id}/reject`);
      message.success("已驳回");
      fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const columns: ColumnsType<User> = [
    { title: "姓名", dataIndex: "name", key: "name" },
    { title: "用户名", dataIndex: "username", key: "username" },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "red" : "blue"}>
          {role === "admin" ? "管理员" : "普通用户"}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "active" ? "green" : "orange"}>
          {status === "active" ? "已激活" : "待审核"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => {
        if (record.status !== "pending" || record.role === "admin") return null;
        return (
          <div style={{ display: "flex", gap: 8 }}>
            <Popconfirm
              title="确认通过该用户的注册申请？"
              onConfirm={() => handleApprove(record.id)}
            >
              <Button type="link" size="small">
                通过
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认驳回该用户的注册申请？此操作不可撤销。"
              onConfirm={() => handleReject(record.id)}
            >
              <Button type="link" danger size="small">
                驳回
              </Button>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.container}>
      <Title level={4} style={{ marginBottom: 16 }}>用户管理</Title>
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
    </div>
  );
}
```

---

### Task 14: 接入前端 App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 修改 App.tsx — 添加 import**

在现有 import 区域末尾（`import "./components/PageLoader.css";` 之后）添加：

```typescript
import { AuthGuard } from "./components/AuthGuard";
import { useAuthStore } from "./lib/authStore";
import { Button, Dropdown } from "antd";
import { UserOutlined, LogoutOutlined, SettingOutlined } from "@ant-design/icons";
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
```

- [ ] **Step 2: 修改 App.tsx — 在 Routes 中添加新路由**

在 `<Routes>` 内部，现有 `<Route>` 之前添加：

```typescript
<Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<RegisterPage />} />
<Route path="/admin" element={<AuthGuard requireAdmin><AdminPage /></AuthGuard>} />
```

并将所有现有业务路由包裹在 AuthGuard 中：

```typescript
<Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
<Route path="/quotation" element={<AuthGuard><QuotationPage headerHeight={headerHeight} /></AuthGuard>} />
<Route path="/quotation-intl" element={<AuthGuard><QuotationPageIntl headerHeight={headerHeight} /></AuthGuard>} />
<Route path="/cost" element={<AuthGuard><CostCalculatorPage headerHeight={headerHeight} /></AuthGuard>} />
<Route path="/production-report" element={<AuthGuard><ProductionReportPage /></AuthGuard>} />
<Route path="/process" element={<AuthGuard><ProcessCenter /></AuthGuard>} />
```

- [ ] **Step 3: 修改 App.tsx — 在 Header 右侧添加用户信息**

找到 `AppLayout` 中 Header 的关闭标签 `</Header>` 之前（移动端 Drawer 的 `</>` 之后），添加用户菜单：

```typescript
{!isMobile && (
  <Dropdown
    menu={{
      items: [
        ...(useAuthStore.getState().user?.role === "admin"
          ? [{ key: "admin", icon: <SettingOutlined />, label: <Link to="/admin">用户管理</Link> }]
          : []),
        {
          key: "logout",
          icon: <LogoutOutlined />,
          label: "退出登录",
          onClick: () => {
            useAuthStore.getState().logout();
            window.location.href = "/login";
          },
        },
      ],
    }}
  >
    <Button type="text" style={{ color: "#fff" }}>
      <UserOutlined /> {useAuthStore.getState().user?.name || ""}
    </Button>
  </Dropdown>
)}
```

**注意：** 由于 Header 使用 `useAuthStore.getState()` 不是响应式的，需要改为从组件内读取 store。因此需要在 `AppLayout` 组件开头添加：

```typescript
const user = useAuthStore((s) => s.user);
const logout = useAuthStore((s) => s.logout);
```

然后将上述菜单中的 `useAuthStore.getState().user` 替换为 `user`，`useAuthStore.getState().logout` 替换为 `logout`。

最终 Header 右侧用户菜单代码：

```typescript
{!isMobile && user && (
  <Dropdown
    menu={{
      items: [
        ...(user.role === "admin"
          ? [{ key: "admin", icon: <SettingOutlined />, label: <Link to="/admin">用户管理</Link> }]
          : []),
        { key: "divider", type: "divider" as const },
        {
          key: "logout",
          icon: <LogoutOutlined />,
          danger: true,
          label: "退出登录",
          onClick: () => {
            logout();
            navigate("/login");
          },
        },
      ],
    }}
  >
    <Button type="text" style={{ color: "#fff" }}>
      <UserOutlined /> {user.name}
    </Button>
  </Dropdown>
)}
```

---

### Task 15: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform/server && node server.js
```

Expected: 控制台输出 `[auth] default admin created (admin / admin123)`，服务器正常启动。

- [ ] **Step 2: 测试注册 API**

```bash
curl -X POST http://127.0.0.1:3899/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"测试用户","username":"test","password":"1234"}'
```

Expected: `{"ok":true,"message":"申请已提交，等待管理员审核"}`

- [ ] **Step 3: 测试登录（未审核）**

```bash
curl -X POST http://127.0.0.1:3899/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"1234"}'
```

Expected: `{"error":"账号尚未通过审核，请联系管理员"}`

- [ ] **Step 4: 测试管理员登录**

```bash
curl -X POST http://127.0.0.1:3899/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Expected: 返回 `token` 和 `user` 对象。记录返回的 token。

- [ ] **Step 5: 测试审核通过**

```bash
# 先用 admin token 获取用户列表
TOKEN="<上一步获取的token>"
curl http://127.0.0.1:3899/api/admin/users -H "Authorization: Bearer $TOKEN"
# 找到 test 用户的 id，然后审核通过
curl -X POST http://127.0.0.1:3899/api/admin/users/<test-user-id>/approve \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `{"ok":true}`

- [ ] **Step 6: 测试登录（已审核）**

```bash
curl -X POST http://127.0.0.1:3899/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"1234"}'
```

Expected: 返回 `token` 和 `user` 对象。

- [ ] **Step 7: 启动前端验证页面**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npm run dev
```

在浏览器中访问 `http://localhost:5173/login`，验证：
1. 登录页显示正常
2. 未登录时访问 `/` 自动跳转 `/login`
3. 用 `admin/admin123` 登录成功，显示导航栏用户名
4. 导航栏出现"用户管理"入口
5. 进入管理页可以看到 pending 用户并审核
6. 退出登录功能正常

- [ ] **Step 8: 清理测试数据**

删除 `data/users.json` 中的 test 用户，或删除整个文件让系统重新生成。

---

## 依赖总结

| 变更 | 说明 |
|------|------|
| 新增 `jsonwebtoken` | 后端 JWT 签发/验证 |
| 无需新增前端依赖 | 全部使用已有依赖 |
| 无需数据库 | JSON 文件存储 |

## 安全备注

生产环境部署前应修改：
1. `JWT_SECRET` 环境变量（默认值不安全）
2. 默认管理员密码 `admin123`（首次登录后建议修改，后续可加密码修改功能）
3. 建议在生产环境使用 HTTPS 保护 token 传输
