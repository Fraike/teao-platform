# 任务2：生产日报来源切换前端实施报告

工作区：`/Users/mikewang/AI_Workspace/teao-platform/.worktrees/production-daily-product-linking`。
仅前端改动，保留全部上一轮未提交修改；未改 server、package.json、商品关联/生产录入页面。未 commit、push、部署或真实发送企微。

## 实际文件

- `src/pages/ProductionReportPage.tsx`：生产日报汇总标题、真实来源标记、管理员双向切换确认、配置失败重试、消息预览、重复推送确认；首次和刷新仅 GET report，不再 POST fetch。
- `src/pages/ProductionReportPage.module.css`：原页头 inline 样式转 CSS Module，新预览/反馈/空率样式；旧表格布局及未改区域样式保留。
- `src/types/productionReport.ts`：集中汇总、来源配置、预览和请求协调类型，支持内部汇总 null 率。
- `src/lib/productionReportUi.ts`：权限/按钮、率格式、仅重复错误识别、日期/来源/请求序列 coordinator 和确认请求构造。
- `src/lib/api.ts`：兼容可选第三参数 code；HTTP 错误保留字符串 data.code，原无 code 接口行为不变。
- `test/production-report-ui.test.ts`：真实共享行为和 API HTTP 边界测试，没有源码字符串断言。

## 请求与安全行为

- 配置与报表分别记录加载/错误，配置失败不默认来源、不可切换/发送/预览，可刷新配置重试。配置初次结束后才发一次 GET report。
- 日期/来源改变推进上下文 revision；每类请求有 sequence。迟到的报表、配置、预览和发送结果/错误不会覆盖当前页面；切回同一日期也不复活旧请求。
- 预览关闭先使 ticket 失效，迟到结果不重开弹窗；pending 预览结束前仍保持 busy，不能通过关闭绕过忙操作。
- 切换成功清空报表/预览/重复确认，按当前日期重新 GET report；失败保留原来源和报表，不发送消息。
- 仅 `REPEAT_CONFIRMATION_REQUIRED` 可进入确认重发。确认请求引用 ticket 的日期/来源，确认前重新检查是否当前；日期/来源变化取消旧确认。busy/unknown/其它错误仅显示服务端提示，不自动重试。
- 发送/切换使用同步 ref 锁防双击；切换期间禁用日期及重复操作。管理员权限从 useAuthStore.user.role 获取。
- 原样预览 markdown 文本可滚动，明确显示日期与来源；零记录明确提示。null/undefined 率显示 `—`，不拼接百分号。

## TDD 红绿证据

Node：`v24.19.0`，运行时路径 `/Users/mikewang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。

先添加测试，未写实现时执行：

```sh
/Users/mikewang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types test/production-report-ui.test.ts
```

RED：exit 1，`AssertionError: ApiError 必须保留错误 code`，actual `undefined`，expected `REPEAT_CONFIRMATION_REQUIRED`。这是当前实现丢 code 的真实行为失败，不是模块/语法错误。

实现后同一命令 GREEN：exit 0，`Production report UI tests passed.`。

测试覆盖管理员双向按钮/普通用户无操作/未知来源不可猜测、null/undefined/零值率、ApiError 兼容与传输保留 repeat/busy/unknown code、刷新/换日/换源/关闭/卸载的 ticket 失效，以及确认 payload 正确日期/来源、过期确认不构造发送请求。

## 验证

```sh
PATH=/Users/mikewang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run lint
PATH=/Users/mikewang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
git diff --check
```

- lint：exit 0，无错误。
- build：exit 0，TypeScript 和 Vite 均通过。已有大 chunk >500kB 提示保留，未扩大范围重构。
- git diff --check：exit 0。
- 页面验收由主任务在临时 mock API/UI 上进行；本子任务未使用真实企微或生产数据。

## 剩余风险

- coordinator 做逻辑取消/结果隔离，未中断共享 api 底层 fetch；切日后的旧服务端请求仍会完成，忙冲突按服务端提示处理，不自动重试。
- 来源在其它页面/进程被修改时，返回来源不匹配的报表不会覆盖当前报表，会提示并提供刷新配置重试；没有新增后台轮询。
- 新测试覆盖纯共享行为及真实 API 错误边界；真实组件交互/视觉需以主任务临时环境验收结果为准。
