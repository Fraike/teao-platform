# 👤 User Profile

- Name: Mike
- Background: Former Frontend Developer
- Preferred Stack: React / JavaScript / Node.js
- Style: Practical, efficient, minimal explanation, result-oriented

---

# 🚨 强制规则（最高优先级，不可违反）

## Git 操作
- **绝对禁止**未经用户明确确认进行 `git commit`、`git push` 或任何修改 Git 历史的操作
- 代码改动完成后**只改不提交**，等用户确认后再 commit
- 每次提交/推送前都需要重新确认，不存在"自动提交"模式
- 每个确认只对该次操作有效

## 部署操作
- **绝对禁止**未经用户明确确认进行任何部署操作（触发 CI/CD、SSH 部署等）
- 部署前必须先告知用户将要部署的内容

---

# 🧠 工作流程

1. 理解需求（不确定时先问）
2. 写 SPEC 明确方案
3. 拆分成独立任务
4. **等待确认**再做
5. 逐步实现

**永远不要跳过确认直接写代码。**

---

# ⚙️ 编码规范

## 项目通用
- 使用 TypeScript，避免 `any`，类型定义集中在 `src/types/`
- 不使用 `default export`，统一使用命名导出
- 函数保持小而专注（<50 行为佳）
- 避免不必要的抽象，保持代码简单直接

## React 组件
- 函数式组件 + hooks，不使用 class 组件
- 一个文件一个组件（小型辅助组件除外）
- **禁止使用 inline style 对象** — 新代码必须使用 CSS modules（`*.module.css`）或 Ant Design 的 `token`/`theme` API

## 状态管理（Zustand）
- 每个 Store 一个文件，放在 `src/lib/` 下
- Store 名称使用 `useXxxStore` 命名
- 所有 mutation 必须同时调用 `save()` 持久化到 localStorage

## 代码复用（重要！）
- **国内报价和国际报价之间绝对不允许复制粘贴代码**
- 共用逻辑抽取到共享函数/hooks/组件中
- 用参数（如 `isIntl: boolean`）或配置对象区分行为差异
- 新功能先在共享层实现，再在两个页面中使用

## 文件操作
- **禁止直接删除文件** — 先移到 `trash_review/` 目录
- 覆盖文件前先确认
- 大批量操作前先展示预览

---

# 📂 项目结构

```
teao-platform/
├── src/
│   ├── types/         # TypeScript 类型定义
│   ├── lib/           # 工具库、Store、计算逻辑
│   ├── components/    # 共享组件
│   │   ├── intl/      # 国际报价特有组件（应逐步合并到共享层）
│   │   ├── cost/      # 成本计算组件
│   │   └── process/   # 流程查阅组件
│   ├── pages/         # 页面组件
│   └── data/          # 示例数据
├── server/            # Express API（生产日报、报价汇总）
├── public/assets/     # 静态资源
├── docs/              # 设计文档和 spec
└── data/              # 运行时数据（git-ignored）
```

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript 6 | UI 框架 |
| Vite 8 | 构建工具 |
| Ant Design 5 | UI 组件库 |
| Zustand 5 | 状态管理 |
| html2canvas + jsPDF | PDF 导出 |
| Express 4 | API 服务器 |

---

# 🧾 输出规范

- 语言：中文
- 风格：简洁、直接、可操作
- 避免长篇理论，聚焦具体执行步骤
- 改动前先展示摘要，改动后报告结果
