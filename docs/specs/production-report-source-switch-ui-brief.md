# 任务2：生产日报汇总数据源切换页面

工作区 /Users/mikewang/AI_Workspace/teao-platform/.worktrees/production-daily-product-linking。保留全部上一轮未提交改动。禁止commit、push、部署、真实企微发送，禁止派生代理。使用apply_patch；测试先红后绿；Types集中src/types；命名导出；新增CSS Module，无新增inline style。

仅修改前端页面 ProductionReportPage.tsx、新CSS Module、新src/types生产汇总类型/共享helper、必要的src/lib/api.ts兼容可选错误code、前端测试。不要改server、package.json、其它生产录入页面。

## 接口

GET /api/production/config：dataSource:'vika'|'internal'、hasWebhook、configured按来源计算，以及旧脱敏字段。POST /api/production/source仅管理员，body {dataSource}，成功 {ok:true,dataSource}，忙409 code PRODUCTION_BUSY，失败来源不变。

GET /api/production/report?date：实时生成 {exists:true,date,dataSource,generatedAt,missingDepartments:('assembly'|'injection')[],assembly:{records,summary,rawCount},injection:{records,summary,rawCount}}，沿用旧records与summary字段，内部summary合格率/达成率可null。

POST /preview?date body{}返回content、hasData、dataSource、generatedAt、missingDepartments，不发送。POST /send?date body{confirmRepeat?:boolean} 返回status:'sent'及message。重复人工409 code REPEAT_CONFIRMATION_REQUIRED；unknown502 code SEND_RESULT_UNCERTAIN；忙409 PRODUCTION_BUSY。仅重复确认错误允许用户确认后重发；其它错误不自动重试。ApiError当前丢code，可增加兼容可选code字段，构造器第三参数可选并在request保留data.code。

## UI

顶部标题“生产日报汇总”，Tag显示“当前数据来源：维格表/内部平台”，管理员button精确文本“切换到内部平台”/“切回维格表”；普通用户只看当前来源。获取来源失败不能猜默认值，禁用切换，提供刷新配置重试。

切换确认modal说明统一影响页面汇总、预览、手动/定时推送，不迁移/删除/覆盖记录，不自动发送。确认button“确认切换”，取消“取消”。成功立即清空report并按当前日期重新获取；失败保留原report/source；请求竞态不能把旧日期/来源结果覆盖回来。期间禁用重复按钮，已有操作忙时不可切换。source服务端持久保存，页面reload后显示真实来源。

首次/刷新只发一次GET report，取消旧POST fetch再GET流程；配置与报告状态区分，所有请求有序列/取消处理，过期结果/错误不影响新页面。普通用户权限来自useAuthStore.user.role。

增加“消息预览”button，modal原样显示markdown文本可滚动，源与日期明确；preview打开/关闭期间防竞态；切换清除旧预览。关闭button“关闭”。没有记录明确标记，零率显示 — 不拼出—%。现有数据表结构与样式尽量保留，新改header将原inline改CSS Module，未动旧样式无需大范围重构。

重复send只针对code REPEAT_CONFIRMATION_REQUIRED，modal提醒可能已经发送请先核查，按钮“确认重发”“取消”，确认重试confirmRepeat:true，不自动发送。日期/来源变动后不能重发已过期modal的旧请求。发送成功不再弹第二次确认；unknown展示服务端错误，勿自动重试。

## Tests

新增 test/production-report-ui.test.ts，验证来源按钮/普通用户权限、null率格式、ApiError code（确保不会把busy/unknown当repeat）、请求竞态旧结果不能恢复、确认操作引用正确日期/来源。避免仅用源码字符串测试，尽量纯共享行为函数/状态coordinator测试。先验证红再实现。Node24下跑新test、lint/build。

报告写 docs/specs/production-report-source-switch-ui-report.md，包含实际文件和验证命令、红绿证据、剩余风险。最后返回简短状态。
