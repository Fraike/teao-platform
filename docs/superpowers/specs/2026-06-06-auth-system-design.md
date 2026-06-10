# 后台管理系统登录权限 — 设计文档

**日期**: 2026-06-06  
**状态**: 待实现

---

## 1. 需求摘要

为特澳科技业务工具平台添加简单的登录/注册权限系统，仅供内部员工使用。

- 员工在注册页提交申请（真实姓名 + 用户名 + 密码）
- 管理员在后台审核通过后，员工可登录
- 首次启动自动创建默认管理员账号

---

## 2. 技术方案

### 2.1 认证方式

- **JWT（JSON Web Token）**：登录成功后签发 token，前端存储在 localStorage，每次请求通过 `Authorization: Bearer <token>` 携带
- **密码存储**：使用 Node.js 内置 `crypto` 模块（scrypt + 随机盐）哈希，不引入额外依赖
- **数据存储**：JSON 文件 `data/users.json`，读取/写入简单，无需数据库

### 2.2 架构

```
React 前端 (5173) ←→ Express API (3001) ←→ data/users.json
```

后端 API 复用现有 Express 服务器（`server/server.js`），在前端已有端口上添加认证路由。

---

## 3. 后端 API 设计

### 3.1 新增依赖

| 包 | 用途 |
|---|------|
| `jsonwebtoken` | JWT 签发与验证 |

### 3.2 端点清单

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/auth/login` | POST | 无 | 用户名+密码登录，返回 JWT |
| `/api/auth/register` | POST | 无 | 提交注册申请（status: pending） |
| `/api/auth/me` | GET | JWT | 获取当前用户信息 |
| `/api/admin/users` | GET | JWT+admin | 获取用户列表 |
| `/api/admin/users/:id/approve` | POST | JWT+admin | 审核通过 |
| `/api/admin/users/:id/reject` | POST | JWT+admin | 驳回注册（删除记录） |

### 3.3 数据模型

**users.json 结构：**

```json
{
  "users": [
    {
      "id": "uuid",
      "name": "张三",
      "username": "zhangsan",
      "passwordHash": "<scrypt-hash>",
      "passwordSalt": "<random-salt>",
      "role": "admin | user",
      "status": "active | pending",
      "createdAt": "2026-06-06T00:00:00.000Z"
    }
  ]
}
```

### 3.4 默认管理员

服务器启动时检查 `users.json`，如果没有任何 `admin` 角色用户，自动创建：

- 用户名：`admin`
- 密码：`admin123`
- 姓名：管理员
- 角色：admin
- 状态：active

---

## 4. 前端设计

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/pages/LoginPage.tsx` | 登录页面 |
| `src/pages/RegisterPage.tsx` | 注册申请页面 |
| `src/pages/AdminPage.tsx` | 管理员审核页面 |
| `src/components/AuthGuard.tsx` | 路由守卫组件 |
| `src/lib/authStore.ts` | 认证状态管理（Zustand） |
| `src/lib/api.ts` | API 请求封装（自动携带 token） |

### 4.2 页面路由

| 路由 | 组件 | 权限 |
|------|------|------|
| `/login` | LoginPage | 公开 |
| `/register` | RegisterPage | 公开 |
| `/admin` | AdminPage | 仅 admin |
| `/` 及其他 | 现有页面 | 需登录 |

### 4.3 登录页

- 用户名 + 密码输入框
- 登录按钮
- "没有账号？去注册" 链接
- 登录成功 → 跳转首页
- 登录失败 → 错误提示

### 4.4 注册页

- 姓名 + 用户名 + 密码 + 确认密码输入框
- 提示："请使用真实姓名提交注册"
- 提交成功 → 提示"申请已提交，等待管理员审核"
- 已有账号 → 去登录链接

### 4.5 管理员审核页

- 仅在导航栏对 admin 角色显示
- 表格展示所有 pending 用户
- 操作：通过 / 驳回
- 通过后用户状态变为 active，可登录
- 驳回后删除该注册记录

### 4.6 路由守卫（AuthGuard）

- 检查 localStorage 中是否有 token
- 有 token → 验证有效性（调用 `/api/auth/me`）
- 有效 → 渲染子路由
- 无效/无 token → 重定向到 `/login`

### 4.7 导航栏改动

- 右上角显示当前用户名
- 添加"退出登录"按钮（清除 token，跳转登录页）
- admin 用户额外显示"用户管理"入口

---

## 5. 数据流

```
注册: RegisterPage → POST /api/auth/register → users.json (status:pending)
审核: AdminPage → POST /api/admin/users/:id/approve → users.json (status:active)
登录: LoginPage → POST /api/auth/login → JWT → localStorage
请求: AuthGuard → 读取 token → 附加 Authorization header → API 验证
```

---

## 6. 安全考量

- 密码使用 scrypt + 随机盐哈希存储
- JWT 设置 7 天过期时间
- 管理员 API 端点检查 role === 'admin'
- 前端仅存储 token，不存储密码

---

## 7. 不在范围内

- 密码修改/找回功能（后续可按需添加）
- 角色细分（目前只有 admin 和 user）
- 邮箱/手机验证
- 会话管理/多设备登录控制
