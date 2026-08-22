import type { User } from "../types/auth";

export type NavigationIcon = "app" | "shop" | "file" | "global" | "calculator" | "chart" | "tool" | "team" | "read" | "database" | "setting";

export interface NavigationItem {
  key: string;
  title: string;
  description: string;
  category: string;
  group: string;
  permission?: string;
  adminOnly?: boolean;
  icon: NavigationIcon;
  color: string;
  menu: boolean;
  dashboard: boolean;
  match?: RegExp;
}

export interface NavigationGroup {
  key: string;
  title: string;
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  { key: "business", title: "业务部" },
  { key: "production", title: "装配部" },
  { key: "injection", title: "注塑部" },
  { key: "hr", title: "人事" },
  { key: "tools", title: "公共工具" },
  { key: "basic-data", title: "基础资料" },
];

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: "/", title: "首页", description: "系统功能总览", category: "首页", group: "home", icon: "app", color: "#1677ff", menu: true, dashboard: false },
  { key: "/quotation", title: "国内报价", description: "生成国内客户报价单并导出 PDF", category: "业务系统", group: "business", permission: "business", icon: "file", color: "#1677ff", menu: true, dashboard: true },
  { key: "/quotation-intl", title: "国际报价", description: "海外客户英文报价与贸易条款", category: "业务系统", group: "business", permission: "business", icon: "global", color: "#722ed1", menu: true, dashboard: true },
  { key: "/quotation-management", title: "报价管理", description: "查看、复制和管理历史报价", category: "业务系统", group: "business", permission: "business", icon: "file", color: "#13c2c2", menu: true, dashboard: true },
  { key: "/cost", title: "成本计算", description: "材料、工序、包装与利润分析", category: "业务系统", group: "business", permission: "business", icon: "calculator", color: "#52c41a", menu: true, dashboard: true },
  { key: "/production-report", title: "生产日报汇总", description: "装配部、注塑部生产数据汇总", category: "生产管理", group: "production", permission: "production", icon: "chart", color: "#13c2c2", menu: true, dashboard: true },
  { key: "/production-entry", title: "装配部生产日报录入", description: "装配部生产日报录入与导入", category: "生产管理", group: "production", permission: "production", icon: "tool", color: "#1677ff", menu: true, dashboard: true },
  { key: "/production-entry-injection", title: "注塑部生产日报录入", description: "注塑部生产日报录入与导入", category: "生产管理", group: "injection", permission: "production", icon: "tool", color: "#722ed1", menu: true, dashboard: true },
  { key: "/employees", title: "员工管理", description: "员工档案与合同管理", category: "人事管理", group: "hr", permission: "hr", icon: "team", color: "#eb2f96", menu: true, dashboard: true },
  { key: "/process", title: "技术资料（流程查阅）", description: "查看已录入的 12 个关键流程", category: "工具", group: "tools", permission: "tools", icon: "read", color: "#fa8c16", menu: true, dashboard: true },
  { key: "/materials", title: "商品资料", description: "金蝶商品资料查询", category: "基础资料", group: "basic-data", permission: "basic_data", icon: "database", color: "#2f54eb", menu: true, dashboard: true },
  { key: "/materials/:id", title: "商品详情", description: "商品资料详情", category: "基础资料", group: "basic-data", permission: "basic_data", icon: "database", color: "#2f54eb", menu: false, dashboard: false, match: /^\/materials\/[^/]+$/ },
  { key: "/customers", title: "客户资料", description: "客户信息查询", category: "基础资料", group: "basic-data", permission: "basic_data", icon: "database", color: "#531dab", menu: true, dashboard: true },
  { key: "/suppliers", title: "供应商资料", description: "供应商信息查询", category: "基础资料", group: "basic-data", permission: "basic_data", icon: "database", color: "#08979c", menu: true, dashboard: true },
  { key: "/customer-products", title: "客户商品资料", description: "客户与商品对应资料", category: "基础资料", group: "basic-data", permission: "basic_data", icon: "database", color: "#597ef7", menu: true, dashboard: true },
  { key: "/admin", title: "用户管理", description: "账号审核、权限和密码管理", category: "系统管理", group: "system", adminOnly: true, icon: "setting", color: "#faad14", menu: false, dashboard: true },
];

export const DASHBOARD_CATEGORY_ORDER = ["人事管理", "业务系统", "生产管理", "工具", "基础资料", "系统管理"];
export function canAccessNavigationItem(item: NavigationItem, user: User | null): boolean { return !!user && (!item.adminOnly || user.role === "admin") && (!item.permission || user.role === "admin" || user.permissions.includes(item.permission)); }
export function getNavigationItem(pathname: string): NavigationItem | undefined { return NAVIGATION_ITEMS.find((item) => item.key === pathname || item.match?.test(pathname)); }
export function getVisibleNavigationItems(user: User | null): NavigationItem[] { return NAVIGATION_ITEMS.filter((item) => item.dashboard && canAccessNavigationItem(item, user)); }
export function getVisibleMenuItems(user: User | null): NavigationItem[] { return NAVIGATION_ITEMS.filter((item) => item.menu && canAccessNavigationItem(item, user)); }
