# 运行与发布清单

本文描述仓库中的运行约束，不是线上状态证明。历史上线记录见 `docs/audits/`，每次发布都应重新预检。本轮静态资源保留、PDF 失败清理修复仅在本地，须验证后另行确认部署。

## 运行配置

- 开发/构建需要 Node.js 24.15+（24 主版本）；当前工作流及生产预检要求 `/usr/bin/node` 为 24 主版本。原生 SQLite 依赖需在目标 Node/系统中重新安装，不能复制开发机 `node_modules`。
- systemd 使用 `server/teao-api.service`，通过 `EnvironmentFile=/etc/teao-platform/teao-api.env` 读取持久配置，文件权限 `0600` 或更严格。
- 必设 `JWT_SECRET`、`DATA_DIR`、`KINGDEE_CLIENT_ID`、`KINGDEE_CLIENT_SECRET`、`INITIAL_ADMIN_PASSWORD`、`ADMIN_RECOVERY_CODE`，并明确设置 `STANDARD_REVIEW_REMINDERS_ENABLED=true/false`。
- `PRODUCTION_CONFIG_PATH` 必须显式指向 `DATA_DIR` 内已存在的日报配置。代码发布不创建或覆盖生产环境文件，不应继续依赖仓库内 `server/production-config.json`。既有配置迁移需独立审核确认。
- 站点 `/var/www/teao-platform`、持久数据与发布状态目录须在同一文件系统；暂存目录、状态目录与站点隔离。当前默认状态目录 `/var/lib/teao-platform/releases`，维护标记由 Nginx 与 worker 共用，不得绕过。

## 发布前

产品标准待审通知使用企业微信自建应用，服务端环境需配置 `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_APP_SECRET`；应用可见范围覆盖审核人，并在用户档案中绑定其 `wecomUserid`。密钥仅保存在持久环境文件，禁止放入前端或仓库。提交待审、停用申请即时通知及标准定时/手动催审只发指定审核人的应用账号，无群机器人回退；缺配置、无绑定、权限变更或发送不确定时，系统明确显示通知未送达。停用申请保持原有调度范围，不新增定时/手动催审功能。

审核通过与管理员直接发布的群公告保留标准号、版本和完整适用参数表，删除独立审核记录、原始批注及重复操作指引；超长参数按字节限制分段，不省略参数。原始批注与审核记录继续保存在系统。历史已入队公告保留原快照和发送进度；不因模板升级批量重发。驳回及生产日报继续使用各自原有群通知流程。

依赖维护优先采用官方来源的最新稳定版，不使用 alpha/beta/rc。升级时检查 peerDependencies、Node 要求和主版本迁移，完整回归后将直接依赖固定为验收版本，并提交两份锁文件供 `npm ci` 复现。TypeScript 7 当前超出 typescript-eslint 的支持范围，暂留最新 6.0.x；不要忽略 peer 冲突强装。SheetJS 继续使用官方 CDN 分发，不能用 npm registry 的旧版替换。既有传递依赖 override 按父包支持范围维护，不把 Babel 7 或 nanoid 3 无条件替换成新主版本。

本轮 minimatch 修复仅覆盖 ESLint、@eslint/config-array 和 @typescript-eslint/typescript-estree 三条依赖边；上游兼容安全版本发布后再评估移除 override，保留文件匹配回归。Antd 6 支持的旧 List 用法暂保留；其迁移涉及通知/待审/流程列表布局，待未来升级前单独处理，不影响当前运行。

1. 明确范围及 Git 版本，分别确认提交、推送、部署；资料导入和数据修复另行确认。展示本次发布内容后才请求部署授权。
2. 在干净副本运行 `npm ci` 与 `npm ci --prefix server`；单独验证 server 生产依赖可用，不能依靠根目录 `node_modules` 补全缺包。可把白名单发布包放到仓库外的全新目录，运行 `npm ci --omit=dev --prefix <暂存绝对路径>/server` 及 API 导入/启动检查（使用隔离测试配置、数据目录，禁用通知），避免触碰生产数据。
3. 使用官方 registry 审计两份锁文件：`npm audit --registry=https://registry.npmjs.org` 与 `npm audit --prefix server --registry=https://registry.npmjs.org`。保留当次结果；历史“0 漏洞”不代表本次依赖仍安全。
4. 运行 `npm run lint`、`npm test`、`npm run build` 及本次变更专项回归。确认 PDF 主程序与 worker 版本一致，真实渲染、失败后重试和旧标签打开资源可用。
5. 用 `release-package.js` 创建新的隔离输出目录，核对 manifest、包哈希及来源版本；确认包内无运行数据、私人配置、源 Excel、备份或图纸原件。
6. 对线上服务、磁盘、Nginx、Node、当前 release 状态、manifest 偏移、数据库完整性及图纸文件做只读预检。备份所有现有业务库和引用文件，不能以历史导入数量代替当前基线。

## 发布与验收

GitHub Actions 只有 `workflow_dispatch`，必须输入 `release`，推送不触发部署。工作流先暂存包，再运行 `release-deploy.js` 预览，取得 fingerprint 后执行 `--apply --confirm`；手工发布同样需要本次预览，禁止复用旧指纹。此步骤只在用户已明确确认部署后执行。

发布脚本安装暂存 server 依赖，保存旧服务探针基线，在维护窗口停 API、原生备份数据、切换代码并检测健康。包不携带业务数据库，也不自动导入图纸；启动中的兼容性迁移仍可能写库，不能称为“绝不触碰数据库”。

- 静态目录可供 Nginx worker 遍历、文件可读；普通静态目录通常 `0755`、文件 `0644`。以实际 worker 身份检查首页、JS/CSS、PDF worker 的读取及 HTTP 200；不要递归放宽站点内私人数据和配置权限。
- 确认 `/data`、`/server`、私有配置、原始表格与备份不能从静态根目录下载，维护标记在维护期间对 worker 可读。
- 检查 `/api/health`、登录、模块权限、国内/国际报价 PDF、商品图纸打开/切换/失败后重试、标准跳转及日报数据。检查所有库完整性及原文件关联，不做重新导入。
- `product_import_batches` 保持原四列 `id/name/created_at/created_by`；类型放在 `product_import_batch_types`，半成品信息由对应新表承载。验证新增表和旧批次兼容，回滚时不删这些表或导入记录。
- 本轮待发布资源保留修复意在维持上一版页面引用的哈希资源可用，需实际验证旧标签页跨发布继续打开 PDF/懒加载功能。不能把有限版本保留描述为任意历史版本永久兼容。

## 回滚与异常恢复

- 发布失败时脚本尝试恢复代码及服务；新 API 启动后可能修改数据的维护窗口内，脚本保留失败数据并恢复启动前的一致性镜像。检查 `state.json` 的 `rolled-back` 或 `recovery-required`，不得看到报错就自行解除维护锁。
- 成功发布后的独立回滚只支持当前最新 release；先用 `release-deploy.js --rollback <state.json绝对路径>` 预览，再取得用户对本次回滚的确认后执行 `--apply --confirm <本次fingerprint>`。线上代码漂移、安全 Nginx 配置漂移或缺失服务基线时，应先审阅原因。
- 独立回滚恢复代码和旧 unit，保留安全 Nginx 规则，不恢复业务数据库。新产生的数据必须保留；上线后整库恢复属于独立数据操作，不能以代码回滚授权代替。
- 验证旧代码可读取发布后的数据库（包括批次四列与新表共存）和已有图纸；历史状态缺失或 `recovery-required` 时按 journal 人工审核恢复，不猜测目录、不删除锁或失败资料。

## 资料保留与归档建议

报价草稿按登录账号分别保存在本机。旧版未绑定账号的本地草稿保留原存储键，但不会自动加载到任何账号；如需恢复，须先由管理员确认归属，避免同一设备上的其他用户读取。

以下仅为建议，本轮不移动或删除任何文件：

- 保留：当前源码、锁文件、配置模板、当前 spec、必要测试夹具和可追溯的发布/验收记录。
- 历史文档：`PROJECT_HANDOFF.md` 保留原文并标记历史；旧设计/计划/审计保留日期和状态，使用索引链接当前说明，不能批量改写为“已上线”。
- 用户 Excel、源图纸、备份、运行库、私人配置：保留原位置与访问权限，记录归属和用途；不得纳入公共发布包。需要整理时先列出完整预览、目标位置与回退方式，等用户确认。
- 临时构建/截图/调试输出：先确认可重建、无业务原件或敏感信息；若批准整理，先移至 `trash_review/` 审阅，不直接删除。备份清理须单独定义保留周期并确认。
