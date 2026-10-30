import type {Location} from 'react-router-dom';
import {TabPageHost} from './components/TabPageHost';
import {guardTabClose,disposeTabPage,getTabPage} from './lib/tabPageCache';
import {api} from './lib/api';
import {productPdfResources} from './lib/productPdfResources';
import { useState, useEffect, useContext, Suspense, lazy, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, UNSAFE_LocationContext } from "react-router-dom";
import { App as AntApp, Layout, Menu, Typography, Button, Dropdown, Tabs, Tooltip, Space } from "antd";
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
  ReadOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useIsMobile } from "./lib/useIsMobile";
import { AuthGuard } from "./components/AuthGuard";
import { useAuthStore } from "./lib/authStore";
import { MAX_OPEN_TABS, useTabStore } from "./lib/tabStore";
import { AdminPasswordModal } from "./components/AdminPasswordModal";
import { NotificationBell } from "./components/NotificationBell";
import { AppLocaleProvider } from "./components/AppLocaleProvider";
import { FeedbackEntry } from "./components/feedback/FeedbackEntry";
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
const ProductStandardPage = lazy(() => import("./pages/ProductStandardPage").then((m) => ({ default: m.ProductStandardPage })));

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

const NAV_GROUP_ICONS: Record<string, React.ReactNode> = {
  business: <ShopOutlined />,
  production: <ToolOutlined />,
  injection: <ToolOutlined />,
  hr: <TeamOutlined />,
  tools: <AppstoreOutlined />,
  "basic-data": <DatabaseOutlined />,
  engineering: <ReadOutlined />,
};

function PageLoader() {
  return <div className="page-loader" />;
}


function renderTabPage(location:Location) {
  return <Suspense fallback={<PageLoader />}>
              <Routes location={location}>
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
                <Route path="/materials" element={<AuthGuard><MaterialDataPage /></AuthGuard>} />
                <Route path="/materials/:id" element={<AuthGuard><MaterialDetailPage /></AuthGuard>} />
                <Route path="/customers" element={<AuthGuard permission="basic_data"><CustomerDataPage /></AuthGuard>} />
                <Route path="/suppliers" element={<AuthGuard permission="basic_data"><SupplierDataPage /></AuthGuard>} />
                <Route path="/customer-products" element={<AuthGuard permission="basic_data"><CustomerProductPage /></AuthGuard>} />
                <Route path="/product-standards" element={<AuthGuard><ProductStandardPage /></AuthGuard>} />
              </Routes>
  </Suspense>;
}

function AppLayout() {
  const requestedLocation = useLocation();
  const routerContext = useContext(UNSAFE_LocationContext);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { tabs, activeKey, openTab, closeTab, closeOthers, setActiveKey } = useTabStore();
  const {modal,message:appMessage}=AntApp.useApp();
  // Reject before the host sees the route: even a temporary switch can evict an edited page.
  const [acceptedLocation, setAcceptedLocation] = useState<Location>(() => {
    const tab = tabs.find(tab => tab.key === activeKey);
    return tab?.location ?? { ...requestedLocation, pathname: tab?.key ?? '/', search: '', hash: '', state: null };
  });
  const routeBlocked = !!getNavigationItem(requestedLocation.pathname)
    && !tabs.some(tab => tab.key === requestedLocation.pathname)
    && tabs.length >= MAX_OPEN_TABS;
  if (!routeBlocked && acceptedLocation !== requestedLocation) setAcceptedLocation(requestedLocation);
  const location = routeBlocked ? acceptedLocation : requestedLocation;
  const showTabLimit = () => appMessage.info({ key: 'tab-limit', content: '最多打开 10 个标签页（含首页），请先关闭一个标签页再打开新页面' });
  useEffect(() => {
    if (!routeBlocked) return;
    const controller = new AbortController();
    const restore = () => navigate(acceptedLocation.pathname + acceptedLocation.search + acceptedLocation.hash, { replace: true, state: acceptedLocation.state });
    const reject = () => {
      void appMessage.info({ key: 'tab-limit', content: '最多打开 10 个标签页（含首页），请先关闭一个标签页再打开新页面' });
      restore();
    };
    // At capacity resolve only the ID; keep the current page mounted until admission succeeds.
    if (requestedLocation.pathname === '/materials/number') {
      const number = new URLSearchParams(requestedLocation.search).get('number') ?? '';
      void api.get<{ data: { id: string } }>(`/api/products/resolve?number=${encodeURIComponent(number)}`, { signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        const key = `/materials/${encodeURIComponent(result.data.id)}`;
        const current = useTabStore.getState();
        if (current.tabs.some(tab => tab.key === key) || current.tabs.length < MAX_OPEN_TABS) {
          navigate(key + requestedLocation.search + requestedLocation.hash, { replace: true, state: requestedLocation.state });
        } else reject();
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        void appMessage.error(error instanceof Error ? error.message : '获取商品详情失败');
        restore();
      });
    } else reject();
    return () => controller.abort();
  }, [routeBlocked, requestedLocation, acceptedLocation, navigate, appMessage]);
  const cacheScope=`${user?.id||''}:${user?.role||''}:${[...(user?.permissions||[])].sort().join(',')}`;
  const cachedTabs=useMemo(()=>tabs.flatMap(tab=>{
    const saved=tab.key===location.pathname?location:tab.location;
    return saved?[{key:tab.key,location:saved}]:[];
  }),[tabs,location]);
  useEffect(()=>()=>productPdfResources.reset(),[cacheScope]);
  const tabHref=(key:string)=>{const saved=useTabStore.getState().tabs.find(tab=>tab.key===key)?.location;return saved?saved.pathname+saved.search+saved.hash:key;};
  const allowClose=async(keys:string[])=>{
    const busy=()=>keys.some(key=>[...getTabPage(cacheScope,key).busy.values()].some(Boolean));
    if(busy()){appMessage.info('页面正在保存或处理文件，请完成后再关闭');return false;}
    return guardTabClose(cacheScope,keys,dirty=>new Promise<boolean>(resolve=>{
      modal.confirm({title:'存在未保存内容',content:`${dirty.length} 个标签页有未保存内容，确认丢弃并关闭？`,okText:'丢弃并关闭',cancelText:'继续编辑',onOk:()=>{resolve(true);},onCancel:()=>{resolve(false);}});
    }));
  };

  // 移动端默认折叠
  useEffect(() => {
    const timer = window.setTimeout(() => setCollapsed(isMobile), 0);
    return () => window.clearTimeout(timer);
  }, [isMobile]);

  // 路由变化 → 同步标签
  useEffect(() => {
    const pathname = location.pathname;
    if(pathname==="/materials/number")return;
    const item = getNavigationItem(pathname);
    if (!item) return;
    document.title = `${item.title} | 特澳科技后台`;
    openTab({ key: pathname, label: item.title,location });
  }, [location, openTab]);

  // 标签 activeKey 变化 → 导航
  const handleTabChange = (key: string) => {
    setActiveKey(key);
    navigate(tabHref(key));
  };

  // 关闭标签
  const handleTabEdit = async (key: string | React.MouseEvent | React.KeyboardEvent, action: "add" | "remove") => {
    if (action === "remove" && typeof key === "string") {
      const { tabs: currentTabs, activeKey: currentActive } = useTabStore.getState();
      if(!await allowClose([key]))return;
      closeTab(key);disposeTabPage(cacheScope,key);
      // 如果关闭的是当前标签，导航到新激活的标签
      if (currentActive === key) {
        const idx = currentTabs.findIndex((t) => t.key === key);
        const remaining = currentTabs.filter((t) => t.key !== key);
        const target = remaining[Math.min(idx, remaining.length - 1)];
        if (target) navigate(tabHref(target.key));
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
    <UNSAFE_LocationContext.Provider value={{ ...routerContext, location }}>
    <Layout className={styles.rootLayout}>
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
            if (!openTab({ key, label: item.title })) { void showTabLimit(); return; }
            navigate(key);
          }}
          className={styles.menu}
        />
        <FeedbackEntry collapsed={collapsed} />
      </Sider>

      {/* 右侧内容区 */}
      <Layout className={styles.mainLayout}>
        {/* 顶部 Header + 标签栏 */}
        <Header className={styles.header}>
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
                    label: tab.subtitle ? <span className={styles.productTabLabel}><span>{tab.label}</span><small>{tab.subtitle}</small></span> : tab.label,
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
                onClick={() => void (async()=>{const keys=tabs.filter(tab=>tab.key!==activeKey&&tab.key!=='/').map(tab=>tab.key);if(!await allowClose(keys))return;closeOthers(activeKey);keys.forEach(key=>disposeTabPage(cacheScope,key));})()}
                style={{ fontSize: 12, color: "#999", flexShrink: 0 }}
              >
                关闭其他
              </Button>
            )}
          </div>

          {/* 用户区域 */}
          {user && (
            <Space size={4} className={styles.headerUserArea}>
              <NotificationBell />
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
            </Space>
          )}
        </Header>
        <AdminPasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />

        {/* 内容区 */}
        <Content className={styles.content}>
          <TabPageHost scope={cacheScope} tabs={cachedTabs} activeKey={location.pathname==='/materials/number'?'__resolver__':location.pathname} renderPage={renderTabPage} />
          {location.pathname==='/materials/number'&&renderTabPage(location)}
        </Content>

        <Footer className={styles.footer}>
          <a
            href="http://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footerLink}
          >
            粤ICP备13044030号-7
          </a>
        </Footer>
      </Layout>
    </Layout>
    </UNSAFE_LocationContext.Provider>
  );
}

export function App() {
  return (
    <AppLocaleProvider>
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
    </AppLocaleProvider>
  );
}
