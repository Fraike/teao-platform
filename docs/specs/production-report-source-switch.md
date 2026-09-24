# 生产日报数据源切换实施记录

## 确认方案

默认 dataSource=vika，管理员确认后可切到 internal，并支持切回。汇总、查询、预览、手动与定时发送使用同一全局来源，不混合。切换不发送、不搬动原始记录。旧配置缺少来源时默认 vika。

维格表模式保留原汇总口径，内部模式使用日报录入口径；零产量显示 —。单部门缺失明确标记，两部门均无记录时不自动发送。预览与发送重新生成，不读旧缓存。自动按日报日期去重，手动重复需要确认，不确定结果待核查。

## 任务 1：服务端

范围：server/config.js、services/report.js、services/wecom.js、新共享发送控制服务、routes/production.js、server/server.js，及服务端测试。不得修改页面文件、package.json 或上一轮商品关联逻辑。不得提交、推送、部署、发送真实企微消息。所有测试仅用临时数据库、配置、HTTP mock。

接口约定：GET /api/production/config 返回 dataSource、hasWebhook、configured（按来源）、原有脱敏字段；POST /api/production/source，仅管理员，body {dataSource}，成功 {ok:true,dataSource}。失败来源不变；非法来源400，忙409。普通配置更新禁止绕过来源切换接口。

GET /report、POST /fetch、POST /preview 从当前来源实时生成。GET /report 保留 exists:true 及原报告结构（空报告也存在），增加 dataSource、generatedAt、missingDepartments。POST /send body {confirmRepeat?:boolean}。重复手动发送409，JSON {code:'REPEAT_CONFIRMATION_REQUIRED',error:...}；成功或自动去重返回清晰状态。POST /preview 返回 content、hasData 与来源，不发送。

服务端来源变化、汇总和发送必须有共享防并发机制。切换在操作忙时409；来源在单个操作中固定。操作日志与发送日志增量持久化，不改写生产记录。发送日期去重跨重启、跨来源；不确定状态不自动重试。企业微信 fetch 使用明确超时，失败分清明确拒绝与结果不确定，防止误报成功。网络测试只能 stub fetch，不能读取真实凭据或联网发送。

定时任务使用共享发送入口。配置变更立即重建调度，回调读最新配置，沿用上海时区/上一工作日。旧配置持久化位置不变；增加测试可隔离配置路径（PRODUCTION_CONFIG_PATH），生产无设置时仍原位置。维格表缺少配置则拒绝切换；内部只验证数据库及两张记录表可读，不要求有记录。不调用金蝶。

TDD：先写测试并验证预期失败，再实现。覆盖默认/持久化/双向切换/忙/权限/来源绕过、严格来源与空部门、旧缓存补录、内部率/零产量、重复与并发发送、失败/不确定/重启恢复、cron配置更新。旧 production-entry 测试应显式选 internal，以适应新默认。使用 Node24 验证。

## 任务 2：页面

范围：ProductionReportPage、CSS Module、新类型/辅助逻辑及前端测试，必要时为 ApiError 增加兼容可选 code 字段。顶部显示来源，管理员确认按钮，成功清空重载、失败保留；请求竞态不得把旧来源/日期内容显示回来。普通用户只看来源，所有状态服务端为准。仅 REPEAT_CONFIRMATION_REQUIRED 的409弹确认后重试 confirmRepeat:true；忙/未知结果不能误触发自动重试。现有按钮/数据字段兼容。新代码无 inline style。切换不触发发送。首次和刷新均只发一次 GET /report，不再POST fetch再GET造成重复汇总；配置获取失败时按钮禁用，不以猜测的来源切换。补充消息预览按钮（现有服务端已有preview），方便核对来源和内容。

## 任务 3：验收

全量 Node24 lint/test/build、git diff --check、独立代码复审、临时环境实际页面切换验证。不得改线上数据；不得 commit/push/deploy。保留全部已有改动。

## 预检

|任务|接口关联|结果|
|服务端与页面|dataSource、source、send确认协议|按上述接口锁定|
|服务端|默认vika与旧local-first测试|测试显式internal，生产新默认符合确认方案|
|页面|实时report与原force两次请求|页面改为一次GET，避免重复汇总|
|验收|既有未提交商品关联改动|保留，不覆盖，不提交|

进度：任务1服务端实现与独立复审完成（round1重要项已闭环）；任务2页面实现及浏览器验收通过；任务3全量检查通过、最终代码复审进行中。全部改动保留未提交。

实施补充：enabled 控制定时推送启停，不阻止手动汇总/预览；否则暂停自动任务后无法核对切换结果。不会自动发送任何消息。
