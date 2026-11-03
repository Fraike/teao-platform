# 特澳科技后台

东莞市特澳电子科技有限公司内部业务工具平台，集成报价与成本管理、装配/注塑生产日报、商品工程资料与图纸、产品标准审核发布、基础资料及员工管理。

> 在线地址：https://teao.work

---

## 业务模块

下表概览当前功能；操作权限以服务端校验为准。商品资料和产品标准页面可供已登录用户进入，上传、提交、审核等操作另受细分权限控制。运维要求见[运行清单](docs/operations.md)。

| 模块 | 路由 | 权限 | 说明 |
|------|------|------|------|
| 首页 Dashboard | `/` | 所有用户 | 系统入口，分类展示各模块快捷入口 |
| 国内报价 | `/quotation` | business | 国内客户报价单编辑、预览、PDF 导出 |
| 国际报价 | `/quotation-intl` | business | 海外客户报价单，支持阶梯定价、EXW/FOB 等 |
| 报价管理 | `/quotation-management` | business | 历史报价查询、复制与管理 |
| 成本计算 | `/cost` | business | 原材料、外购件、制造、包装、运输等全维度成本核算 |
| 生产日报 | `/production-report` | production | 内部装配部 + 注塑部生产数据，企业微信定时推送 |
| 装配部日报录入 | `/production-entry` | production | 日报录入、复制、Excel 导入 |
| 注塑部日报录入 | `/production-entry-injection` | production | 注塑日报录入与导入 |
| 商品资料与详情 | `/materials`、`/materials/:id` | 已登录；操作另行授权 | 商品分类、工程资料、PDF 图纸查看与管理 |
| 产品标准 | `/product-standards` | 已登录；操作另行授权 | 标准参数、版本、导入、提交审核、发布与停用 |
| 客户/供应商/客户商品资料 | `/customers`、`/suppliers`、`/customer-products` | basic_data | 基础资料查询 |
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
| Ant Design | 6.x | UI 组件库 |
| AntV X6 | 3.x | 流程图渲染 |
| Zustand | 5.x | 状态管理 |
| react-router-dom | 7.x | 客户端路由 |
| html2canvas + jsPDF | — | PDF 导出 |
| dayjs | 1.x | 日期处理 |

**后端（API 服务器）**：

| 技术 | 用途 |
|------|------|
| Express 5 | HTTP API |
| jsonwebtoken | JWT 认证 |
| node-cron 4 | 定时任务（生产日报推送） |
| crypto (Node.js) | scrypt 密码哈希 |
| better-sqlite3 | SQLite 业务数据存储 |
| pdf-lib + pdfjs-dist | PDF 图纸处理与校验 |

---

## 快速开始

### 1. 环境准备

统一使用 **Node.js >=24.15.0 且 <25**（以根目录 `package.json` 的 `engines` 为准）；后端单独声明 >=24.0.0 且 <25，整项目按较严格的要求执行。CI 使用 Node.js 24；切换 Node 主版本后需重新安装原生依赖。依赖升级优先最新稳定版，经过兼容性检查、测试和审计后锁定版本；当前 TypeScript 保持工具链支持的 6.0.x，详见 [依赖升级方案](docs/specs/2026-11-02-dependency-upgrade.md)。

```bash
# 安装前端依赖
npm ci

# 安装后端依赖
cd server && npm ci && cd ..

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
3. 上述默认密码仅用于本地开发；生产首次启动必须设置 `INITIAL_ADMIN_PASSWORD`，不得使用开发默认密码。

### 4. 生产构建

```bash
npm run build          # 前端构建 → dist/
cd server && npm start # 后端启动（需设置环境变量）
```

---

## 环境变量

本地开发参考 `.env.example` 创建 `.env`；生产所需持久配置以本节和[运行清单](docs/operations.md)为准。

| 变量 | 必填 | 默认值 | 用途 |
|------|------|--------|------|
| `JWT_SECRET` | ✅ 是 | 无（缺少则启动失败） | JWT 签名密钥，生产环境用随机长字符串 |
| `DATA_DIR` | 生产必填 | 本地自动选择 | API 持久数据目录 |
| `PRODUCTION_CONFIG_PATH` | 生产发布必填 | 本地 `server/production-config.json` | 必须指向 `DATA_DIR` 内已存在的日报配置 |
| `ADMIN_RECOVERY_CODE` | 生产发布必填 | 无 | 管理员恢复码，私密保存 |
| `STANDARD_REVIEW_REMINDERS_ENABLED` | 生产发布必填 | — | 明确设置 `true` / `false`，决定是否启用标准催审 |
| `KINGDEE_CLIENT_ID` | ✅ 是 | 无 | 金蝶云星辰应用 ID |
| `KINGDEE_CLIENT_SECRET` | ✅ 是 | 无 | 金蝶云星辰应用密钥 |
| `INITIAL_ADMIN_PASSWORD` | 生产首次部署必填 | 无 | 至少 12 位，且同时含字母和数字的管理员初始密码 |
| `VIKA_TOKEN` | 否 | — | 历史维格表配置；当前日报仅使用内部数据 |
| `ASSEMBLY_DATASHEET_ID` | 否 | — | 装配部维格表 ID |
| `INJECTION_DATASHEET_ID` | 否 | — | 注塑部维格表 ID |
| `WECOM_WEBHOOK` | 按推送需求 | — | 企业微信群机器人，供日报及标准群通知使用 |
| `WECOM_CORP_ID` | 待审个人推送需要 | — | 企业微信企业 ID |
| `WECOM_AGENT_ID` | 待审个人推送需要 | — | 自建应用 AgentId |
| `WECOM_APP_SECRET` | 待审个人推送需要 | — | 自建应用 Secret，仅通过私密环境配置 |
| `CRON_EXPRESSION` | 否 | `0 0 13 * * *` | 生产日报推送 cron 表达式 |
| `PRODUCTION_REPORT_ENABLED` | 否 | `true` | 是否启用日报定时推送 |

待审标准通过自建应用通知对应审核人，需配置用户企微账号与应用可见范围；审核通过发布及驳回沿用群通知，生产日报保持既有群推送。标准发布内容保留版本和完整适用参数。

### 启动后端

**本地开发：**

```bash
# 项目根目录已创建 .env
cd server && node --env-file=../.env server.js
```

**生产环境（systemd）：**

生产使用仓库中的 `server/teao-api.service`，关键配置为：

```ini
[Service]
WorkingDirectory=/var/www/teao-platform/server
Environment=NODE_ENV=production
EnvironmentFile=/etc/teao-platform/teao-api.env
ExecStart=/usr/bin/node /var/www/teao-platform/server/server.js
```

生产发布前单独审核、准备 `/etc/teao-platform/teao-api.env`，权限为 `0600` 或更严格：

```env
NODE_ENV=production
JWT_SECRET=<至少 32 位随机密钥>
DATA_DIR=/var/www/teao-platform/data
PRODUCTION_CONFIG_PATH=/var/www/teao-platform/data/production-config.json
KINGDEE_CLIENT_ID=<金蝶应用 ID>
KINGDEE_CLIENT_SECRET=<金蝶应用密钥>
INITIAL_ADMIN_PASSWORD=<至少 12 位且包含字母和数字的管理员密码>
ADMIN_RECOVERY_CODE=<私密恢复码>
STANDARD_REVIEW_REMINDERS_ENABLED=true
```

环境文件不进 Git，代码发布不会重写它。`PRODUCTION_CONFIG_PATH` 必须位于 `DATA_DIR` 内且文件已经存在；不得再把生产日报配置放在随发布替换的 `server/` 中。原配置迁移属于独立运维操作，需先确认，不应以空默认配置代替现有值。当前日报运行逻辑仅使用内部数据，历史维格表字段保留用于追溯。

---

## 权限体系

基于角色及细分操作权限控制：

| 权限标识 | 可访问模块 |
|----------|-----------|
| `business` | 国内报价、国际报价、报价管理、成本计算 |
| `production` | 生产日报汇总及装配、注塑录入 |
| `production_import` | 生产日报导入操作 |
| `basic_data` | 客户、供应商、客户商品资料 |
| `engineering` / `engineering_submit` | 产品标准编辑及提交，具体操作以服务端为准 |
| `engineering_review` / `engineering_retire` | 标准审核及停用操作 |
| `product_drawing_manage` | 商品图纸管理 |
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
| POST | `/api/production/fetch` | 读取内部日报并汇总 |
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

以下展示主要职责，不逐项列出所有文件；目录内容以仓库为准。

```text
teao-platform/
├── src/
│   ├── App.tsx                  # 路由、权限入口及多标签页面管理
│   ├── pages/                   # 报价、日报、商品、标准、基础资料等页面
│   ├── components/              # 共享组件及 admin/cost/intl/process/production/standard
│   ├── lib/                     # API、Store、计算、缓存、PDF 与页面状态逻辑
│   ├── types/                   # TypeScript 类型
│   └── data/                    # 前端静态/示例数据
├── server/
│   ├── server.js                # Express 入口及任务初始化
│   ├── config.js                # 运行配置与数据路径
│   ├── routes/                  # 认证、报价、日报、商品、标准、通知等 API
│   ├── services/                # 业务逻辑、SQLite、金蝶、企微及发布队列
│   ├── shared/                  # 前后端复用的商品分类与图纸规则
│   ├── middleware/              # 认证、权限及请求保护
│   ├── lib/                     # 后端基础工具
│   └── scripts/                 # 发布包、部署与服务端运维脚本
├── scripts/                     # 导入、校验及维护工具
├── test/                        # 主要回归测试与前端测试支持
├── tests/                       # 报价兼容性等补充测试
├── public/assets/               # 静态资源
├── docs/                        # 运维清单、方案及审计记录
├── data/                        # 本地运行数据，不进 Git；生产由 DATA_DIR 指定
├── trash_review/                # 待复核归档，不进 Git
├── .github/workflows/           # CI 与手动部署工作流
├── .env.example                 # 环境变量模板，不包含真实密钥
├── CLAUDE.md                    # 现有 AI 协作说明
├── start-dev.sh                 # 本地前后端启动入口
├── vite.config.ts              # Vite 与 API 代理配置
└── package.json                # 根依赖、Node 要求与检查命令
```

## 按改动选择验证

- `npm run lint`：全项目 Lint；局部修改可用 `npx eslint <相关文件>`。
- `npm run test:products`：商品资料与图纸专项。
- `npm run test:standards`：产品标准专项。
- `npm run test:tab-cache`：标签缓存与页面状态专项。
- `npm run test:tooling`：工具链专项。
- `npm run test:production-products`：生产日报商品保存回归。
- `npm test`：根默认测试集；不能替代所有独立专项。
- `npm run build`：TypeScript 检查及前端生产构建。

小改动优先运行相关检查，不要求每次执行以上全部命令。

---

## 部署

GitHub Actions 仅支持手动 `workflow_dispatch`，并要求输入 `release`；推送代码不会自动部署。每次提交、推送、生产部署仍分别等待用户明确确认，不能用工作流输入代替用户授权。

发布以 `.github/workflows/deploy.yml`、`server/scripts/release-package.js` 和 `server/scripts/release-deploy.js` 为准：

1. CI 安装根目录及 server 依赖，通过 lint、测试和构建，生成白名单代码发布包。
2. 隔离暂存目录验证清单与持久配置，预览得到 fingerprint 后才能执行切换。
3. 维护窗口中停服务、原生备份 SQLite 数据，统一切换前端及 API，健康检查失败进入回滚或人工恢复。
4. 静态根目录为 `/var/www/teao-platform/`，API 为该目录下 `server/`，Nginx 代理 `/api/` 至 `127.0.0.1:3899`。

代码包不包含本地业务数据库、配置、Excel、图纸原件或导入结果；代码发布不等于数据同步，不自动执行图纸导入。应用启动可能执行兼容性建表/迁移，因此仍需一致性备份和部署后检查。GitHub Secrets 需配置 `DEPLOY_SSH_KEY`，生产运行环境另按上文准备。

完整发布、回滚、静态权限及资料保留要求见[运行清单](docs/operations.md)。README 描述仓库能力，不代表所有本地改动已部署上线。

---

## 开发规范

按当前项目协作规则执行；仓库另有 [CLAUDE.md](CLAUDE.md) 供参考，其内容如与用户最新指示冲突，以最新指示为准。

核心规则：
- **不自动提交 Git**，等用户确认
- **不复制粘贴代码**，国内/国际报价共用逻辑必须抽取
- **新代码避免 inline style**，优先使用 CSS Modules
- TypeScript `strict: true`，零类型错误
- 使用命名导出（`export function`），不使用 `export default`
