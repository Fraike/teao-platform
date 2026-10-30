# 实施记录

- 开发分支：codex/product-drawing-management，未提交、未推送、未部署。
- 已完成产品档案、料号归并、金蝶小时同步、包装详情缓存、私有图纸版本、发布/停用/打印、图纸优先页面及标准跳转。
- 打印预览已在真实内置浏览器验收，可显示完整纸面并提供打印按钮；未触发实体打印。验收截图位于docs/previews/product-detail-20261027.png及product-print-20261027.png。
- 隔离测试覆盖重复客户、半成品、未匹配、编码冲突、来源失效、同步并发/网络/磁盘失败、权限撤回、PDF验证、旋转/裁剪/表单批注、客户端缺图及标准链接。
- 实际浏览器发现原生PDF iframe在内置浏览器空白，改为按需加载PDF.js，提供翻页/缩放和弹窗中的独立受控打印预览。
- 独立审查修复：打印保留原页面及批注，不重建页面内容流；网关模板上限30MiB以容纳25MiB文件；无有效来源档案只保留工程历史。
- 详情每60秒及重新聚焦检查最新发布状态；相同版本不重新下载PDF，避免重复渲染。
- 原工作区未跟踪文件保留，不属于本次改动。

## 运行与验收
- 后端须Node24+。本机系统Node25与既有better-sqlite3二进制ABI不匹配，验证使用随Codex运行时附带的Node24.19。
- npm run test:products；npm test；npm run lint；npm run build；npx tsc -p tsconfig.products.json。
- scripts/product-ui-preview.ts是临时数据库/模拟金蝶的本地视觉验收夹具，绑定127.0.0.1:3909和5183，不读取业务数据，不启动定时任务。

## 上线注意（另行确认）
- 在生产环境安装server/package-lock.json锁定的依赖，并确认Node24+。发布包已允许服务端.ts；运行时type-only类型导入会擦除，不依赖src目录。
- 保持DATA_DIR持久化，备份products.db及product-files/整体；不得仅备份数据库。
- 已有备份流程会复制文件并用SQLite在线备份数据库。工程文件不可覆盖，因此发布前备份时需暂停写入，确保元数据与文件属于同一备份时点。
- 服务端启动后，金蝶已有凭据且上次同步超过一小时时自动补同步，之后上海时区每个整点执行；未配置金蝶时本地图纸仍可使用。
- 新增product_drawing_manage权限，需管理员按实际人员授权；不自动给既有工程账号扩权。
- 本次未重启现有3899业务服务，未读写真实金蝶及业务库。尚需在上线前用实际PDF/CAD样本和金蝶凭据验收，确认STB/三维真实扩展名。
- 打印日志记录生成受控打印文件，不代表实体打印机已出纸；纸质图回收仍需现场管理。

## 最终验证
- Node24下 npm test 全量通过；npm run test:products（4组后端行为测试及1组前端行为测试）通过。
- npm run lint无错误或警告；npm run build通过（保留既有大分块体积提示）；tsconfig.products.json后端严格类型检查通过；git diff --check通过。
- PDF.js按需加载，Worker构建为.js，避免生产Nginx缺少.mjs MIME映射导致加载失败。
- 已完成桌面内置浏览器的整页显示、缩放和受控打印弹窗验证；未对实体打印机或真实CAD/PDF文件做生产验收。
