# 冬夏标准与批注修复实施计划

**Goal:** 同行展示默认夏季与可选冬季，补齐并纠正可追溯Excel变更。
**Spec:** docs/specs/standard-seasonal-tests-and-comment-repair.md（用户已确认执行）。
**Architecture:** 保持test_standard为夏季常规值，winter_test_standard为可选JSON字段；来源批注不变，历史修复独立preview/apply工具，无通知副作用。
**Tech Stack:** React/TypeScript/Ant Design、Node、SQLite。

## 约束和复核重点
- 留在当前main，只改不提交、不推送、不部署。不改其他模块数据。
- 冬季取消、料号误识日期、来源空关联、同文不同产品、旧版本不能借新参数。
- 源文件hash、行列、完整产品身份与版本必须匹配；副本演练、备份、事务、幂等。

## 任务
- [x] 页面：测试先行；同格太阳/雪花文字、可选冬季输入、详情按需变更、历史完整参数、冬季筛选；CSS Modules。
- [x] 字段与输出：测试先行；模板可选冬季、季节标签、Excel/PDF/企微一致；导入支持显式冬季列，取消历史不自动生效。
- [x] 修复：测试日期块解析与缺失/错误对账；全源批注预览、来源补链、受控纠错、字段补全；在副本验证重复执行零变更。
- [x] 本地应用：核对最终差异与源指纹，SQLite backup后事务应用，源数据与状态复核、无通知，归档报告。
- [x] 验证：专项及全套测试、Lint、构建；检查SP0006-C十条测试变更和两套标准，更新评估文档。
