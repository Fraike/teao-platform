# 生产日报来源切换：服务端实施报告

## 结果

仅完成任务 1；默认维格表，管理员可双向切换，查询/汇总/预览/发送严格使用当前同一来源。切换不发送、不搬动原始记录。没有 commit、push、deploy、真实企微发送、金蝶调用。

## 文件

- `server/config.js`：默认来源、`PRODUCTION_CONFIG_PATH` 隔离、原位置不变、原子替换配置、配置变更订阅；损坏/不可读/无效来源配置显式失败，不回退维格表或覆写文件；只有真正 ENOENT 或合法旧对象缺少来源才采用默认。
- `server/services/report.js`：严格来源实时生成，内部口径/零产量率 null、缺失部门、实际来源文字；原报告结构与维格表汇总口径保留。
- `server/services/production-report-control.js`：共享非排队锁、来源验证/配置绕过禁止、生成/预览/发送、日期去重及持久日志。
- `server/services/wecom.js`：15 秒超时；仅 HTTP 成功且整数 `errcode=0` 才认定成功；明确企微拒绝与网络/HTTP/解析/超时结果不确定区分。
- `server/services/vika.js`：15 秒读取超时信号，超时 `504/VIKA_READ_TIMEOUT`，其它读取失败 `502/VIKA_READ_FAILED`；响应错误不泄露外部响应/凭据。两部门读取使用 `allSettled`，均结束后才释放忙锁。
- `server/services/production-report-scheduler.js`、`server/server.js`：共用发送入口；配置改变立即重建调度，旧回调也读最新配置；上海时区、上一工作日不变。
- `server/routes/production.js`：管理员 `/source`、脱敏配置、实时报告/预览、409 人工重复确认协议。
- 新增 `test/production-report-source.test.js`、`test/production-report-routes.test.js`、`test/production-wecom-timeout.test.js`、`test/production-vika-timeout.test.js`、`test/production-config-read.test.js`。
- 旧 `test/production-entry.test.js` 仅增加临时配置路径与显式 `internal`；保留原有商品关联测试/改动。

未修改 `package.json`、页面、部署配置或上一轮生产商品关联逻辑。

## 协议和日志

- 锁忙：409，`code=PRODUCTION_BUSY`；不排队，避免排队操作在来源改变后使用意外来源。
- 人工重复：409，`code=REPEAT_CONFIRMATION_REQUIRED`；只有布尔值 `confirmRepeat:true` 可覆盖已发送/待核查记录。
- 发送成功：`status=sent`；自动跳过：`skipped_duplicate`、`skipped_uncertain`、`skipped_empty`。
- 明确拒绝：502，`SEND_REJECTED`，允许重试；不确定：502，`SEND_RESULT_UNCERTAIN`，不得自动重试。
- 新表 `production_report_operations`：动作、旧/新来源、操作人、状态、时间、错误码。
- 新表 `production_report_sends`：日报日期、来源、人工/自动、操作人、SHA256 内容摘要、状态、时间、错误码。不写凭据/完整企微响应。
- 表结构可增量补可选日志列；不迁移、不改写两张原始生产记录表。
- 在请求企微前持久化 `pending`；成功更新 `sent`，明确拒绝 `rejected`，不确定 `unknown`。跨来源/跨重启按日期拦截；全新 Node 子进程测试证明遗留 pending 无外部请求也能识别。
- `enabled` 控制自动调度启停；停用自动推送后仍可人工汇总、预览、明确人工发送，便于安全核对来源。
- 配置不可读：`503/PRODUCTION_CONFIG_READ_FAILED`，API 返回脱敏 JSON；cron 回调拒绝发送，调度重建失败保持停止状态，不静默回退维格表。

## TDD 红绿证据

Node 版本：`v24.19.0`；可执行文件 `/Users/mikewang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。

先写测试再实现，已观察并修复这些预期失败：

1. 来源默认：`旧配置无来源必须默认vika`，实际 `undefined`，预期 `vika`，exit 1。
2. 管理员来源接口：实际 HTTP 404，预期 200，exit 1。
3. 消息实际来源标记：空预览缺少 `内部平台`，exit 1。
4. 日志前后来源：`target_source` 实际 `undefined`，预期 `internal`，exit 1。
5. 停用自动推送仍可人工预览：实际 500，预期 200，exit 1。
6. 配置损坏显式失败：`Missing expected exception: 不可读配置不得回退默认vika`，exit 1。
7. 维格表超时信号：`Vika读取必须绑定明确超时signal` 失败，期望 `VIKA_READ_TIMEOUT`，exit 1。

修复后以下命令均 exit 0（`NODE24` 指上述可执行文件）：

```sh
NODE24 test/production-report-source.test.js
# Production report source/control tests passed (isolated DB/config; all fetch mocked).
NODE24 test/production-report-routes.test.js
# [auth] default admin created (production credentials)
# [production] cron: 2026-09-14 sent
# [production] cron: PRODUCTION_CONFIG_READ_FAILED
# [production] cron disabled: PRODUCTION_CONFIG_READ_FAILED
# Production report routes/scheduler tests passed (HTTP loopback; isolated state; mocked delivery).
NODE24 test/production-wecom-timeout.test.js
# Production WeCom timeout test passed (15-second AbortSignal; mocked fetch only).
NODE24 test/production-vika-timeout.test.js
# Production Vika timeout test passed (15-second mock abort releases busy; internal switch succeeds).
NODE24 test/production-config-read.test.js
# Production config read tests passed (corrupt/unreadable preserved; missing/legacy defaults only).
NODE24 test/production-entry.test.js
# Production store tests passed.
NODE24 --check server/services/production-report-control.js
NODE24 --check server/services/production-report-scheduler.js
git diff --check
# 无输出
```

覆盖默认/持久化/双向切换/非法配置/权限/绕过、严格来源/空部门/补录后实时生成、内部率/零产量、重复及并发发送/发送期间切换、明确拒绝/网络/畸形响应/HTTP 不确定/15 秒真实超时信号、关闭数据库及全新 Node 进程 pending 恢复、调度变更/最新休息日/禁用自动推送；JSON 损坏/非对象/无效来源/模拟 EACCES 均保留文件并显式失败，合法旧对象和缺失文件兼容；配置失败 API 仍为 JSON，cron 拒启/拒发；维格表两部门 15 秒 mock 超时均结束后，忙锁释放，管理员可切内部来源。

以上全部使用系统临时目录的数据库/配置和 mock fetch；HTTP 仅 loopback，测试中的 cron `sent` 是 mock 返回，非真实企微发送。新增测试未加进 package.json，任务 3 必须显式运行它们并执行全量 lint/test/build。

## 风险与约束

- 共享锁是单 Node 进程的模块级锁，适用于当前 systemd 单实例；不保证多进程/多实例分布式排他。扩展实例前应增加持久事务预留或分布式锁，避免两个实例同时通过去重检查。
- 企业微信不提供本地可用幂等确认；网络失败无法证明未送达，因此优先防止误重复，不自动恢复重试。未知记录在人工确认重发成功后仍保留历史 unknown，自动入口继续保守标记待核查，不静默清除历史不确定证据。
- 维格表读取已限制 15 秒，读取超时后锁释放，可切内部来源；现有最多 500 条的分页口径未扩展，后续数据量超过单页时仍需专项处理。
- 未做线上验收；不读取/同步/修复线上生产数据。任务 3 的独立复审、页面临时环境和全量检查由主任务继续完成。

## Fix round 1：独立复审修复

仅修改 `server/config.js`、`server/services/production-report-control.js`、`server/services/report.js` 及对应测试。

1. 配置权限：缺失配置创建强制 `0600`；原子写使用唯一 `.tmp`、独占创建，并在写入内容前设定权限。最终权限取 `0600 & 原权限`，保留更严格原 owner 权限（测试 `0400`）；失败遗留临时文件同样 `0600`，不覆盖既有临时文件。
2. 失败来源不变：来源和普通配置更新先验证为待提交值，成功日志 UPDATE 完成后才同步落盘；日志更新与落盘之间无 `await`，全程持有 busy。日志失败根本不会提交配置，不需要先改变来源再回滚；配置 rename 失败则原文件保持不变，并将预完成日志补偿为 failed，补偿在 busy 释放前完成。补偿日志自身失败不遮盖原始失败。已提交后的通知失败只记脱敏告警，避免以失败响应伪报已完成的切换。
3. 历史汇总保留：实时汇总改写 `production-reports/source-cache/{dataSource}/{date}.json`，两级 cache 目录 `0700`、文件 `0600`；原 `production-reports/{date}.json` 不写、不删、不改权限。接口仍实时生成，不读取这个缓存替代实时数据。

红阶段已实际观察：

- 权限测试：`420 !== 384`（实际 `0644`，预期 `0600`），exit 1。
- SQLite BEFORE UPDATE 触发器故障：切换接口拒绝后旧配置 bytes 内 `vika` 已被改成 `internal`，exit 1。
- 历史文件测试：`实时生成不得覆盖旧日期汇总`，原字节被新空报告覆盖，exit 1。

绿阶段以下均 exit 0，仍为临时状态及 mock，无真实外部调用：

```sh
NODE24 test/production-config-write.test.js
# Production config permission tests passed (umask022; original0600/0400; failed temporary0600).
NODE24 test/production-config-commit.test.js
# [production] configuration committed; notification failed
# Production config commit tests passed (SQLite success-log fault; both source directions/config updates unchanged; notifications postcommit).
NODE24 test/production-report-source.test.js
# Production report source/control tests passed (isolated DB/config; all fetch mocked).
NODE24 test/production-config-read.test.js
# Production config read tests passed (corrupt/unreadable preserved; missing/legacy defaults only).
NODE24 test/production-report-routes.test.js
# Production report routes/scheduler tests passed (HTTP loopback; isolated state; mocked delivery).
NODE24 test/production-entry.test.js
# Production store tests passed.
git diff --check
# 无输出
```

新增 `test/production-config-write.test.js`、`test/production-config-commit.test.js`；source 测试增加预置旧汇总字节/模式保留、两来源新缓存隔离/权限验证。覆盖两个来源方向、同源普通配置更新在持久日志故障下原 bytes 与调度通知不变，以及 rename 故障日志补偿。仍无 commit/push/deploy/线上数据改写。

文件与 SQLite 跨介质没有共同的崩溃原子事务：若进程恰在日志成功后、配置 rename 前异常终止，操作日志可能为 success，而配置仍为旧值。此处请求层通过同步排序确保失败响应不改变来源，重启后以持久配置为唯一来源，不按操作日志自动改变来源或发送。
