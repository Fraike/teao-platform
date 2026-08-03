import { useState, useEffect, Suspense, lazy, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { App as AntApp, Layout, Menu, Typography, Button, Dropdown, Tabs } from "antd";
import {
  HomeOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  ShopOutlined,
  ToolOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useIsMobile } from "./lib/useIsMobile";
import { AuthGuard } from "./components/AuthGuard";
import { useAuthStore } from "./lib/authStore";
import { useTabStore } from "./lib/tabStore";
import "./components/PageLoader.css";

// ---- public pages (no header) ----
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));

// ---- protected pages ----
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const QuotationPage = lazy(() => import("./pages/QuotationPage"));
const QuotationPageIntl = lazy(() => import("./pages/QuotationPageIntl"));
const QuotationManagementPage = lazy(() => import("./pages/QuotationManagementPage"));
const CostCalculatorPage = lazy(() => import("./pages/CostCalculatorPage"));
const ProcessCenter = lazy(() => import("./pages/ProcessCenter"));
const ProductionReportPage = lazy(() => import("./pages/ProductionReportPage").then((m) => ({ default: m.ProductionReportPage })));
const ProductionEntryPage = lazy(() => import("./pages/ProductionEntryPage").then((m) => ({ default: m.ProductionEntryPage })));
const ProductionEntryInjectionPage = lazy(() => import("./pages/ProductionEntryInjectionPage").then((m) => ({ default: m.ProductionEntryInjectionPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const EmployeePage = lazy(() => import("./pages/EmployeePage").then((m) => ({ default: m.EmployeePage })));
const MaterialDataPage = lazy(() => import("./pages/MaterialDataPage").then((m) => ({ default: m.MaterialDataPage })));
const MaterialDetailPage = lazy(() => import("./pages/MaterialDetailPage").then((m) => ({ default: m.MaterialDetailPage })));
const CustomerDataPage = lazy(() => import("./pages/CustomerDataPage").then((m) => ({ default: m.CustomerDataPage })));
const SupplierDataPage = lazy(() => import("./pages/SupplierDataPage").then((m) => ({ default: m.SupplierDataPage })));
const CustomerProductPage = lazy(() => import("./pages/CustomerProductPage").then((m) => ({ default: m.CustomerProductPage })));

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

interface NavChild {
  key: string;
  label: string;
}

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  permission?: string;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  {
    key: "business",
    icon: <ShopOutlined />,
    label: "业务部",
    permission: "business",
    children: [
      { key: "/quotation", label: "国内报价" },
      { key: "/quotation-intl", label: "国际报价" },
      { key: "/quotation-management", label: "报价管理" },
      { key: "/cost", label: "成本计算" },
    ],
  },
  {
    key: "production",
    icon: <ToolOutlined />,
    label: "装配部",
    permission: "production",
    children: [
      { key: "/production-report", label: "生产日报汇总" },
      { key: "/production-entry", label: "生产日报录入" },
    ],
  },
  {
    key: "injection",
    icon: <ToolOutlined />,
    label: "注塑部",
    permission: "production",
    children: [
      { key: "/production-entry-injection", label: "生产日报录入" },
    ],
  },
  {
    key: "hr",
    icon: <TeamOutlined />,
    label: "人事",
    permission: "hr",
    children: [
      { key: "/employees", label: "员工管理" },
    ],
  },
  {
    key: "tools",
    icon: <AppstoreOutlined />,
    label: "公共工具",
    permission: "tools",
    children: [
      { key: "/process", label: "流程查阅" },
    ],
  },
  {
    key: "basic-data",
    icon: <DatabaseOutlined />,
    label: "基础资料",
    permission: "basic_data",
    children: [
      { key: "/materials", label: "商品资料" },
      { key: "/customers", label: "客户资料" },
      { key: "/suppliers", label: "供应商资料" },
      { key: "/customer-products", label: "客户商品资料" },
    ],
  },
];

// 路由 → 显示名称映射
const ROUTE_LABEL_MAP: Record<string, string> = {};
for (const item of NAV_ITEMS) {
  if (item.children) {
    for (const child of item.children) {
      ROUTE_LABEL_MAP[child.key] = child.label;
    }
  } else {
    ROUTE_LABEL_MAP[item.key] = item.label;
  }
}

const ALL_ROUTE_KEYS: string[] = NAV_ITEMS.flatMap((item) =>
  item.children ? item.children.map((c) => c.key) : [item.key]
);

function PageLoader() {
  return <div className="page-loader" />;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { tabs, activeKey, openTab, closeTab, closeOthers, setActiveKey } = useTabStore();

  // 移动端默认折叠
  useEffect(() => {
    const timer = window.setTimeout(() => setCollapsed(isMobile), 0);
    return () => window.clearTimeout(timer);
  }, [isMobile]);

  // 路由变化 → 同步标签
  useEffect(() => {
    const pathname = location.pathname;
    const label = ROUTE_LABEL_MAP[pathname] || pathname;
    openTab({ key: pathname, label });
  }, [location.pathname, openTab]);

  // 标签 activeKey 变化 → 导航
  const handleTabChange = (key: string) => {
    setActiveKey(key);
    navigate(key);
  };

  // 关闭标签
  const handleTabEdit = (key: string | React.MouseEvent | React.KeyboardEvent, action: "add" | "remove") => {
    if (action === "remove" && typeof key === "string") {
      const { tabs: currentTabs, activeKey: currentActive } = useTabStore.getState();
      closeTab(key);
      // 如果关闭的是当前标签，导航到新激活的标签
      if (currentActive === key) {
        const idx = currentTabs.findIndex((t) => t.key === key);
        const remaining = currentTabs.filter((t) => t.key !== key);
        const target = remaining[Math.min(idx, remaining.length - 1)];
        if (target) navigate(target.key);
      }
    }
  };

  // 可见的导航项
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    if (user?.role === "admin") return true;
    return user?.permissions?.includes(item.permission);
  });

  // 构建 antd Menu items
  const menuItems = useMemo(() => {
    return visibleNavItems.map((item) => {
      if (item.children) {
        return {
          key: item.key,
          icon: item.icon,
          label: item.label,
          children: item.children.map((child) => ({
            key: child.key,
            label: child.label,
          })),
        };
      }
      return {
        key: item.key,
        icon: item.icon,
        label: item.label,
      };
    });
  }, [visibleNavItems]);

  // 找到当前选中菜单的 openKey（用于展开子菜单）
  const selectedKey = (() => {
    const pathname = location.pathname;
    for (const key of ALL_ROUTE_KEYS) {
      if (key === "/" && pathname === "/") return "/";
      if (key !== "/" && (pathname === key || pathname.startsWith(key + "/"))) return key;
    }
    return "/";
  })();

  const defaultOpenKeys = (() => {
    for (const item of NAV_ITEMS) {
      if (item.children?.some((c) => c.key === selectedKey)) {
        return [item.key];
      }
    }
    return [];
  })();

  const siderWidth = 148;

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      {/* 左侧菜单 */}
      <Sider
        width={siderWidth}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{
          background: "#001529",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 64}
      >
        {/* Logo */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            padding: collapsed ? 0 : "0 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: "#1677ff",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            T
          </div>
          {!collapsed && (
            <Text strong style={{ color: "#fff", fontSize: 13, marginLeft: 10, whiteSpace: "nowrap" }}>
              特澳科技后台
            </Text>
          )}
        </div>

        <style>{`
          .ant-menu-dark .ant-menu-item,
          .ant-menu-dark .ant-menu-submenu-title {
            font-size: 13px !important;
            padding-left: 16px !important;
            height: 36px !important;
            line-height: 36px !important;
            margin: 0 !important;
          }
          .ant-menu-dark .ant-menu-submenu-title { padding-left: 16px !important; }
          .ant-menu-dark .ant-menu-sub .ant-menu-item { padding-left: 32px !important; font-size: 12px !important; height: 32px !important; line-height: 32px !important; }
        `}</style>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          onClick={({ key }) => {
            if (ALL_ROUTE_KEYS.includes(key)) {
              const label = ROUTE_LABEL_MAP[key] || key;
              openTab({ key, label });
              navigate(key);
            }
          }}
          style={{ borderRight: 0 }}
        />
      </Sider>

      {/* 右侧内容区 */}
      <Layout>
        {/* 顶部 Header + 标签栏 */}
        <Header
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            height: 56,
            borderBottom: "1px solid #f0f0f0",
            lineHeight: "normal",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            {/* 折叠按钮 */}
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, flexShrink: 0 }}
            />

            {/* 标签栏 */}
            {tabs.length > 0 && (
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <Tabs
                  type="editable-card"
                  hideAdd
                  activeKey={activeKey}
                  onChange={handleTabChange}
                  onEdit={handleTabEdit}
                  items={tabs.map((tab) => ({
                    key: tab.key,
                    label: tab.label,
                    closable: tab.key !== "/",
                  }))}
                  style={{ marginBottom: 0 }}
                  tabBarStyle={{ marginBottom: 0, borderBottom: "none" }}
                  size="small"
                />
              </div>
            )}

            {/* 右键菜单：关闭其他 */}
            {tabs.length > 1 && (
              <Button
                type="text"
                size="small"
                onClick={() => closeOthers(activeKey)}
                style={{ fontSize: 12, color: "#999", flexShrink: 0 }}
              >
                关闭其他
              </Button>
            )}
          </div>

          {/* 用户区域 */}
          {user && (
            <Dropdown
              menu={{
                items: [
                  ...(user.role === "admin"
                    ? [{ key: "admin", icon: <SettingOutlined />, label: <Link to="/admin">用户管理</Link> }]
                    : []),
                  { key: "divider", type: "divider" as const },
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    danger: true,
                    label: "退出登录",
                    onClick: () => {
                      logout();
                      navigate("/login");
                    },
                  },
                ],
              }}
            >
              <Button type="text" style={{ flexShrink: 0 }}>
                <UserOutlined /> {!isMobile && user.name}
              </Button>
            </Dropdown>
          )}
        </Header>

        {/* 内容区 */}
        <Content style={{ background: "#f5f5f5", overflow: "auto" }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
              <Route path="/admin" element={<AuthGuard requireAdmin><AdminPage /></AuthGuard>} />
              <Route path="/quotation" element={<AuthGuard permission="business"><QuotationPage headerHeight={56} /></AuthGuard>} />
              <Route path="/quotation-intl" element={<AuthGuard permission="business"><QuotationPageIntl headerHeight={56} /></AuthGuard>} />
              <Route path="/quotation-management" element={<AuthGuard permission="business"><QuotationManagementPage /></AuthGuard>} />
              <Route path="/cost" element={<AuthGuard permission="business"><CostCalculatorPage headerHeight={56} /></AuthGuard>} />
              <Route path="/production-report" element={<AuthGuard permission="production"><ProductionReportPage /></AuthGuard>} />
              <Route path="/production-entry" element={<AuthGuard permission="production"><ProductionEntryPage /></AuthGuard>} />
              <Route path="/production-entry-injection" element={<AuthGuard permission="production"><ProductionEntryInjectionPage /></AuthGuard>} />
              <Route path="/process" element={<AuthGuard permission="tools"><ProcessCenter /></AuthGuard>} />
              <Route path="/employees" element={<AuthGuard permission="hr"><EmployeePage /></AuthGuard>} />
              <Route path="/materials" element={<AuthGuard permission="basic_data"><MaterialDataPage /></AuthGuard>} />
              <Route path="/materials/:id" element={<AuthGuard permission="basic_data"><MaterialDetailPage /></AuthGuard>} />
              <Route path="/customers" element={<AuthGuard permission="basic_data"><CustomerDataPage /></AuthGuard>} />
              <Route path="/suppliers" element={<AuthGuard permission="basic_data"><SupplierDataPage /></AuthGuard>} />
              <Route path="/customer-products" element={<AuthGuard permission="basic_data"><CustomerProductPage /></AuthGuard>} />
            </Routes>
          </Suspense>
        </Content>

        <Footer
          style={{
            textAlign: "center",
            background: "#f5f5f5",
            padding: "8px 16px",
            fontSize: 12,
            color: "#999",
          }}
        >
          <a
            href="http://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#999", textDecoration: "none" }}
          >
            粤ICP备13044030号-7
          </a>
        </Footer>
      </Layout>
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AntApp>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="*" element={<AppLayout />} />
          </Routes>
        </Suspense>
      </AntApp>
    </BrowserRouter>
  );
}
