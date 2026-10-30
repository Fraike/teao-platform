# 标签页分层缓存（已获用户实施确认）

目标：当前页+最近4页保留完整DOM；其他已适配页保留会话内状态快照并释放重资源。筛选、数据、滚动、分页、展开、表单、弹窗、内部页签在切换/回收后保留。切换不自动刷新业务数据。未适配或写入中的页暂缓回收。关闭/整页刷新清空；关闭有草稿先确认；权限作用域改变清理。PDF最多2解析实例、50MiB文件内容缓存，淘汰不重置页码/缩放/旋转，必要时只重取同一文件。所有缓存仅内存，业务持久化不动。产品标准来源ID高亮。

实现分工与共享接口契约：
- 核心与Host：src/lib/tabPageCache.ts、src/lib/tabPageContext.tsx、src/components/TabPageHost.tsx、src/types/tabPage.ts及相关测试，由核心实施者所有。
- 页面统一导入 src/lib/tabPageContext：useTabState<T>(key:string, initial:T|(()=>T)) 返回标准useState元组；有Host时按页和key保留，无Host时等价useState。
- useTabPage() 返回至少 managed:boolean、active:boolean、restored:boolean、key:string；useTabPageAdapter() 声明此页已完成适配；useTabBusy(busy:boolean) 延缓页回收/关闭；useTabDirty(dirty:boolean) 登记未保存状态；这些钩子无Host时无副作用。
- useTabInitialEffect(key:string,effect:()=>void|(()=>void),deps:readonly unknown[],ready:boolean)：页面已有成功加载的状态且deps语义未变时，Activity恢复/冷恢复不重复初始化；ready=false允许首次未完成加载重试。纯订阅和布局副作用用原useEffect，业务定时刷新在managed模式关闭。
- useTabForm(form, key:string, options?:{dirty?:boolean})：保存Antd Form已填内容到页快照，冷恢复时恢复；首次初始化必须有会话key保护，不能在恢复时用默认值覆盖。dirty显式注册或由hook可靠比较基线。
- 核心Host props由实施者定义并及时报告；需renderPage(location)冻结每个页路由，活动context，内部滚动容器/浮层容器、5页LRU和close guard。

禁止提交/推送/部署/重启，不删除文件（需移到trash_review）。现有分支codex/product-drawing-management，保持不变；保留所有既有改动。

验收：5/10/20混合标签，LRU≤5（写入/未适配暂缓可例外）、冷恢复无状态丢失和无自动刷新、保存中不重复提交、关闭确认与释放、PDF2/50MiB上限、权限清理、346行热切换目标<192ms、回归/lint/类型/build与独立复查。

Ruling: 本次允许Activity原生隐藏/恢复，但组件恢复副作用不得被当作首次初始化；共享hooks提供适配边界。对未审计页暂缓回收是保护，不是最终跳过适配。

阶段验证（2026-10-29）：功能实现及全量 npm test 通过；最新缓存专项 42 项、打印/提醒/标准表单专项 9 项通过；lint、应用/商品服务类型检查及构建通过。独立复查发现的打印弹窗跨分类复用旧快照问题已修复，并新增正常关闭后重开分类 B 的回归。

真实生产构建验收使用独立本地 preview、拦截模拟 API（346 条标准），未修改业务数据。20 个混合标签最终保留 5 个完整页，冷返回无新增标准列表请求；纵向 1800、横向 100 的滚动位置精确恢复，来源行按 ID 高亮，浏览器错误为 0。5/10/20 页、pending read 完成后自动回收、busy/dirty、权限与 PDF 资源上限均有专项覆盖。

性能尚未达到验收目标：最新热返回约 280–300ms，仍高于 192ms 目标。早期仅记录导航后首帧的 4–18ms 数据不代表页面可见，已弃用；最终测量等待目标页 active 且可见后的帧。历史约 640ms 为早期开发环境基线，不能据此直接宣称严格百分比改善。

已审计产品标准页启用 managed-effects 热缓存模式，以避免 Activity 恢复时重连整表布局副作用；其他页面保持 Activity 暂停。该页隐藏时固定尺寸、隔离浮层/焦点/交互、暂停动画、表格测量和提醒计时；无业务自动刷新。快照与 active Context 分离，浮层和冻结路由配置保持引用稳定。冷热恢复和关闭清理仍共用生命周期。

交付边界：只修改代码；未提交、推送、部署或重启原服务。独立验收 preview 使用完停止。性能目标单独标为未通过，不宣称整个验收完成。

补充真实浏览器验证：产品标准新增弹窗在其他标签上不暴露为可访问对话框；经过多标签回收，草稿输入冷恢复一致。打印弹窗取消与生成成功均清本次弹窗快照，新分类不会误用旧行数据。独立验收 preview5199 已停止。
