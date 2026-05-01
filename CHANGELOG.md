# CHANGELOG

## 2026-05-01 — v2.3 PDF 导出修复

### 修复
- Logo/公章改为 base64 预加载，解决 html2canvas 渲染异常
- 移除 letterSpacing，修复单号/日期/币种/税率说明在 PDF 中不可见
- 合计金额从 `p.amount` 改为 `price * qty` 实时计算
- PDF 显式指定 `format: "a4"`，用 pageSize 精准分页
- 移除 borderRadius/linear-gradient 等 html2canvas 不兼容样式

---

## 2026-05-01 — v2.2 合并成本计算系统

### 新增
- 成本计算系统完整功能（替换占位页），支持 A-G 七个成本模块：
  - A 原材料分析、B 外购件分析、C 制造费用分析
  - D 专项分摊分析、E 包装费分析、F 运输费分析、G 加成费用分析
- 成本汇总面板（H 不含税合计 / I 含税合计），含各项明细占比
- JSON 导入/导出/保存功能
- 示例数据（齿轮阻尼器 RD-T022）

### 变更
- UI 统一为 Ant Design 风格（移除 cost-calculator 的 Tailwind CSS）
- lucide-react 图标替换为 @ant-design/icons
- 成本计算独立子工具栏，与报价系统保持一致风格
- 左右分屏布局（左侧 65% 录入区，右侧 35% 汇总面板）

### 删除
- Tailwind CSS 依赖（@tailwindcss/vite、tailwindcss）
- lucide-react 依赖

---

## 2026-05-01 — v2.1 项目重命名

### 变更
- 项目名由 `quotation-generator` 改为 `teao-platform`
- index.html 标题改为"特澳科技业务工具平台"
- README.md 重写为平台说明文档
- PROJECT_HANDOFF.md 更新项目概述与路径引用

---

## 2026-05-01 — v2.0 平台化重构

### 新增
- 首页 Dashboard，展示多个业务系统入口卡片
- 成本计算系统占位页面
- react-router-dom 客户端路由（`/`、`/quotation`、`/cost`）
- 统一的深色 Header 导航（首页 / 报价系统 / 成本计算）

### 变更
- 项目更名为"特澳科技业务工具平台"
- 全面使用 Ant Design 5.x 组件重构 UI
- 公司信息写死为常量，不再允许编辑
- Logo 和公章改为固定资源路径
- 报价系统页面拆分为独立子页面
- 产品明细表格：操作列固定右侧、产品名称列加宽
- A4 预览面板重新设计（更大留白、商务配色、渐变分隔线）

### 删除
- 公司信息编辑表单
- Logo / 公章上传组件
- IndexedDB 图片存储（图片改为直接存储 base64 到 localStorage）
- Tailwind CSS 依赖

### 修复
- antd v6 与 React 19 类型不兼容 → 降级到 antd v5
- 隐式 any 类型参数 → 全部添加显式类型注解

---

## 2026-05-01 — v1.0 初始版本

### 功能
- 左右分屏报价单编辑与预览
- 公司/客户信息编辑
- 产品明细增删改查 + 图片拖拽上传
- 条款编辑
- Logo / 公章上传
- A4 实时预览
- html2canvas + jsPDF 导出 PDF
- localStorage 自动保存
