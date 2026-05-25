# 特澳科技业务工具平台

东莞市特澳电子科技有限公司内部业务工具平台，集成报价单生成、成本计算等业务模块。

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript 6 | UI 框架 |
| Vite 8 | 构建工具 |
| Ant Design 5 | UI 组件库 |
| Zustand | 状态管理 |
| react-router-dom 7 | 客户端路由 |
| html2canvas + jsPDF | PDF 导出 |
| dayjs | 日期处理 |

## 业务模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 首页 Dashboard | `/` | 系统入口 |
| 报价系统 | `/quotation` | 报价单编辑与 PDF 导出 |
| 成本计算 | `/cost` | A-G 全维度供应商成本核算 |

### 成本计算模块

支持七个成本维度分析：原材料 → 外购件 → 制造费用 → 专项分摊 → 包装费 → 运输费 → 加成费用，自动计算 H（不含税合计）和 I（含税合计）。

## 快速开始

```bash
npm install
npm run dev      # 开发模式
npm run build    # 生产构建
npm run preview  # 预览构建结果
```

## 项目结构

```
teao-platform/
├── public/assets/          # 静态资源（Logo、公章）
├── src/
│   ├── App.tsx             # 路由框架 + 顶部导航
│   ├── main.tsx            # 入口
│   ├── types/              # TypeScript 类型定义
│   ├── lib/                # 工具库（常量、Store、PDF 导出）
│   ├── pages/              # 页面组件
│   └── components/         # 可复用组件
└── package.json
```


报价单汇总查询密码 teao123