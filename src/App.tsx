import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { App as AntApp, Layout, Menu, Typography, Drawer, Button } from "antd";
import {
  HomeOutlined,
  FileTextOutlined,
  CalculatorOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import Dashboard from "./pages/Dashboard";
import QuotationPage from "./pages/QuotationPage";
import CostCalculatorPage from "./pages/CostCalculatorPage";
import { useIsMobile } from "./lib/useIsMobile";

const { Header, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/quotation", icon: <FileTextOutlined />, label: "报价系统" },
  { key: "/cost", icon: <CalculatorOutlined />, label: "成本计算" },
];

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedKey = NAV_ITEMS.find((item) =>
    item.key === "/" ? location.pathname === "/" : location.pathname.startsWith(item.key)
  )?.key ?? "/";

  const headerHeight = isMobile ? 48 : 56;

  const menuItems = NAV_ITEMS.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: item.label,
  }));

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
              items={menuItems.map((item) => ({
                ...item,
                label: <Link to={item.key}>{item.label}</Link>,
              }))}
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
                mode="vertical"
                selectedKeys={[selectedKey]}
                items={menuItems.map((item) => ({
                  ...item,
                  label: item.label,
                }))}
                onClick={({ key }) => {
                  navigate(key);
                  setDrawerOpen(false);
                }}
                style={{ border: "none" }}
              />
            </Drawer>
          </>
        )}
      </Header>

      <Content style={{ background: "#f5f5f5" }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/quotation" element={<QuotationPage headerHeight={headerHeight} />} />
          <Route path="/cost" element={<CostCalculatorPage headerHeight={headerHeight} />} />
        </Routes>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AntApp>
        <AppLayout />
      </AntApp>
    </BrowserRouter>
  );
}
