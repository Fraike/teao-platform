# 特澳科技业务工具平台 — 项目交接文档

## 项目概述

东莞市特澳电子科技有限公司内部业务工具平台（teao-platform），基于 React + TypeScript + Vite 构建，集成报价单生成系统和成本计算系统两个核心业务模块。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| TypeScript | 6.x | 类型系统 |
| Vite | 8.x | 构建工具 |
| Ant Design | 5.x | UI 组件库 |
| Zustand | - | 状态管理 |
| html2canvas | - | DOM → Canvas 截图 |
| jsPDF | - | PDF 生成与下载 |
| react-router-dom | - | 客户端路由 |
| dayjs | - | 日期处理 |

## 项目结构

```
teao-platform/
├── public/
│   └── assets/
│       ├── company-logo.png      # 企业 Logo（占位图，需替换）
│       └── company-stamp.png     # 电子公章（占位图，需替换）
├── src/
│   ├── App.tsx                   # 路由框架 + 顶部导航
│   ├── main.tsx                  # 入口
│   ├── index.css                 # 全局样式
│   ├── types/
│   │   ├── quotation.ts          # 报价单类型定义
│   │   └── costQuote.ts          # 成本报价类型定义
│   ├── lib/
│   │   ├── constants.ts          # 公司信息、默认条款、资源路径
│   │   ├── store.ts              # 报价单 Zustand Store
│   │   ├── sample.ts             # 报价示例数据
│   │   ├── pdf.ts                # PDF 导出引擎
│   │   ├── costStore.ts          # 成本计算 Zustand Store
│   │   ├── costCalculations.ts   # 成本计算函数（A-I）
│   │   ├── costFormat.ts         # 金额/重量格式化
│   │   └── costStorage.ts        # 成本数据 localStorage
│   ├── data/
│   │   └── exampleCostQuote.ts   # 成本计算示例数据
│   ├── pages/
│   │   ├── Dashboard.tsx         # 首页（系统入口）
│   │   ├── QuotationPage.tsx     # 报价单编辑页
│   │   └── CostCalculatorPage.tsx # 成本计算编辑页
│   └── components/
│       ├── CustomerCard.tsx       # 客户信息表单
│       ├── QuoteMetaCard.tsx      # 报价信息表单
│       ├── ProductCard.tsx        # 产品明细 Table
│       ├── TermsCard.tsx          # 条款编辑器
│       ├── ExportSettingsCard.tsx  # 导出设置
│       ├── PreviewPanel.tsx       # A4 报价单预览
│       └── cost/
│           ├── BasicInfoForm.tsx   # 成本基础信息
│           ├── QuoteToolbar.tsx    # 成本工具栏
│           ├── MaterialCostSection.tsx  # A 原材料
│           ├── PurchasedPartSection.tsx # B 外购件
│           ├── ManufacturingSection.tsx # C 制造费用
│           ├── AmortizedCostSection.tsx # D 专项分摊
│           ├── PackagingSection.tsx     # E 包装费
│           ├── TransportSection.tsx     # F 运输费
│           ├── MarkupSection.tsx        # G 加成费用
│           └── CostSummaryPanel.tsx     # 费用汇总
├── PROJECT_HANDOFF.md
├── TODO.md
├── CHANGELOG.md
└── package.json
```

## 核心数据流

```
用户录入 → Zustand Store → localStorage (自动保存)
                ↓
         PreviewPanel (实时预览)
                ↓
         html2canvas → jsPDF (导出 PDF)
```

## 固定配置

公司信息在 `src/lib/constants.ts` 中硬编码：

```ts
COMPANY_INFO = {
  name: '东莞市特澳电子科技有限公司',
  address: '东莞市黄江镇黄江北三街2号',
  tel: '0769-82937929',
  email: 'info@chinateao.com',
}
```

Logo 和公章路径：`/public/assets/company-logo.png`、`/public/assets/company-stamp.png`

## 路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Dashboard | 系统入口首页 |
| `/quotation` | QuotationPage | 报价单编辑 |
| `/cost` | CostCalculatorPage | 成本计算 |

## 启动与构建

```bash
npm install
npm run dev      # 开发
npm run build    # 生产构建
npm run preview  # 预览构建结果
```

## 待替换资源

- `public/assets/company-logo.png` — 替换为真实企业 Logo
- `public/assets/company-stamp.png` — 替换为真实电子公章 PNG
