# 标准正式基线受控离线切换 Runbook

本文件是执行方案和接口约定，不是正式切换授权。代码提交、推送、部署、正式数据切换分别确认。本工具不自动停服务、重启服务、创建或移除维护标记，不发送消息。

## 范围与前置条件

- 唯一运行集：明确指定的 `standards.db`、`standards.db-wal`、`standards.db-shm`。不枚举 data 目录，不读取或修改用户、报价、日报、金蝶缓存等其他库。
- Node 24+，具备完整进程可见性的 root 权限和可执行的 `lsof`。非 root、lsof 缺失、超时、权限警告或检查失败均拒绝；无 force/skip/environment 绕过入口。
- 运维事先进入维护窗口，设置网关/API **实际识别**的维护文件，停止 teao-api、定时任务、独立写入脚本和其他读写连接，并禁止 supervisor/容器自动拉起。维护标记本身不能阻止后台写者。
- 推荐传 `--service teao-api`：额外要求 systemctl 返回 loaded、inactive、dead、MainPID=0；这不替代对目标和 staged 全运行集的 lsof 检查。工具只查询状态，不执行 systemctl stop/start。
- 所有路径使用绝对真实路径（可先 `realpath`）；拒绝路径任一层符号链接、数据库硬链接、特殊文件、残留 rollback journal。archive-root 必须已存在，与目标同文件系统，且与目标/staged 目录互不包含。维护文件不得位于 staged 或归档内。
- staged 必须为 builder 产出的已关闭 journal DELETE 库，无 WAL/SHM；必须含 `standard_review_reminders` schema。若 reminders 初始化方案或其他 schema 改动，重新构建，不能手改旧 manifest。

隔离产物布局：

```text
baseline-directory/
  standards.db
  baseline-manifest.json
  source-records.json
  sources/
    main.xls
    sanitary.xls
```

## 验证与指纹约定

强制验证 `baseline-manifest.json`：

- format=`teao-standard-baseline-build-v1`；records=809，comments=1264，sourceHistory 为非负安全整数，revision 与 staged 一致。
- DB 文件 SHA256、完整原始 schemaHash 与 manifest 一致。schemaHash 算法严格使用 `sha256(JSON.stringify(SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name 的 all() 结果))`。
- 标准主表、版本表、导入来源表分别809条；批注关联1264条；变更记录809+sourceHistory条；808 published、1 obsolete；outbox、reminders均为空。
- metadata 只有 id=1 一行。payload 中 format=`teao-standard-baseline-v1`，recordsHash、createdAt、tableNotes、transformations 与 manifest 一致；recordsHash 为64位小写SHA256。这里校验 builder 证据一致性，不重新解析 Excel。
- `source-records.json` 必须存在、为普通文件且不超过10MB；原始字节 SHA256 必须等于 recordsHash，路径/大小/摘要纳入指纹。builder 使用 JSON.stringify 无换行；本工具不重新解析该 payload 或引入 TS。
- sources 恰好两项，无重复/路径穿越，每项包含 file、sha256、bytes、非空 sheet/range。实际读取 `sources/<file>`，核对 bytes、SHA256，并固定本次已确认来源：
  - main.xls：`b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0`
  - sanitary.xls：`78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f`

目标与 staged 的兼容性使用 PRAGMA 语义 schema 签名，不比较 CREATE TABLE 原文。签名包括按名称排序的列（类型、notnull、默认值、pk、hidden）、外键分组、索引属性/列/排序/排序规则、表达式/部分索引、触发器、CHECK、STRICT/WITHOUT ROWID、视图；排除基线专有 metadata 表。因此历史迁移列顺序和普通 SQL 空白差异不会阻止切换，真实 schema 不兼容仍拒绝。

目标 logicalHash 覆盖 **所有表**（含 sqlite 内部表、outbox、reminders），行按稳定编码排序后哈希；同时绑定完整 schema、user_version/application_id。preview fingerprint 进一步绑定目标运行集各文件摘要、staged 全库逻辑/文件摘要、manifest 原始文件摘要及内容、来源文件摘要/路径、维护路径、service、archive-root 和新 revision。任何预览后的变化都要重新预览、重新确认。

所有 SQLite 检查在运行集的私有临时副本进行：检查 checkpoint busy/log、切 DELETE、完整性和外键检查、关闭后确认无 sidecar。原 DB/WAL/SHM 不被打开或 checkpoint，不破坏原始归档字节。临时检查副本检查后清理；原库和切换证据不会删除。

## API

同步命名导出，模块 `server/services/standard-baseline-cutover.js`，不导入 store、builder 或 TS：

```js
previewBaselineCutover({ target, staged, archiveRoot, maintenanceFile, service? })
// 返回完整 plan、fingerprint、newRevision、targetState、stagedState、manifest。

applyBaselineCutover({ target, staged, archiveRoot, maintenanceFile, service?, fingerprint })
// fingerprint 必须等于本次 preview 输出。
// 返回 { target, archive, revision, fingerprint, rollbackFingerprint, maintenance: true }。

rollbackBaselineCutover({ target, archive, maintenanceFile, service?, fingerprint })
// fingerprint 使用 apply 返回的 rollbackFingerprint；配置须与 receipt 一致。
// 返回 { target, archive, revision, maintenance: true, rolledBack: true }。

inspectSQLite(absoluteStandardsDatabase)
// 只做隔离副本检查，返回 schemaHash/semanticSchemaHash、全表counts、revision、
// logicalHash/contentHash、metadata、pragmas、原运行集摘要。
// 下层检查工具，调用方负责停写；不能代替 preview/apply 的来源与进程校验。
```

所有异常均抛出 Error；CLI 非零退出。没有默认 DATA_DIR，缺参不会隐式打开当前库。新 revision=`max(oldRevision, stagedRevision)+1`，安全整数溢出拒绝。

## 执行步骤（仅获得正式数据切换确认后）

以下为占位示例路径，执行前逐项替换为现场路径；同一套参数必须保持一致。先确认维护生效、服务已停止，独立写者已停止，且业务负责人已验收隔离产物及809条正式来源覆盖。

1. root 身份运行 preview，保存 JSON 输出到受保护的运维证据文件：

```sh
node server/scripts/standard-baseline-cutover.js preview \
  --target /srv/teao-platform/data/standards.db \
  --staged /srv/teao-baseline-20261019/standards.db \
  --archive-root /srv/teao-cutover-archives \
  --maintenance-file /srv/teao-maintenance \
  --service teao-api
```

2. 审核 plan（来源hash、数量、旧revision/运行集、路径、schema、fingerprint）。取得针对该 fingerprint 的正式切换确认，再执行：

```sh
node server/scripts/standard-baseline-cutover.js apply \
  --target /srv/teao-platform/data/standards.db \
  --staged /srv/teao-baseline-20261019/standards.db \
  --archive-root /srv/teao-cutover-archives \
  --maintenance-file /srv/teao-maintenance \
  --service teao-api \
  --fingerprint REVIEWED_PREVIEW_SHA256
```

apply 在目标目录获取排他目录锁，创建私有 cutover-UUID 归档与 plan.json。使用 COPYFILE_EXCL 在目标同目录生成 prepared 文件，仅修改其查询 revision，checkpoint/close 并验证其余业务内容未变；保留目标文件 owner/group/mode。随后重新完整预览、复查维护与进程，再将旧 DB/WAL/SHM 作为一个运行集归档到 original/，rename prepared 到目标，校验并持久化 receipt.json。文件和相关目录执行 fsync。

3. 保存 apply 返回的 archive 和 rollbackFingerprint。**成功后仍保持维护**。工具没有解封动作。重启 API/健康检查由运维另行执行；保持后台催审关闭、维护生效且禁止新业务提交。验收登录权限、分类/数量、批注、导出、打印、角标、revision/cache失效。不要为验收提交真实新标准或触发新 outbox/reminder。
4. 所有验收通过后，由负责人另行批准解除维护。开放后发生的新业务不能用旧快照直接覆盖；本工具会拒绝内容已变化的回滚。

## 维护期回滚

验收失败，先保持维护、再次停止 API 和所有读写者。原 archive 与维护/service 配置必须与 receipt 相同；使用 apply 输出的 rollbackFingerprint：

```sh
node server/scripts/standard-baseline-cutover.js rollback \
  --target /srv/teao-platform/data/standards.db \
  --archive /srv/teao-cutover-archives/cutover-UUID \
  --maintenance-file /srv/teao-maintenance \
  --service teao-api \
  --fingerprint REVIEWED_ROLLBACK_SHA256
```

- 回滚验证 receipt 自身指纹、原归档文件完整性、维护文件、进程状态，并比较当前业务 contentHash、语义 schema、user_version/application_id。contentHash 覆盖所有表内容，但排除 `standard_query_state`；该表必须仍恰好 id=1 一行且 revision 不低于安装时。
- 允许启动时相同分类内容的 UPDATE 导致 revision 增长、WAL 模式切换、checkpoint 和 sidecar 文件变化；真实标准、分类、outbox、reminder 等任何持久内容变化均拒绝。即使 revision 未变，也无法绕过全表内容比较。判断依据是当前持久内容，不提供历史写入审计证明。
- 原始 DB/WAL/SHM 永远保持在 original/，逐文件摘要不变；回滚从该组复制到目标同目录的独立 prepared，checkpoint 后设置 revision=`max(currentRevision, installedRevision)+1`，校验旧业务内容，再归档当前运行集至 rejected/ 并换入旧内容。
- 因回滚要提高 revision，恢复后的在线 DB **不要求与原文件逐字节相同**，原始字节证据仍在 original/。这样可使验收期间客户端缓存失效，重启 API 后仍要求刷新页面。
- 若回滚准备/rename/验证失败，会保留失败文件，并尝试恢复刚才的完整新运行集。回滚成功或失败都不解除维护，不重复执行已成功回滚的 receipt。

## 故障恢复与演练

- 指纹/来源/schema/进程/维护校验失败：保持维护，排除原因后重新 preview 与确认，不尝试 force。
- apply 普通异常：尽力恢复旧原始运行集，保留 failed/ 与 failure.json；rollback 普通异常：尽力恢复其前的新运行集。AggregateError 表示恢复未完成，错误含归档路径，必须维持停服维护并人工核对。
- SIGKILL、断电、多文件组搬移途中崩溃不属于单次 rename 的原子性保证。不要直接重跑或删除目录锁。由运维核对 target/归档/同目录 prepared 文件及 plan.json、receipt.json；按 manifest 中每个 suffix/hash 恢复完整组，禁止混用新 DB 和旧 WAL/SHM。缺少 receipt 的半完成切换不得用正常 rollback 冒充成功。
- 目录锁位于目标旁 `.standards-baseline-cutover.lock`。发生崩溃时保留它；确认无执行进程并核对完整运行集后再人工处理。保留所有归档、失败候选、receipt，不清空整个 data 或归档目录。
- staged、manifest、sources 作为不可变产物交付；归档根目录限制为运维可写。切换时禁止自动重启/新增写者；lsof 检查不是对任意不合作进程的内核写入栅栏。

自动演练仅使用临时目录与合成来源 bytes，不依赖私有 Excel。测试在 import 服务前通过 node:test mock.module 映射两段精确合成来源 bytes 的 SHA256 为批准值；其他全部数据、schema、payload、指纹及篡改后来源仍使用真实 SHA256。SQLite 操作仅针对 fixture；测试 mock root/lsof/systemctl 状态，不向生产 API 暴露测试注入开关：

```sh
node --experimental-test-module-mocks --test test/standard-baseline-cutover.test.js
node server/scripts/standard-baseline-cutover.js --help
```

覆盖来源/manifest篡改、source-records缺失/篡改/超限、全表指纹漂移、进程占用、维护/确认缺失、schema兼容与不兼容、revision溢出、真实遗留WAL/SHM、启动后回滚、新业务拒绝回滚、部分搬移与rename失败恢复。实际服务停止/重启、健康验收和完整业务来源构建需在独立演练环境完成，单元测试不等于生产切换授权。
