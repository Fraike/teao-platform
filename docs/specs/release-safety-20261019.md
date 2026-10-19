# 发布保护与受控卫浴迁移（2026-10-19）

本次已授权实现，不执行 SSH、提交、发布或真实数据迁移。只修改发布 workflow、新 release/sanitary 脚本及其测试。

## 发布方案

1. 手动 workflow_dispatch 构建、测试，严格白名单打包 dist 与 server 源码，包内无运行数据、配置、环境文件和 node_modules。
2. 整包上传 staging，不改在线文件；服务端 release CLI 默认只读预检，显式 --apply 后持有独占锁。
3. 保留 /var/www/teao-platform 与其 data；nginx 维护标记阻止请求，API 停止后用 SQLite 原生 backup API 备份所有数据库，复制其他运行文件及持久配置。
4. 检查依赖、语法、nginx 配置；在维护窗口中按顶层文件移动旧代码到备份并放入新代码；失败自动回移原代码、恢复配置并检查服务。新 API 已启动过时，在仍未开放流量的窗口内同时恢复启动前数据快照，失败运行数据完整保留供审阅。全程不直接删除文件。已经开放流量后的单独回滚只回滚代码，不覆盖新增业务数据；数据恢复须独立审阅。
5. nginx 显式 20m、真实 IP 及 600 秒代理超时；阻止 /server、/server/、/data、/data/ 与点文件下载，允许正常 .well-known。只处理 root 精确匹配本站且仅有一个 server 块的目标文件，拒绝 include/alias、未审核的正则/优先 location 等危险布局，不猜测正式域名。配置文件 /etc/teao-platform/teao-api.env 保留且必须为0600或更严格；STANDARD_REVIEW_REMINDERS_ENABLED 必须由运维明确设 true/false，首次建议 false。
6. 新版本以本机 GET /api/health 的HTTP200与 JSON `{ok:true,service:'teao-api'}` 严格验收，不能降级。改nginx/停旧服务之前先检查旧服务active并将baseline探针持久化到state.json：优先严格health，仅明确HTTP404允许改用预定义GET /api/auth/me，且必须HTTP401及JSON `{error:'未登录'}`。网络错误、重定向、500、非JSON或错误标记均中止，不临时寻找替代探针。自动恢复及手动回滚只执行持久化baseline对应的固定探针并检查active；不能在恢复时重新选择。历史state缺baseline或类型未知，在回滚preview之前就拒绝。维护期间本机端口不经过nginx。恢复检查失败则保留维护标记、锁与 journal，禁止直接再次发布覆盖状态。成功后仍保留新旧代码、备份及运行环境快照，不自动清理。

## 卫浴迁移方案及数据契约

独立 CLI 接收 --payload、--xls、--data-dir；默认只读 standards.db，不调用 initDB。JSON 契约见文末补充。必须核对原 XLS SHA256；45 个唯一 SP 编码、25 盖/20 座、六个指定型号及来源说明、50 条产品批注。停用旧记录只能使用完整 70 条白名单、确切旧来源 hash/sheet、v1/rev1/published 且无修订。预览输出内容与数据库状态的 fingerprint，--apply 必须带 --confirm 同一 fingerprint。复用 confirmStandardImport 第五参数的事务备份/停用；保留所有历史，不改其他产品，不调用通知。

## 验证范围

本地临时目录：WAL SQLite 一致性备份、发布切换故障回滚、包内无 data/secret、来源/白名单拒绝、迁移幂等及事务回滚。测试不启动真实服务。线上 nginx/systemd/权限/磁盘/备份恢复须上线前单独验证。

## 运维预检前提（本轮未执行）

- `/usr/bin/node` 为 Node 24，已存在 `teao-api` systemd unit，API仅监听127.0.0.1:3899；nginx的有效配置文件确为 `/etc/nginx/sites-available/teao-platform` 且被启用。发布不会创建猜测的server块、变更其他站点或配置TLS。
- 保持原 `/var/www/teao-platform` 及 `/var/www/teao-platform/data` 路径。DATA_DIR可在站点外；但site、DATA_DIR与release状态目录必须处于同一文件系统以确保重命名回移。预检会拒绝路径重叠、符号链接绕过和跨文件系统布局。
- 持久env必须有 `JWT_SECRET`、`DATA_DIR`、`KINGDEE_CLIENT_ID`、`KINGDEE_CLIENT_SECRET`、`INITIAL_ADMIN_PASSWORD`、`ADMIN_RECOVERY_CODE`、显式 `STANDARD_REVIEW_REMINDERS_ENABLED=true|false`。脚本只检查，不打印或重写值。
- 必须先独立审核准备 `PRODUCTION_CONFIG_PATH=<DATA_DIR内现有生产配置>`；原配置若仅在 `server/production-config.json`，本次不会猜测迁移，应由运维另行确认复制并更新持久env。数据库覆盖路径也必须在DATA_DIR内。不能因部署而切到默认配置。
- 维护标记位于 `/var/lib/teao-platform/releases/maintenance`，nginx用户必须能遍历其上级目录；状态快照子目录0700。在线请求已在读写中的完成由systemctl stop完成前的连接排空/终止处理；停机后再备份，其他离线写入程序必须停用。
- 发布/回滚从 `nginx -T` 识别worker用户，并以 `runuser -u <用户> -- test -r <维护标记>` 验证真实读取权限；无法识别用户或权限不通就拒绝继续。服务器需提供runuser。nginx -T输出只在进程内检查，不打印配置。
- 生产scheduler、催审reminders与publication outbox tick在维护标记存在时跳过，避免新版本health验收前发群、失败恢复数据库后重复发送。发布预检要求持久env中的 `TEAO_RELEASE_MAINTENANCE_FILE`（省略或空值时默认 `/var/lib/teao-platform/releases/maintenance`）与 `path.join(stateRoot,'maintenance')` **字符串完全相等**，不接受不同路径或含`./`的替代写法。自定义stateRoot的隔离fixture必须同步设置此env；生产不提供跳过校验的开关。workers行为由主线程负责测试。
- 同时保留完整数据快照、新旧代码、失败运行数据需要充足磁盘空间。运维先核对磁盘余量和可恢复性；备份中包含users/config和整库standards/outbox、feedback，不仅主表。不存在的SQLite库不会提前创建。
- `.github/workflows/deploy.yml` 只允许手动workflow_dispatch并输入 `release`，共享concurrency不取消进行中发布；建议在production environment配置人工审批。构建与测试通过后才上传完整包并执行发布。当前只修改workflow，不触发它。
- 包内保留 `server/data/employees-seed.json` 与 `standard-source-decisions.json` 两个应用静态种子/来源规则；不含运行时DATA_DIR、SQLite、users、production-config、env、node_modules。不能整库同步本地data。
- 自动失败恢复使用原生SQLite backup生成独立快照；不复制运行中.db/WAL。Env始终沿用原持久文件，已备份但不回写。单独回滚仅允许当前最新release，且在线代码须匹配其原始清单。
- nginx安全配置一旦已通过校验并加载，代码回滚也继续保留20m/IP/超时与下载deny保护，不退回可能公开server/data的旧配置。原nginx文件保留为nginx.before供审阅；只有新配置尚未通过验证时才恢复原文件。

## 新表JSON最终契约

前端“导出迁移预览JSON”输出：

```json
{
  "format": "teao-sanitary-migration-v1",
  "sourceHash": "78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f",
  "sourceSheet": "原始智能卫浴工作表名",
  "records": []
}
```

records必须是浏览器原始解析预览的完整45条（此处空数组只表示结构），也支持仅records数组。每条包含serialNo、categoryKey、standardType、customer、model、customerPartNo、sourceHash、sourceSheet、sourceRow、fields及comments。comments保留fieldKey/fieldLabel/author/text/cell/changedAt；不改名为sourceComments，不含token、用户或DB。skip45也可导出。

CLI不依赖前端TS或xlsx库。核对原件hash证明原件身份，不能代替对JSON字段与原表的复核；必须使用受控解析导出并人工审阅fingerprint对应内容，不能伪造sourceHash给目标库数据背书。

## 旧70条来源白名单

新增 `server/scripts/sanitary-whitelist.js`，只接受**旧hash原始XLS＋该原表解析导出的70条records**，不接受data-dir、不连接目标库、不从当前数据库生成白名单。records必须保留旧sourceHash、确切sourceSheet、sourceRow及原始fields键顺序；输出70项 `{serialNo,customer,model,sourceRow,fieldsSha256}`。hash计算为 `SHA256(JSON.stringify(fields))`。如果与生产旧版本fields原始TEXT不一致，会拒绝迁移，必须回查来源；禁止用生产未知值重生成白名单来绕过拒绝。

```sh
# 默认只读展示完整名单与fingerprint；--output此时不写文件
node server/scripts/sanitary-whitelist.js --payload /review/old-records.json --xls /review/old-source.xls --output /review/legacy-whitelist.json
# 人工核验后添加 --apply --confirm <上述fingerprint>，只以wx写新文件
```

白名单文件结构：`{sourceHash:<旧hash>,sourceSheet:'客户阻力值标准一览表（智能卫浴）',records:[...70项]}`。目标库无旧配对时不需要此文件；存在旧70配对时必须提供。任何数量/来源/sheet/字段/版本/状态偏差都整批拒绝；已完成迁移的70条必须仍为obsolete/rev2且有确切停用历史，新45条的字段及50条批注也必须一致，重复执行才返回unchanged。

## 预览与执行入口

以下仅为将来运维审核步骤，本轮未运行：

```sh
# 本地构建完成后，打包到不存在的新目录（无业务data）
node server/scripts/release-package.js /path/to/repo /staging/new-release
# 服务端默认预检；返回fingerprint，只有显式--apply --confirm才执行
node /staging/new-release/server/scripts/release-deploy.js --stage /staging/new-release
# 独立回滚也默认预览，且需自己的--apply --confirm
node /staging/new-release/server/scripts/release-deploy.js --rollback /var/lib/teao-platform/releases/RELEASE_ID/state.json

# 卫浴迁移先只读预览
node server/scripts/sanitary-migrate.js --payload /review/new-records.json --xls /review/new-source.xls --data-dir /var/www/teao-platform/data --legacy-whitelist /review/legacy-whitelist.json
```

迁移apply需由运维先启用并现场验证nginx维护标记、停止teao-api及其他写入者，再添加 `--apply --confirm <fingerprint>`。迁移持有与发布相同的锁；不调用initDB、不启动服务、不群发；使用confirmStandardImport的第五参数完成事务与原生一致性备份。迁移不自动解除维护或启动服务，运维核对输出、quick_check及其他产品后再现场启动并验收 `/api/health`。真实20m多图上传、真实IP、长群发送超时及恢复过程需现场确认。

迁移先留下prepared报告，成功另写`.completed`报告；若报告失败但事务已提交会明确报出，重新只读预览可核对幂等状态。进程被终止时保留锁/维护窗口，按state.json逐项核对文件实际位置，不直接重跑或删除锁。单独回滚遇到schema不兼容应保留维护并独立审阅数据恢复；不能覆盖发布后新业务数据。

## 本轮验证命令

使用 `/tmp/node-v24.14.0-darwin-arm64/bin/node --test test/release-safety.test.js test/sanitary-migration-cli.test.js`，覆盖17项（含子测试）；workflow两段shell由测试提取并执行 `bash -n`。另执行新脚本node --check、既有标准导入/停用回归。测试使用临时库与替身命令，不启动真实服务、不访问真实data、不执行SSH。

P1复审补充：新增四类baseline回归（首次发布失败恢复旧HEAD、成功发布后手动回滚、新readiness严格失败、旧探针异常）；同时覆盖缺baseline的历史state在preview前拒绝。两份新测试现共21项（含子测试），加既有标准导入/停用回归共23项。
