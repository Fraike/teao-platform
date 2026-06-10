import { useState, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { App as AntApp, Layout, Menu, Typography, Drawer, Button, Dropdown } from "antd";
import {
  HomeOutlined,
  MenuOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  ShopOutlined,
  ToolOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { useIsMobile } from "./lib/useIsMobile";
import { AuthGuard } from "./components/AuthGuard";
import { useAuthStore } from "./lib/authStore";
import "./components/PageLoader.css";

// ---- public pages (no header) ----
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));

// ---- protected pages ----
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const QuotationPage = lazy(() => import("./pages/QuotationPage"));
const QuotationPageIntl = lazy(() => import("./pages/QuotationPageIntl"));
const CostCalculatorPage = lazy(() => import("./pages/CostCalculatorPage"));
const ProcessCenter = lazy(() => import("./pages/ProcessCenter"));
const ProductionReportPage = lazy(() => import("./pages/ProductionReportPage"));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const EmployeePage = lazy(() => import("./pages/EmployeePage").then((m) => ({ default: m.EmployeePage })));

const { Header, Content, Footer } = Layout;
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
      { key: "/cost", label: "成本计算" },
    ],
  },
  {
    key: "production",
    icon: <ToolOutlined />,
    label: "装配部",
    permission: "production",
    children: [
      { key: "/production-report", label: "生产日报" },
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
];

const ALL_ROUTE_KEYS: string[] = NAV_ITEMS.flatMap((item) =>
  item.children ? item.children.map((c) => c.key) : [item.key]
);

function findSelectedKey(pathname: string): string {
  for (const key of ALL_ROUTE_KEYS) {
    if (key === "/") {
      if (pathname === "/") return "/";
    } else if (pathname === key || pathname.startsWith(key + "/")) {
      return key;
    }
  }
  return "/";
}

function PageLoader() {
  return <div className="page-loader" />;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const selectedKey = findSelectedKey(location.pathname);

  const headerHeight = isMobile ? 48 : 56;

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true; // 首页永远显示
    if (user?.role === "admin") return true; // 管理员看全部
    return user?.permissions?.includes(item.permission);
  });

  const menuItems = visibleNavItems.map((item) => {
    if (item.children) {
      return {
        key: item.key,
        icon: item.icon,
        label: item.label,
        children: item.children.map((child) => ({
          key: child.key,
          label: <Link to={child.key}>{child.label}</Link>,
        })),
      };
    }
    return {
      key: item.key,
      icon: item.icon,
      label: <Link to={item.key}>{item.label}</Link>,
    };
  });

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: "#001529",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "0 16px" : "0 24px",
          height: headerHeight,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: isMobile ? 28 : 32,
                height: isMobile ? 28 : 32,
                background: "#1677ff",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: isMobile ? 14 : 16,
              }}
            >
              T
            </div>
            {!isMobile && (
              <div>
                <Text strong style={{ color: "#fff", fontSize: 15, whiteSpace: "nowrap" }}>
                  特澳科技业务工具平台
                </Text>
              </div>
            )}
          </div>
          {!isMobile && (
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[selectedKey]}
              items={menuItems}
              style={{ flex: 1, minWidth: 300, background: "transparent", borderBottom: "none" }}
            />
          )}
        </div>

        {isMobile && (
          <>
            <Button
              type="text"
              icon={<MenuOutlined style={{ color: "#fff", fontSize: 20 }} />}
              onClick={() => setDrawerOpen(true)}
            />
            <Drawer
              title="特澳科技业务工具平台"
              placement="right"
              width={220}
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              styles={{ body: { padding: 0 } }}
            >
              <Menu
                mode="inline"
                selectedKeys={[selectedKey]}
                items={menuItems}
                onClick={({ key }) => {
                  if (ALL_ROUTE_KEYS.includes(key)) {
                    navigate(key);
                    setDrawerOpen(false);
                  }
                }}
                style={{ border: "none" }}
              />
            </Drawer>
          </>
        )}

        {!isMobile && user && (
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
            <Button type="text" style={{ color: "#fff" }}>
              <UserOutlined /> {user.name}
            </Button>
          </Dropdown>
        )}
      </Header>

      <Content style={{ background: "#f5f5f5" }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/admin" element={<AuthGuard requireAdmin><AdminPage /></AuthGuard>} />
            <Route path="/quotation" element={<AuthGuard permission="business"><QuotationPage headerHeight={headerHeight} /></AuthGuard>} />
            <Route path="/quotation-intl" element={<AuthGuard permission="business"><QuotationPageIntl headerHeight={headerHeight} /></AuthGuard>} />
            <Route path="/cost" element={<AuthGuard permission="business"><CostCalculatorPage headerHeight={headerHeight} /></AuthGuard>} />
            <Route path="/production-report" element={<AuthGuard permission="production"><ProductionReportPage /></AuthGuard>} />
            <Route path="/process" element={<AuthGuard permission="tools"><ProcessCenter /></AuthGuard>} />
            <Route path="/employees" element={<AuthGuard permission="hr"><EmployeePage /></AuthGuard>} />
          </Routes>
        </Suspense>
      </Content>

      <Footer
        style={{
          textAlign: "center",
          background: "#f5f5f5",
          padding: "12px 16px",
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
