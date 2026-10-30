import type { UserPermissionSection } from "../types/userPermissions";

export const USER_PERMISSION_SECTIONS: UserPermissionSection[] = [
  {
    key: "pages", title: "页面访问与使用", description: "开放模块入口及该模块的日常功能。",
    permissions: [
      { key: "business", label: "业务部", description: "国内 / 国际报价、报价管理、成本计算，包含报价维护。" },
      { key: "production", label: "生产管理", description: "装配与注塑日报录入、修改、导出及生产汇总。" },
      { key: "hr", label: "人事管理", description: "员工资料查看、录入与维护。" },
      { key: "tools", label: "公共工具", description: "技术资料与生产流程查阅。" },
      { key: "basic_data", label: "基础资料", description: "商品、客户、供应商与客户商品资料查询。" },
    ],
  },
  {
    key: "actions", title: "页面内操作", description: "单独授权需要额外开放的操作。",
    permissions: [
      { key: "production_import", label: "生产日报导入", description: "导入 Excel 并全量覆盖日报数据，需先开通生产管理。", requires: "production" },
      { key: "product_drawing_manage", label: "商品图纸管理", description: "上传、确认后直接发布和停用商品图纸，无需审核。" },
      { key: "engineering_submit", label: "产品标准提交审核", description: "新增、复制、修改标准草稿，并选择审核人提交。" },
      { key: "engineering_retire", label: "直接停用产品标准", description: "直接停用已发布标准，并可被指定审核停用申请。" },
      { key: "engineering_review", label: "标准审核管理", description: "查看工作版本及审核旧待审记录。新申请仅由指定审核人处理。" },
    ],
  },
];

export function summarizeUserPermissions(permissions: string[]) {
  return USER_PERMISSION_SECTIONS.map(section => ({
    key: section.key,
    labels: section.permissions.filter(permission => permissions.includes(permission.key)).map(permission => permission.label),
  }));
}
