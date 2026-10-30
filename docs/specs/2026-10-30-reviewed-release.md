# 待部署版本验收单（2026-10-30）

## 已完成准备

- 分支 codex/product-drawing-management；尚未提交、推送或部署。
- 前端运行依赖 DOMPurify 更新至 3.4.17；开发工具 Vite 固定 8.1.6、undici 7.30.1、zod 4.6.7。
- 后端 Express 4.22.3，body-parser override 1.20.9、qs override 6.17.1。保持原主版本，不使用 audit fix --force。
- 官方 npm registry 完整审计：根目录和 server 均 0 项已知告警。
- 全量 npm test、lint、前后端类型检查、构建及 diff 检查通过；标签缓存回归 75/75。独立发布安全测试 14/14 通过，独立复查未发现本轮可确认的 P1/P2。

## 只读生产预检

- teao.work 对应已信任服务器 8.134.18.9；SSH 密钥认证成功。
- Node v24.21.0 / Linux x64，npm 11.19.0；系统 make、g++、python3 可用。npm 使用官方 registry。
- teao-api active，严格 health 正常，仅监听 127.0.0.1:3899；nginx -t 通过。
- 磁盘剩余约 24GB，当前持久数据约 43MiB；站点、数据和发布状态目录在同一文件系统；没有遗留维护标记或发布锁。
- DATA_DIR=/var/www/teao-platform/data，持久环境文件0600，必需配置项均存在；未输出或修改凭据/机器人配置。
- standards/production/quotation/feedback 四个运行数据库与最近一次发布备份均 quick_check=ok。现有备份目录完整可见；正式部署仍需生成最新一致性备份。
- 公网 data/server 路径受保护；当前上传20MiB，候选发布脚本将 API location 提高到30MiB以支持25MiB PDF。
- 当前生产尚无 products.db、product-blobs、product-files；活跃管理员1名，专门图纸管理员0名。本次不改账号权限，管理员可先操作，工程人员后续单独授权。

## 发布包及迁移演练

- 白名单发布包169项，只含 dist 静态资源及 server 源码/锁文件；不含本地 src、运行数据库、原图纸、原始Excel、账号、凭据或 node_modules。
- 哈希逐项核验，包含商品图纸模块及 .js PDF Worker。包的运行副本使用已锁定的 Node24 本机依赖，脱离原仓库 src 启动成功：严格 health=200，未登录 products/imports=401。
- 读取线上标准库一致性副本，仅在本地隔离库运行新包初始化：825标准、849版本、2591变更、1264原始Excel批注、809导入来源，原五类业务表已有列内容摘要均未改变；drawing_sources空表正常建立，quick_check=ok。维护标记、空金蝶凭据和禁用通知配置避免演练产生真实外部请求。生产原库未写入。
- 运行副本冒烟不能代替生产Linux依赖安装；正式暂存后须先 npm ci --omit=dev，再检查预检指纹，通过后才进入维护窗口。
- 发布压缩包 `/tmp/teao-platform-reviewed-20261030.tar.gz`，2,013,135字节，SHA-256 `7a03f6b2b0ab80fe4306a46a43286ae652870d9f388dcff91240d34266262fca`。
- 清单及验证日志见 `/tmp/teao-release-package-result-20261030.json`、`/tmp/teao-production-schema-result-20261030-v2.json`、`/tmp/teao-release-final-*20261030*`。

## 本次待确认部署内容

1. 商品资料与详情、系列/分类展示、产品标准关联和跳转恢复。
2. PDF工程图纸上传、发布/停用、下载打印、旋转、主次与客户范围；受限批量协作写接口恢复，普通页面批量入口保持关闭。
3. 分层标签缓存、列表返回定位及高亮、表格高度和性能修复，以及本轮依赖安全修复。
4. 同时更新前端与API；以现有受控脚本在维护窗口内备份线上数据库和私有文件，保留旧代码与失败回滚路径；需要的表/字段由程序增量初始化。

本次不提交或推送Git，不整库同步本地data，不改账号权限、Webhook和日报配置，不随代码包导入图纸。部署完成后先验收健康、身份校验、商品页面、上传/下载权限和既有业务数据，再按用户已授权范围开始横向成品/客户PDF导入；关系不明、历史作废及纵向文件列入待处理，不强行发布。

## 等待最终部署确认

所有本地准备和只读预检已完成。尚未上传暂存包、修改线上配置、停止服务或导入图纸。AGENTS.md要求每次部署前告知内容并取得明确确认；本次部署确认后，才执行暂存、预检指纹、维护备份、发布及验收。

## 后续实际执行

用户回复“部署”后已受控上线，并完成首批20份横向通用成品PDF/166项关联导入。实际归档、备份、验收、一次性复核脚本顺序误报的处理及剩余清单见 `../audits/release-20261030-product-drawings.md`。未执行Git提交或推送，未替换本地数据库到线上。
