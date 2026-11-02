# 依赖升级实施计划

**Goal:** 修复开发工具漏洞并将兼容的直接依赖升级到最新稳定版本。
**Architecture:** 保持现有前后端分离与共享报价实现，仅修改依赖、迁移必要 API 和对应回归；直接在 main 实施，保留先前本地改动。
**Spec:** `docs/specs/2026-11-02-dependency-upgrade.md`（用户已确认）。
**Constraints:** Node 24；TypeScript 保持受 typescript-eslint 支持的最新 6.0.x；禁止提交、推送、部署、删除原文件或修改业务数据。

## Review Focus

- ESLint 的 glob/ignore 行为不能因 minimatch 跨版本修复而改变。
- Antd 虚拟表格、日期中文、弹层容器及滚动恢复必须继续工作。
- Express 5 的 query/body 默认值及异常传播不能改变现有错误返回。
- node-cron 4 的任务停止/销毁与重复启动不能留下重复任务。
- SQLite 原生依赖需同时支持根目录测试和独立 server 安装。

## Tasks

- [x] 1. 开发工具：记录 audit 基线；更新 ESLint、typescript-eslint 与插件/构建工具；对必要 minimatch override 验证文件匹配和 lint；运行 audit/lint。
- [x] 2. 前端：同步升级 React/Antd/icons/PDF.js 等，移除 v5 补丁；先运行构建与前端回归暴露不兼容点，再逐项适配并验证，不削弱业务断言。
- [x] 3. 服务端：升级 Express/cron/SQLite，同步 PDF.js；移除失效的旧 override；运行路由/调度/产品回归，新增必要的真实库兼容断言。
- [x] 4. 验收：全量 npm test、lint、类型、build、双 audit；仓库外干净安装及独立 server 启动；本地浏览器检查主要表格、弹窗、日期与报价/PDF；进行一次独立复查。
- [x] 5. 文档：更新运行版本与依赖维护说明、记录验收结果和兼容版本例外，保持未提交。

## 执行记录

- 方案已经确认；本轮更新可覆盖上述相关代码与依赖清单，不覆盖业务资料。
- Ruling: 跳过技能默认的 worktree/commit 步骤，遵循用户 main 分支和不提交要求；成本：需要用 diff 区分已有改动与本轮迁移。
- Ruling: 使用现有有业务断言的测试暴露升级回归，仅为未覆盖的迁移风险新增测试；不创建仅复述版本号的测试。

- Task 1: complete — 双 audit 为 0；ESLint 文件匹配及 lint 通过。
- Task 2: complete — Antd 迁移及全量前端回归通过；国内/国际 PDF 实际导出成功；图纸 worker 浏览器渲染通过。
- Task 3: complete — query 与 listen、cron 注册释放均有 RED→GREEN 证据；独立 server 安装/启动/登录与四库完整性通过。
- Task 4: complete — 全量 npm test、lint、build、产品类型、diff check 全部退出 0；干净根目录 npm ci 与 build 通过；独立复查无可确认 P1/P2。
- Task 5: complete — README、operations 与 dependency-upgrade-20261102.md 已记录版本、规则和验收限制。
- Ruling: TypeScript 留在 6.0.3，Node 类型留在 24.x，保留父包所需 Babel 7/nanoid 3；原因是已知兼容范围，成本是暂不能采用对应最新主版本。
- Ruling: 保留 Antd 6 兼容的 List API；迁移 Listy 涉及通知/待审/流程布局，成本是当前仍有弃用提示，升级下一主版本前需处理。
- Deferred minors: 现有测试 act 提示与构建大 chunk 提示保留；新版 UI 包体增大已在验收记录披露，未为了消除提示重写业务界面。
