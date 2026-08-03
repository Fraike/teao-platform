# 特澳科技后台

东莞市特澳电子科技有限公司内部业务工具平台，集成报价单生成、成本计算、生产日报推送、员工管理等业务模块。

> 在线地址：https://teao.work

---

## 业务模块

| 模块 | 路由 | 权限 | 说明 |
|------|------|------|------|
| 首页 Dashboard | `/` | 所有用户 | 系统入口，分类展示各模块快捷入口 |
| 国内报价 | `/quotation` | business | 国内客户报价单编辑、预览、PDF 导出 |
| 国际报价 | `/quotation-intl` | business | 海外客户报价单，支持阶梯定价、EXW/FOB 等 |
| 成本计算 | `/cost` | business | 原材料、外购件、制造、包装、运输等全维度成本核算 |
| 生产日报 | `/production-report` | production | 装配部 + 注塑部生产数据，企业微信定时推送 |
| 员工管理 | `/employees` | hr | 员工档案 CRUD、搜索筛选、CSV 导出、合同到期提醒 |
| 流程查阅 | `/process` | tools | 产品工艺流程图可视化 |
| 用户管理 | `/admin` | admin | 管理员审核注册、模块权限开关 |

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| TypeScript | 6.x | 类型系统 |
| Vite | 8.x | 构建工具 |
| Ant Design | 5.x | UI 组件库 |
| AntV X6 | 3.x | 流程图渲染 |
| Zustand | 5.x | 状态管理 |
| react-router-dom | 7.x | 客户端路由 |
| html2canvas + jsPDF | — | PDF 导出 |
| dayjs | 1.x | 日期处理 |

**后端（API 服务器）**：

| 技术 | 用途 |
|------|------|
| Express 4 | HTTP API |
| jsonwebtoken | JWT 认证 |
| node-cron | 定时任务（生产日报推送） |
| crypto (Node.js) | scrypt 密码哈希 |

---

## 快速开始

### 1. 环境准备

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..

# 创建环境变量文件
cp .env.example .env
# 生成至少 32 位的随机密钥，并将输出填入 .env 的 JWT_SECRET
openssl rand -hex 32
```

### 2. 启动开发环境

**一键启动（推荐）：**

```bash
./start-dev.sh
```

同时启动前端（`:5173`）和后端（`:3899`），按 `Ctrl+C` 停止所有服务。脚本会自动检查 `.env` 配置。

**手动启动：**

**前端**（端口 5173）：
```bash
npm run dev
```

**后端 API**（端口 3899）：
```bash
cd server && node --env-file=../.env server.js
```

前端 Vite 开发服务器会自动将 `/api/*` 请求代理到 `http://127.0.0.1:3899`。



### 3. 首次使用

1. API 启动后会自动创建默认管理员账户：
   - 用户名：`admin`
   - 密码：`admin123`
2. 访问 `http://localhost:5173/login` 登录
3. **生产环境务必修改默认管理员密码！**

### 4. 生产构建

```bash
npm run build          # 前端构建 → dist/
cd server && npm start # 后端启动（需设置环境变量）
```

---

## 环境变量

全部变量定义在 `.env.example`，本地开发复制为 `.env`：

| 变量 | 必填 | 默认值 | 用途 |
|------|------|--------|------|
| `JWT_SECRET` | ✅ 是 | 无（缺少则启动失败） | JWT 签名密钥，生产环境用随机长字符串 |
| `DATA_DIR` | 否 | 自动选择 | API 数据存储目录 |
| `KINGDEE_CLIENT_ID` | ✅ 是 | 无 | 金蝶云星辰应用 ID |
| `KINGDEE_CLIENT_SECRET` | ✅ 是 | 无 | 金蝶云星辰应用密钥 |
| `INITIAL_ADMIN_PASSWORD` | 生产首次部署必填 | 无 | 至少 12 位，且同时含字母和数字的管理员初始密码 |
| `VIKA_TOKEN` | 否 | — | 维格表 API Token（生产日报抓取） |
| `ASSEMBLY_DATASHEET_ID` | 否 | — | 装配部维格表 ID |
| `INJECTION_DATASHEET_ID` | 否 | — | 注塑部维格表 ID |
| `WECOM_WEBHOOK` | 否 | — | 企业微信机器人 Webhook 地址 |
| `CRON_EXPRESSION` | 否 | `0 0 13 * * *` | 生产日报推送 cron 表达式 |
| `PRODUCTION_REPORT_ENABLED` | 否 | `true` | 是否启用日报定时推送 |

### 启动后端

**本地开发：**

```bash
# 创建 server/.env；JWT_SECRET 必须粘贴 `openssl rand -hex 32` 的输出
# JWT_SECRET=<至少 32 位的随机密钥>

# 启动（Node.js 22+ 内置 .env 支持）
cd server && node --env-file=.env server.js
```

**生产环境（systemd）：**

```ini
# /etc/systemd/system/teao-api.service
[Service]
Environment="JWT_SECRET=<至少 32 位的随机密钥>"
Environment="DATA_DIR=/var/www/teao-platform/data"
ExecStart=/usr/bin/node /var/www/teao-platform/server/server.js
```

生产部署前，在服务器创建仅 root 可读的 `/etc/teao-platform/teao-api.env`：

```env
NODE_ENV=production
JWT_SECRET=<至少 32 位随机密钥>
DATA_DIR=/var/www/teao-platform/data
KINGDEE_CLIENT_ID=<金蝶应用 ID>
KINGDEE_CLIENT_SECRET=<金蝶应用密钥>
INITIAL_ADMIN_PASSWORD=<至少 12 位且包含字母和数字的管理员密码>
```

该文件不进 Git。部署工作流会先验证它存在，再更新 API 服务，避免凭据缺失导致服务重启失败。

生产环境维格表相关配置（VIKA_TOKEN 等）在 `server/production-config.json` 中维护，该文件不进 Git。

---

## 权限体系

基于 RBAC 的五模块权限：

| 权限标识 | 可访问模块 |
|----------|-----------|
| `business` | 国内报价、国际报价、成本计算 |
| `production` | 生产日报 |
| `hr` | 员工管理 |
| `tools` | 流程查阅 |
| `admin` | 全部模块 + 用户管理（审核注册、权限开关） |

- 新用户注册后状态为"待审核"，管理员审核通过后方可登录
- 管理员可在用户管理页面为每个用户单独开关模块权限
- 首页仪表盘永远对所有已登录用户可见

---

## API 端点

### 认证（无需 Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，返回 JWT token |
| POST | `/api/auth/register` | 注册（需管理员审核） |
| POST | `/api/auth/refresh` | 刷新 token |

### 认证（需 Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/me` | 获取当前用户信息 |

### 员工管理（需 Token，权限：hr）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/employees` | 员工列表（?status=active\|resigned） |
| GET | `/api/employees/reminders` | 合同到期提醒 |
| GET | `/api/employees/:id` | 员工详情 |
| POST | `/api/employees` | 新增员工 |
| PUT | `/api/employees/:id` | 更新员工 |
| DELETE | `/api/employees/:id` | 标记离职 |

### 报价汇总（需 Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/history` | 获取报价记录列表 |
| POST | `/api/history` | 保存报价记录 |
| DELETE | `/api/history/:id` | 删除报价记录 |

### 生产日报（需 Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/production/config` | 获取日报配置 |
| POST | `/api/production/config` | 保存日报配置 |
| POST | `/api/production/fetch` | 从维格表拉取并存储日报 |
| GET | `/api/production/report` | 获取已存储的日报 |
| POST | `/api/production/send` | 推送到企业微信群 |
| POST | `/api/production/preview` | 预览推送内容 |

### 用户管理（需 Token，权限：admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users/:id/approve` | 审核通过 |
| POST | `/api/admin/users/:id/reject` | 驳回注册 |
| PUT | `/api/admin/users/:id/permissions` | 修改模块权限 |

---

## 项目结构

```
teao-platform/
├── public/assets/                   # 静态资源（Logo、公章）
├── src/
│   ├── App.tsx                      # 路由 + 顶部导航 + 权限过滤
│   ├── main.tsx                     # 入口
│   ├── index.css                    # 全局样式
│   ├── types/
│   │   ├── quotation.ts             # 报价单类型定义
│   │   ├── costQuote.ts             # 成本报价类型定义
│   │   ├── auth.ts                  # 用户/认证类型定义
│   │   └── employee.ts              # 员工类型定义
│   ├── lib/
│   │   ├── api.ts                   # API 客户端（JWT 自动刷新）
│   │   ├── authStore.ts             # 认证 Store
│   │   ├── constants.ts             # 公司信息、默认条款、资源路径
│   │   ├── store.ts                 # 报价单 Store（国内 + 国际共用工厂）
│   │   ├── sample.ts                # 国内报价示例数据
│   │   ├── sample-intl.ts           # 国际报价示例数据
│   │   ├── pdf.ts                   # PDF 导出引擎
│   │   ├── costStore.ts             # 成本计算 Store
│   │   ├── costCalculations.ts      # 成本计算函数
│   │   ├── costFormat.ts            # 金额/重量格式化
│   │   ├── costStorage.ts           # 成本数据 localStorage
│   │   ├── historyStore.ts          # 报价汇总 Store
│   │   ├── imageUtils.ts            # 图片缩放工具
│   │   ├── useBase64Image.ts        # 图片转 Base64 Hook
│   │   └── useIsMobile.ts           # 移动端检测 Hook
│   ├── components/
│   │   ├── AuthGuard.tsx             # 路由守卫（登录 + 权限检查）
│   │   ├── EmployeeFormModal.tsx     # 员工新增/编辑弹窗
│   │   ├── intl/                    # 国际报价特有组件（ProductCard/PreviewPanel）
│   │   ├── cost/                    # 成本计算组件
│   │   ├── process/                 # 流程查阅组件
│   │   └── *.tsx                    # 共享组件（国内/国际共用）
│   └── pages/
│       ├── Dashboard.tsx            # 首页（模块分类导航）
│       ├── LoginPage.tsx            # 登录页
│       ├── RegisterPage.tsx         # 注册页
│       ├── AdminPage.tsx            # 用户管理（管理员）
│       ├── EmployeePage.tsx         # 员工管理（含合同到期提醒）
│       ├── QuotationPage.tsx        # 国内报价
│       ├── QuotationPageIntl.tsx    # 国际报价
│       ├── CostCalculatorPage.tsx   # 成本计算
│       ├── ProductionReportPage.tsx # 生产日报
│       └── ProcessCenter.tsx        # 流程查阅
├── server/
│   ├── server.js                    # Express 入口 + cron 定时任务
│   ├── config.js                    # 配置读写 + 数据存储路径
│   ├── production-config.json       # 维格表/企微配置（不进 Git）
│   ├── lib/mutex.js                 # 文件写入互斥锁
│   ├── middleware/
│   │   ├── jwt-auth.js              # JWT 验证 + Admin 权限
│   │   └── rate-limit.js            # 登录频率限制
│   ├── routes/
│   │   ├── auth.js                  # 认证路由
│   │   ├── admin.js                 # 管理员路由
│   │   ├── employees.js             # 员工路由
│   │   ├── history.js               # 报价汇总路由
│   │   └── production.js            # 生产日报路由
│   └── services/
│       ├── users.js                 # 用户管理 + JWT
│       ├── employees.js             # 员工管理 + 合同提醒
│       ├── report.js                # 维格表数据拉取 + 汇总
│       ├── vika.js                  # 维格表 API 调用
│       └── wecom.js                 # 企业微信推送
├── data/                            # 运行时数据（git-ignored）
│   ├── users.json                   # 用户数据
│   └── employees.json               # 员工数据
├── docs/                            # 设计文档
├── .env.example                     # 环境变量模板
├── CLAUDE.md                        # AI 编码规范
├── vite.config.ts                   # Vite 配置（含 API 代理）
└── package.json
```

---

## 部署

项目通过 GitHub Actions 自动部署到服务器：

1. 前端静态文件 → `/var/www/teao-platform/`
2. API 服务器 → `/var/www/teao-platform/server/`
3. Nginx 反向代理 `/api/` → `127.0.0.1:3899`

**生产环境必设环境变量**（在 systemd service 中）：
- `JWT_SECRET` — 随机长字符串（必要！）

> 部署前需在 GitHub Secrets 中配置 `DEPLOY_SSH_KEY`

---

## 开发规范

见 [CLAUDE.md](CLAUDE.md) — 所有 AI 协作必须遵循的编码规范。

核心规则：
- **不自动提交 Git**，等用户确认
- **不复制粘贴代码**，国内/国际报价共用逻辑必须抽取
- **新代码避免 inline style**，优先使用 CSS Modules
- TypeScript `strict: true`，零类型错误
- 使用命名导出（`export function`），不使用 `export default`
