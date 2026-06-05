# 特澳科技业务工具平台

东莞市特澳电子科技有限公司内部业务工具平台，集成报价单生成、成本计算、生产日报推送等业务模块。

> 在线地址：https://teao.work

---

## 业务模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 首页 Dashboard | `/` | 系统入口，各模块快捷导航 |
| 国内报价 | `/quotation` | 国内客户报价单编辑、预览、PDF 导出 |
| 国际报价 | `/quotation-intl` | 海外客户报价单，支持阶梯定价、EXW/FOB 等贸易条款 |
| 成本计算 | `/cost` | A-G 全维度供应商成本核算 |
| 生产日报 | `/production-report` | 装配部 + 注塑部生产数据查看，企业微信定时推送 |
| 流程查阅 | `/process` | 产品工艺流程图可视化 |

---

### 报价系统（国内 & 国际）

左右分屏布局：左侧录入区，右侧 A4 实时预览。

**国内报价** — 标准报价单：
- 客户信息、报价单号（自动生成）、币种、税率
- 产品明细（名称/规格/单价/扭矩/包装/备注），支持图片
- 模具费用表（模具成本 + 摊销数量）
- 条款编辑器（预设默认条款）
- 公章/金额列 显示开关
- 导出设置：自定义表格列宽

**国际报价** — 英文报价单，额外功能：
- 贸易术语（EXW / FOB / CIF / DDP）
- 付款条件（预设常用模板）
- 银行信息（SWIFT/BIC + 账号）
- **阶梯定价**：每个产品可配置多级数量-单价梯次
- 客户邮箱、国家、邮编字段

**工具栏操作**：新建 / 导入 JSON / 导出 JSON / 保存草稿（localStorage）/ 导出 PDF / 报价汇总

> 导出 PDF 后自动保存至报价汇总（可通过页面右上角"报价汇总"按钮查看历史记录）

---

### 成本计算

支持 **A-G 七个成本维度** 的供应商报价分析：

| 维度 | 内容 |
|------|------|
| A 原材料分析 | 材料名称、用量、单价、金额 |
| B 外购件分析 | 外购零件、数量、单价 |
| C 制造费用 | 工序、费率、工时 |
| D 专项分摊 | 模具/治具分摊 |
| E 包装费 | 包装材料、规格、成本 |
| F 运输费 | 运输方式、距离、费用 |
| G 加成费用 | 管理费、利润、其他 |

自动计算 **H（不含税合计）** 和 **I（含税合计）**，右侧汇总面板展示各项明细占比。

工具栏支持：新建 / JSON 导入导出 / 保存草稿

---

### 生产日报

- 从维格表自动拉取装配部和注塑部的生产数据
- 支持按日期查询、手动刷新
- 装配部：按产线查看品名/产量/达成率/合格率/不良数/欠数
- 注塑部：按机台/班次查看品名/产量/合格率/不良数
- 工作日智能识别：周日自动跳过，支持配置法定节假日和补班日
- 企业微信机器人定时推送（默认每天 13:00）

> 配置管理：管理员可通过页面设置维格表 ID、Webhook、定时表达式、休息日等

---

### 流程查阅

基于 AntV X6 的交互式流程图，展示产品生产工艺路径。支持节点拖拽、缩放。

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
| html2canvas + jsPDF | — | PDF 导出 |
| react-router-dom | 7.x | 客户端路由 |
| dayjs | 1.x | 日期处理 |

**后端（API 服务器）**：

| 技术 | 用途 |
|------|------|
| Express | HTTP API |
| node-cron | 定时任务 |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev

# 启动 API 服务器（可选，用于报价汇总和生产日报）
cd server && npm install && node server.js

# 生产构建
npm run build
```

---

## 项目结构

```
teao-platform/
├── public/assets/              # 静态资源（Logo、公章）
├── src/
│   ├── App.tsx                 # 路由 + 顶部导航
│   ├── main.tsx                # 入口
│   ├── index.css               # 全局样式
│   ├── types/
│   │   ├── quotation.ts        # 报价单类型定义
│   │   └── costQuote.ts        # 成本报价类型定义
│   ├── lib/
│   │   ├── constants.ts        # 公司信息、默认条款、资源路径
│   │   ├── store.ts            # 报价单 Store（国内 + 国际共用工厂）
│   │   ├── sample.ts           # 国内报价示例数据
│   │   ├── sample-intl.ts      # 国际报价示例数据
│   │   ├── pdf.ts              # PDF 导出引擎（国内 + 国际）
│   │   ├── costStore.ts        # 成本计算 Store
│   │   ├── costCalculations.ts # 成本计算函数（A-I）
│   │   ├── costFormat.ts       # 金额/重量格式化
│   │   ├── costStorage.ts      # 成本数据 localStorage
│   │   ├── historyStore.ts     # 报价汇总 Store（含 API 同步）
│   │   └── useIsMobile.ts      # 移动端检测 Hook
│   ├── components/
│   │   ├── intl/               # 国际报价组件（需逐步合并到共享层）
│   │   ├── cost/               # 成本计算组件
│   │   ├── process/            # 流程查阅组件
│   │   └── *.tsx               # 国内报价共享组件
│   ├── pages/
│   │   ├── Dashboard.tsx       # 首页
│   │   ├── QuotationPage.tsx   # 国内报价
│   │   ├── QuotationPageIntl.tsx # 国际报价
│   │   ├── CostCalculatorPage.tsx # 成本计算
│   │   ├── ProductionReportPage.tsx # 生产日报
│   │   └── ProcessCenter.tsx   # 流程查阅
│   └── data/                   # 示例数据
├── server/
│   ├── server.js               # Express API（历史记录 + 生产日报）
│   ├── production-config.json  # 生产日报配置（git-ignored）
│   └── teao-api.service        # systemd 服务文件
├── docs/                       # 设计文档
├── trash_review/               # 待删除文件审查区
├── CLAUDE.md                   # AI 编码规范
├── .env.example                # 环境变量模板
└── package.json
```

---

## 环境变量

复制 `.env.example` 为 `.env` 填入真实值：

| 变量 | 用途 |
|------|------|
| `API_PASSWORD` | API 认证密码 |
| `VIKA_TOKEN` | 维格表 API Token |
| `ASSEMBLY_DATASHEET_ID` | 装配部维格表 ID |
| `INJECTION_DATASHEET_ID` | 注塑部维格表 ID |
| `WECOM_WEBHOOK` | 企业微信机器人 Webhook |
| `CRON_EXPRESSION` | 推送定时表达式（默认 13:00） |

生产环境：在 `teao-api.service` 的 `[Service]` 区块中通过 `Environment=` 设置。

---

## 部署

项目通过 GitHub Actions 自动部署到服务器：

1. 前端静态文件 → `/var/www/teao-platform/`
2. API 服务器 → `/var/www/teao-platform/server/`
3. Nginx 反向代理 `/api/` → `127.0.0.1:3899`

> 部署前需在 GitHub Secrets 中配置 `DEPLOY_SSH_KEY`

---

## 开发规范

见 [CLAUDE.md](CLAUDE.md) — 所有 AI 协作必须遵循的编码规范。

核心规则：
- **不自动提交 Git**，等用户确认
- **不复制粘贴代码**，国内/国际报价共用逻辑必须抽取
- **新代码避免 inline style**，优先使用 CSS Modules
- TypeScript `strict: true`，零类型错误

---

## 待办事项

详见 [TODO.md](TODO.md)，主要待完成：
- [ ] 替换真实 Logo 和公章
- [ ] 手机端响应式适配
- [ ] 用户登录与权限管理
- [ ] 后端 API + 数据库持久化
- [ ] 报价历史版本对比
- [ ] 邮件发送报价单
