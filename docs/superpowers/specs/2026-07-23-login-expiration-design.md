# 登录失效检测 — 设计文档

**日期:** 2026-07-23  
**状态:** 已确认

---

## 目标

前端增加登录失效检测：登录后 12 小时自动失效，刷新页面时检测并跳转登录页，显示过期提示。

---

## 当前架构

- JWT token 存储在 `localStorage`（key: `auth_token`），服务端 7 天过期
- `AuthGuard` 组件在挂载时调用 `fetchMe()` → `/api/auth/me` 验证
- 服务端 401 时清除 token 并跳转 `/login`
- 无前端侧基于时间的会话过期检测

---

## 方案

**时间戳检查方案：** 登录时存储时间戳，应用初始化时检查是否超过 12 小时。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/lib/api.ts` | 新增 `LOGIN_TIMESTAMP_KEY` 常量和 `getLoginTimestamp()` / `setLoginTimestamp()` / `clearLoginTimestamp()` 工具函数 |
| `src/lib/authStore.ts` | `login()` 中记录时间戳，`logout()` 中清除时间戳，新增 `isSessionExpired()` 检查 |
| `src/components/AuthGuard.tsx` | 在 `fetchMe()` 之前检查会话是否过期，过期则跳转 `/login?expired=1` |
| `src/pages/LoginPage.tsx` | 检测 `?expired=1` 参数，显示"登录已过期"提示 |

### 数据流

```
登录成功 → setToken() + setLoginTimestamp()
页面刷新 → AuthGuard mount
  → isSessionExpired(): Date.now() - loginTimestamp > 12h?
    → 是 → clearToken() + clearLoginTimestamp() + Navigate to /login?expired=1
    → 否 → fetchMe() 正常流程
退出登录 → clearToken() + clearLoginTimestamp()
```

### 关键常量

- `LOGIN_TIMESTAMP_KEY`: `"login_timestamp"`
- `SESSION_DURATION_MS`: `12 * 60 * 60 * 1000`（12 小时）

### 边界情况

| 场景 | 行为 |
|------|------|
| 老用户无 `login_timestamp` | 跳过检查，正常走 `fetchMe()` 流程 |
| 手动退出后重新登录 | `logout()` 清除旧时间戳，`login()` 记录新的 |
| token 被篡改 | 前端时间戳先拦截，服务端 JWT 是后防线 |
| 12 小时内刷新页面 | 正常通过 |
