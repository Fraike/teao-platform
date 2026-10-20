# 2026-10-20 上线清单

> 当前状态：运行代码3331c9e已于2026-10-20完成正式部署，机器人持久配置已更新，未覆盖业务数据库。发布记录见[正式发布记录](../audits/release-20261020-3331c9e.md)。本文件下方保留发布前的计划与候选清单，原“未提交/未部署”描述只代表当时；阶段收尾见[阶段收尾记录](2026-10-20-product-standard-phase-closure.md)。

## 本次范围

- 工程标准：独立直接停用权限、申请停用审核、管理员介入待审、撤回及清理草稿。
- 展示：仅生效标准显示正式标签、总数与筛选数、变更历史统一入口、提交通知明确提交人和审核人。
- 装配日报：群推送增加客户名称；注塑格式保持。
- 自动催审：上海工作日08:00每日一次，沿用生产日报休息/补班配置；重启不补发；跨进程每日去重；排队及限流后的夜间发送防护。
- Lint阻塞修复：移除停用弹窗测试里未使用的click函数。

## 验证

完整回归和构建已通过；最终标准前端批次114/114。Lint修复后完整npm run lint通过，相关停用/申请/详情测试6/6通过，diff检查通过。依赖通过npm官方源审计，前后端均0项已知漏洞。发布试打包139项，必要新增后端模块齐全，运行数据/凭据/原始Excel不入包。

## Git与发布边界

当前分支保留feature/product-standard。未提交或推送。下方列出待确认纳入提交的代码、测试和方案文档；不包含.workbuddy、原始XLS、临时审计/预览、运行数据库、账号、.env及机器人配置，不夹带报价兼容性文档。

## 正式上线顺序

1. 分别确认本次提交、推送；核对提交内完整新增模块，防止CI checkout缺文件。
2. 正式部署前确认服务器预检、线上数据备份和回滚方案；沿用受控整包发布及维护窗口，不整库同步本地data，不重新导入Excel。
3. 在维护窗口内使旧两小时任务停止，部署新代码；线上持久配置单独更新机器人Webhook（测试环境已更新）。核对STANDARD_REVIEW_REMINDERS_ENABLED=true，确认配置文件优先级、上海时区、休息日及补班日。保留生产日报原推送时间。
4. 新字段、停用申请表与每日去重表通过启动时增量初始化，不覆盖线上已有业务记录。
5. 验收健康检查、普通用户/管理员审批及停用流程、标准总数与变更历史、装配日报预览客户列；经授权后验收真实群通知与@，次工作日08:00观察定时行为。

当前只完成本地准备，未连接或修改线上环境；线上Webhook、服务状态、磁盘和备份需部署阶段现场核验。

## 候选提交文件

- `.env.example`
- `docs/specs/2026-10-19-admin-pending-intervention.md`
- `docs/specs/2026-10-19-retirement-permission-and-application.md`
- `docs/specs/2026-10-19-standard-effective-label-and-count.md`
- `docs/specs/2026-10-19-standard-history-entry.md`
- `docs/specs/2026-10-19-standard-retirement-and-report-customer.md`
- `docs/specs/2026-10-19-standard-withdraw-draft.md`
- `docs/specs/2026-10-20-production-release-checklist.md`
- `docs/specs/2026-10-20-workday-review-reminders.md`
- `package.json`
- `server/routes/standards.js`
- `server/services/notifications.js`
- `server/services/report.js`
- `server/services/standard-notify.js`
- `server/services/standard-query.js`
- `server/services/standard-reminder-schema.js`
- `server/services/standard-retirement-permissions.js`
- `server/services/standard-retirement-schema.js`
- `server/services/standard-retirement.js`
- `server/services/standard-review-reminders.js`
- `server/services/standard-store.js`
- `server/services/users.js`
- `src/components/standard/StandardDetailDrawer.tsx`
- `src/components/standard/StandardDraftActionButton.tsx`
- `src/components/standard/StandardFormModal.tsx`
- `src/components/standard/StandardHistoryDrawer.tsx`
- `src/components/standard/StandardPendingActionModal.tsx`
- `src/components/standard/StandardRetireModal.module.css`
- `src/components/standard/StandardRetireModal.tsx`
- `src/components/standard/StandardRetirementPanel.module.css`
- `src/components/standard/StandardRetirementPanel.tsx`
- `src/components/standard/StandardUsageGuide.tsx`
- `src/lib/standardDraftActions.ts`
- `src/lib/standardFormat.ts`
- `src/lib/standardOutputFields.ts`
- `src/lib/standardVersionDiff.ts`
- `src/lib/userPermissions.ts`
- `src/pages/ProductStandardPage.module.css`
- `src/pages/ProductStandardPage.tsx`
- `src/types/standard.ts`
- `start-dev.sh`
- `test/production-report-customer.test.js`
- `test/production-scheduler-compat.test.js`
- `test/standard-admin-pending-ui.test.ts`
- `test/standard-admin-pending.test.js`
- `test/standard-draft-actions.test.ts`
- `test/standard-draft-workflow-ui.test.ts`
- `test/standard-manual-reminder.test.js`
- `test/standard-page.test.ts`
- `test/standard-pending-action-modal.test.ts`
- `test/standard-publication.test.js`
- `test/standard-query-scale.test.js`
- `test/standard-retire-modal.test.ts`
- `test/standard-retirement-display.test.ts`
- `test/standard-retirement-request-ui.test.ts`
- `test/standard-retirement-request.test.js`
- `test/standard-review-reminders.test.js`
- `test/standard-routes.test.js`
- `test/standard-seasonal-ui.test.ts`
- `test/standard-withdraw-draft.test.js`
- `test/start-dev.test.js`
