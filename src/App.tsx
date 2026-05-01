import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { App as AntApp, Layout, Menu, Typography } from "antd";
import {
  HomeOutlined,
  FileTextOutlined,
  CalculatorOutlined,
} from "@ant-design/icons";
import Dashboard from "./pages/Dashboard";
import QuotationPage from "./pages/QuotationPage";
import CostCalculatorPage from "./pages/CostCalculatorPage";

const { Header, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/quotation", icon: <FileTextOutlined />, label: "报价系统" },
  { key: "/cost", icon: <CalculatorOutlined />, label: "成本计算" },
];

function AppLayout() {
  const location = useLocation();
  const selectedKey = NAV_ITEMS.find((item) =>
    item.key === "/" ? location.pathname === "/" : location.pathname.startsWith(item.key)
  )?.key ?? "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: "#001529",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              }}
            >
              T
            </div>
            <div>
              <Text strong style={{ color: "#fff", fontSize: 15, whiteSpace: "nowrap" }}>
                特澳科技业务工具平台
              </Text>
            </div>
          </div>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={NAV_ITEMS.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: <Link to={item.key}>{item.label}</Link>,
            }))}
            style={{ flex: 1, minWidth: 300, background: "transparent", borderBottom: "none" }}
          />
        </div>
      </Header>

      <Content style={{ background: "#f5f5f5" }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/quotation" element={<QuotationPage />} />
          <Route path="/cost" element={<CostCalculatorPage />} />
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
