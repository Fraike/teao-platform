import { useState, useEffect, Suspense, lazy, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { App as AntApp, Layout, Menu, Typography, Button, Dropdown, Tabs, Tooltip } from "antd";
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
import { AdminPasswordModal } from "./components/AdminPasswordModal";
import { getNavigationItem, getVisibleMenuItems, NAVIGATION_GROUPS } from "./lib/navigation";
import { getSidebarLayout } from "./lib/sidebarLayout";
import styles from "./App.module.css";
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

const NAV_GROUP_ICONS: Record<string, React.ReactNode> = {
  business: <ShopOutlined />,
  production: <ToolOutlined />,
  injection: <ToolOutlined />,
  hr: <TeamOutlined />,
  tools: <AppstoreOutlined />,
  "basic-data": <DatabaseOutlined />,
};

function PageLoader() {
  return <div className="page-loader" />;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
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
    const item = getNavigationItem(pathname);
    if (!item) return;
    document.title = `${item.title} | 特澳科技后台`;
    openTab({ key: pathname, label: item.title });
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

  // 构建 antd Menu items
  const menuItems = useMemo(() => {
    const visibleItems = getVisibleMenuItems(user);
    const home = visibleItems.find((item) => item.key === "/");
    const createMenuLabel = (title: string) => (
      <Tooltip title={collapsed ? title : undefined} placement="right">
        <span className={styles.menuLabel}>{title}</span>
      </Tooltip>
    );
    const groupedItems = NAVIGATION_GROUPS.map((group) => {
      const children = visibleItems.filter((item) => item.group === group.key);
      return children.length === 0 ? null : {
        key: group.key,
        icon: NAV_GROUP_ICONS[group.key],
        label: group.title,
        children: children.map((item) => ({ key: item.key, label: createMenuLabel(item.title) })),
      };
    }).filter(Boolean);
    return home ? [{ key: home.key, icon: <HomeOutlined />, label: createMenuLabel(home.title) }, ...groupedItems] : groupedItems;
  }, [collapsed, user]);

  // 找到当前选中菜单的 openKey（用于展开子菜单）
  const selectedKey = (() => {
    const item = getNavigationItem(location.pathname);
    if (!item || item.key === "/") return "/";
    return item.menu ? item.key : "/materials";
  })();

  const defaultOpenKeys = (() => {
    const group = getVisibleMenuItems(user).find((item) => item.key === selectedKey)?.group;
    return NAVIGATION_GROUPS.filter((item) => item.key === group).map((item) => item.key);
  })();

  const sidebarLayout = getSidebarLayout(isMobile);

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      {/* 左侧菜单 */}
      <Sider
        width={sidebarLayout.expandedWidth}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        className={styles.sider}
        breakpoint="lg"
        collapsedWidth={sidebarLayout.collapsedWidth}
      >
        {/* Logo */}
        <div className={`${styles.logo} ${collapsed ? styles.logoCollapsed : ""}`}>
          <div className={styles.logoMark}>T</div>
          {!collapsed && (
            <Text className={styles.logoTitle}>特澳科技后台</Text>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          onClick={({ key }) => {
            const item = getNavigationItem(key);
            if (!item?.menu) return;
            openTab({ key, label: item.title });
            navigate(key);
          }}
          className={styles.menu}
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
                  ...(user.role === "admin" ? [{ key: "change-password", label: "修改我的密码", onClick: () => setPasswordModalOpen(true) }] : []),
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
        <AdminPasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />

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
