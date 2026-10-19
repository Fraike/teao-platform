# 登录失效检测 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端增加 12 小时登录失效检测，刷新页面时检查并跳转登录页，显示过期提示。

**Architecture:** 登录时在 localStorage 存储时间戳，AuthGuard 初始化时检查是否超过 12 小时，过期则清除 token 并跳转 `/login?expired=1`，LoginPage 检测该参数显示提示。

**Tech Stack:** React 19, TypeScript, Zustand 5, React Router 6, Ant Design 5

## Global Constraints

- 使用 TypeScript，禁止 `any`
- 新代码使用 CSS modules（`*.module.css`）
- 不提交代码，等用户确认

---

### Task 1: 添加时间戳常量和工具函数

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces: `LOGIN_TIMESTAMP_KEY` (string), `SESSION_DURATION_MS` (number), `getLoginTimestamp()` → `string | null`, `setLoginTimestamp()` → `void`, `clearLoginTimestamp()` → `void`

- [ ] **Step 1: 在 `src/lib/api.ts` 中添加常量、工具函数和导出**

找到文件末尾的 `TOKEN_KEY` 附近（第 1 行之后），追加以下代码：

```ts
// ---- login timestamp (会话过期检测) ----
const LOGIN_TIMESTAMP_KEY = "login_timestamp";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 小时

export function getLoginTimestamp(): string | null {
  return localStorage.getItem(LOGIN_TIMESTAMP_KEY);
}

export function setLoginTimestamp(): void {
  localStorage.setItem(LOGIN_TIMESTAMP_KEY, String(Date.now()));
}

export function clearLoginTimestamp(): void {
  localStorage.removeItem(LOGIN_TIMESTAMP_KEY);
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit src/lib/api.ts
```

预期：无类型错误。

---

### Task 2: authStore 中管理时间戳

**Files:**
- Modify: `src/lib/authStore.ts`

**Interfaces:**
- Consumes: `setLoginTimestamp`, `clearLoginTimestamp` from `src/lib/api.ts`
- Produces: `useAuthStore` — `login()` 中调用 `setLoginTimestamp()`，`logout()` 中调用 `clearLoginTimestamp()`，新增 `isSessionExpired()` 导出函数

- [ ] **Step 1: 修改 `src/lib/authStore.ts` 的 import**

将第 3 行的 import 修改为：

```ts
import { api, setToken, clearToken, getToken, isApiError, setLoginTimestamp, clearLoginTimestamp } from "./api";
```

- [ ] **Step 2: 在 `login` action 中记录时间戳**

在 `login` 函数中，`setToken(data.token)` 之后添加一行：

```ts
login: async (req) => {
  const data = await api.post<{ token: string; user: User }>(
    "/api/auth/login",
    req
  );
  setToken(data.token);
  setLoginTimestamp();  // 记录登录时间戳
  set({ user: data.user });
},
```

- [ ] **Step 3: 在 `logout` action 中清除时间戳**

在 `logout` 函数中添加 `clearLoginTimestamp()`：

```ts
logout: () => {
  clearToken();
  clearLoginTimestamp();  // 清除登录时间戳
  set({ user: null });
},
```

- [ ] **Step 4: 新增 `isSessionExpired` 导出函数**

在文件末尾（`useAuthStore` 定义之后）添加：

```ts
export function isSessionExpired(): boolean {
  const ts = getLoginTimestamp();
  if (!ts) return false; // 老用户：无时间戳，不拦截
  const elapsed = Date.now() - Number(ts);
  return elapsed > SESSION_DURATION_MS;
}
```

注意：需要在文件顶部 import 中添加 `getLoginTimestamp` 和 `SESSION_DURATION_MS`。更新后的 import 为：

```ts
import { api, setToken, clearToken, getToken, isApiError, setLoginTimestamp, clearLoginTimestamp, getLoginTimestamp, SESSION_DURATION_MS } from "./api";
```

- [ ] **Step 5: 验证编译**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit src/lib/authStore.ts src/lib/api.ts
```

预期：无类型错误。

---

### Task 3: AuthGuard 中添加过期检查

**Files:**
- Modify: `src/components/AuthGuard.tsx`

**Interfaces:**
- Consumes: `isSessionExpired` from `src/lib/authStore.ts`
- Behavior: 初始化时先检查 `isSessionExpired()`，过期则清除 token 并跳转 `/login?expired=1`，未过期走原有 `fetchMe` 流程

- [ ] **Step 1: 修改 `src/components/AuthGuard.tsx`**

将 import 从：

```ts
import { useAuthStore } from "../lib/authStore";
```

改为：

```ts
import { useAuthStore, isSessionExpired } from "../lib/authStore";
import { clearToken } from "../lib/api";
```

- [ ] **Step 2: 在 `useEffect` 中添加过期检查**

将原有的 `useEffect` 块：

```ts
useEffect(() => {
  if (!initialized) {
    fetchMe();
  }
}, [initialized, fetchMe]);
```

替换为：

```ts
useEffect(() => {
  if (initialized) return;

  // 检查前端会话是否过期（12 小时）
  if (isSessionExpired()) {
    clearToken();
    // 需要同步清除 Zustand 中的 user 状态
    useAuthStore.setState({ user: null, initialized: true });
    return;
  }

  fetchMe();
}, [initialized, fetchMe]);
```

- [ ] **Step 3: 过期跳转逻辑**

`isSessionExpired()` 返回 `true` 后，`clearToken()` 和 `setState({ user: null })` 已执行。此时 `AuthGuard` 的条件判断会自然走到 `if (!user)` 分支，触发 `<Navigate to="/login" ... />`。

为了让 LoginPage 显示过期提示，需要传递过期标记。修改 redirect：

```tsx
if (!user) {
  const expired = isSessionExpired();
  // 注意：此时 token 已被清除且 user 为 null，
  // 但 isSessionExpired() 依赖 login_timestamp 仍在 localStorage 中
  // 需要在清除 token 前先检查，或改为单独的标记
  return <Navigate to="/login" state={{ from: location.pathname, expired: true }} replace />;
}
```

但有个问题：Step 2 中已经调用了 `clearToken()`，但 `isSessionExpired()` 检查的是 `login_timestamp` 不是 `auth_token`，所以不受影响。不过为了让逻辑更清晰，调整 Step 2 为：

```tsx
const [sessionExpired, setSessionExpired] = useState(false);

useEffect(() => {
  if (initialized) return;

  // 检查前端会话是否过期（12 小时）
  if (isSessionExpired()) {
    clearToken();
    useAuthStore.setState({ user: null, initialized: true });
    setSessionExpired(true);
    return;
  }

  fetchMe();
}, [initialized, fetchMe]);
```

然后在 render 部分：

```tsx
if (!user) {
  return (
    <Navigate
      to="/login"
      state={{ from: location.pathname, expired: sessionExpired || undefined }}
      replace
    />
  );
}
```

完整修改后的组件：

```tsx
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { Spin, Result, Button } from "antd";
import { useAuthStore, isSessionExpired } from "../lib/authStore";
import { clearToken } from "../lib/api";
import styles from "./AuthGuard.module.css";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  permission?: string;
}

export function AuthGuard({ children, requireAdmin = false, permission }: AuthGuardProps) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (initialized) return;

    // 检查前端会话是否过期（12 小时）
    if (isSessionExpired()) {
      clearToken();
      useAuthStore.setState({ user: null, initialized: true });
      setSessionExpired(true);
      return;
    }

    fetchMe();
  }, [initialized, fetchMe]);

  if (!initialized || loading) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, expired: sessionExpired || undefined }}
        replace
      />
    );
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  if (permission && !user.permissions?.includes(permission) && user.role !== "admin") {
    return (
      <Result
        status="403"
        title="无权限访问"
        subTitle="你没有该模块的访问权限，请联系管理员开通。"
        extra={<Button type="primary" onClick={() => navigate("/")}>返回首页</Button>}
      />
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit src/components/AuthGuard.tsx src/lib/authStore.ts src/lib/api.ts
```

预期：无类型错误。

---

### Task 4: LoginPage 显示过期提示

**Files:**
- Modify: `src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `location.state.expired` from React Router navigate state
- Behavior: 如果 `expired` 为 `true`，显示 Alert 提示"登录已过期（超过 12 小时），请重新登录"

- [ ] **Step 1: 修改 `src/pages/LoginPage.tsx`**

在 `LoginPage` 组件中，从 `location.state` 提取 `expired` 标记，在表单上方显示过期提示。

找到第 17 行：
```ts
const from = (location.state as { from?: string })?.from || "/";
```

在它下面添加：
```ts
const expired = (location.state as { expired?: boolean })?.expired;
```

然后在 JSX 中，`{loginError && (...)}` 的 `Alert` 前面添加 expired 提示：

完整修改后：

```tsx
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Card, Form, Input, Button, Typography, App, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import styles from "./AuthPage.module.css";

const { Title, Text } = Typography;

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const { message } = App.useApp();
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";
  const expired = (location.state as { expired?: boolean })?.expired;

  const onFinish = async (values: { username: string; password: string }) => {
    setLoginError("");
    setLoading(true);
    try {
      await login(values);
      message.success("登录成功");
      navigate(from, { replace: true });
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.titleArea} style={{ marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4 }}>特澳科技后台</Title>
          <Text type="secondary">请登录以继续</Text>
        </div>

        <Form onFinish={onFinish} size="large">
          {expired && (
            <Alert
              type="warning"
              showIcon
              message="登录已过期（超过 12 小时），请重新登录"
              style={{ marginBottom: 16 }}
            />
          )}
          {loginError && (
            <Alert type="error" showIcon message={loginError} style={{ marginBottom: 16 }} closable onClose={() => setLoginError("")} />
          )}
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button type="link" size="small" onClick={() => message.info("请联系管理员重置密码")}>
            忘记密码
          </Button>
          <Text type="secondary" style={{ fontSize: 13 }}>
            没有账号？<Link to="/register">申请注册</Link>
          </Text>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit src/pages/LoginPage.tsx
```

预期：无类型错误。

---

### Task 5: 导出 SESSION_DURATION_MS 常量

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces: `SESSION_DURATION_MS` 为导出常量

- [ ] **Step 1: 确认 `SESSION_DURATION_MS` 已导出**

检查 Task 1 中添加的代码，`SESSION_DURATION_MS` 前面有 `const` 声明，但 Task 2 中 `authStore.ts` 需要 import 它。需要将其从普通 `const` 改为 `export const`，或者保持 `const` 并用单独 `export { SESSION_DURATION_MS }` 导出。

Task 1 中写的是：
```ts
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
```

需要改为：
```ts
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
```

注意：Task 1 的代码需要相应调整。合并后的 Task 1 完整代码：

```ts
// ---- login timestamp (会话过期检测) ----
const LOGIN_TIMESTAMP_KEY = "login_timestamp";
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 小时

export function getLoginTimestamp(): string | null {
  return localStorage.getItem(LOGIN_TIMESTAMP_KEY);
}

export function setLoginTimestamp(): void {
  localStorage.setItem(LOGIN_TIMESTAMP_KEY, String(Date.now()));
}

export function clearLoginTimestamp(): void {
  localStorage.removeItem(LOGIN_TIMESTAMP_KEY);
}
```

- [ ] **Step 2: 全量编译验证**

```bash
cd /Users/mikewang/AI_Workspace/teao-platform && npx tsc --noEmit
```

预期：无类型错误。

---

### 验证清单

全部任务完成后，手动验证：

1. **正常登录流程不受影响** — 登录后能正常访问页面
2. **12 小时内刷新页面** — 不会跳转登录，正常显示内容
3. **模拟过期** — 手动修改 localStorage `login_timestamp` 为一个小于 `Date.now() - 13h` 的值，刷新页面，应跳转到 `/login` 并显示过期提示
4. **老用户兼容** — 清除 `login_timestamp` 但保留 `auth_token`，刷新页面应正常走 `fetchMe()` 流程
