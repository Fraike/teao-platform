# 2026-11-02 依赖升级本地验收

本记录仅证明本地验收，未提交、推送或部署。此前未提交的业务优化继续保留，不包含生产数据操作。

## 主要版本

- Ant Design 5.29.3 → 6.6.8，icons 5.6.1 → 6.3.4；移除 v5 React 19 补丁，迁移 Alert/Modal/Drawer/Space/Spin/Image/Timeline 等属性与 Select 内部 DOM 样式及测试选择器。
- React/React DOM 19.2.5 → 19.3.1；Vite 8.1.6 → 8.3.5；Zustand 5.0.12 → 5.0.16；PDF.js 前后端统一为 6.5.438。
- ESLint 10.2.1 → 10.14.0，typescript-eslint 8.59.1 → 8.72.1，jsdom 29.1.1 → 30.1.3。
- Express 4.22.3 → 5.3.0，node-cron 3.0.3 → 4.6.0，better-sqlite3 12.10.0 → 13.0.3。
- Node 24 环境验证；开发最低版本明确为 24.15.0。TypeScript 6.0.3 与 Node 类型 24.19.2 保持受支持组合。其他直接依赖及兼容补丁以两份锁文件为准。

## 漏洞与兼容修复

- 根目录审计原有的 12 项中危报告来自 minimatch 漏洞的传递依赖链。仅对 ESLint、@eslint/config-array、@typescript-eslint/typescript-estree 覆盖 minimatch 11.0.4；锁文件无旧 minimatch 残留。新增真实 ESLint 文件匹配回归，验证 TS/TSX 规则应用与 dist 忽略。
- Express 5 对未解析 body、简单 query 及 listen 错误的行为发生变化。沿用既有空 body 校验；拒绝 bracket 结构的待审筛选参数；listen 失败时退出，不再误报启动成功或启动定时任务。相应测试已先失败再修复通过。
- node-cron 4 在 stop 后仍保留注册记录，四处调度服务释放不再复用的任务时同步 destroy。真实 cron 生命周期与产品同步释放回归通过，测试不依赖旧 uuid/内部文件路径/now 私有方法。
- Antd 新版依赖 MessageChannel。测试环境保留真实异步通道，解除端口对进程退出的引用并统一清理，移除旧的禁用 MessageChannel 设置。

## 验证证据

- Node 24 下 `npm test` 完整退出 0，包含新增 `test:tooling`、报价/账号/标签页、权限、标准、产品、PDF、发布与真实 cron 回归。
- `npm run lint`、`npm run build`、`npx tsc --noEmit -p tsconfig.products.json`、`git diff --check` 通过。
- 官方 registry 的根目录与 server `npm audit` 均为 0 漏洞。未使用 `audit fix --force` 或忽略 peer 冲突。
- 仓库外全新目录使用原清单与锁文件 `npm ci` 成功，并完成独立构建。发布包内 server 单独 `npm ci --omit=dev` 成功，不依赖仓库根 node_modules。
- 发布包在隔离配置/数据目录启动，健康检查与登录通过；production/products/quotation/standards 四库 integrity_check 为 ok，随后停止测试进程。
- Chrome 本地隔离数据验证标准表格筛选/重置、标签返回恢复 scrollTop=300、中文日期、标准新增弹窗 Select 与报价页面；国内/国际报价实际下载的 PDF 都能解析为 1 页。PDF.js worker 实际将横版测试 PDF 渲染成 736×520 canvas，像素校验为红色，捕获的页面 JS 异常为 0。金蝶凭据未连接，本次浏览器验收不代表真实金蝶接口联调。
- 独立只读代码复查未发现可确认的 P1/P2 问题。

## 保留事项

- TypeScript 7 暂不在 typescript-eslint 支持范围，故保持 6.0.3；Node 类型跟随生产 Node 24，而非改成 Node 26。
- SheetJS 0.20.3 继续使用官方 CDN；旧 Babel 7/nanoid 3 等传递依赖 override 保持父包兼容范围。
- Antd 仍支持的 List 用法暂保留，存在弃用提示；迁移 Listy 涉及通知/待审/流程列表布局，未混入本轮。测试中部分 act 提示和构建大 chunk 提示仍存在，均未屏蔽。
- 新版 UI vendor gzip 包约 451 kB，较原约 387 kB 增大；浏览器功能通过，尚无线上性能收益结论。
- 所有隔离测试资料均位于 /tmp。未删除或移动用户原始 Excel、截图、运行数据或历史资料。旧发布包不可复用于新依赖版本，正式部署应从最终确认的 Git 版本重新构建。

参考：[Antd 6 迁移](https://ant.design/docs/react/migration-v6/)、[Express 5 迁移](https://expressjs.com/en/guide/migrating-5/)、[node-cron 4 迁移](https://www.nodecron.com/migrating-from-v3.html)、[minimatch 公告](https://github.com/advisories/GHSA-g3hv-75wg-m249)、[SheetJS 官方分发](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)。
