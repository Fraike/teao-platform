import { useNavigate } from "react-router-dom";
import { Card, Row, Col } from "antd";
import {
  TeamOutlined,
  FileTextOutlined,
  GlobalOutlined,
  CalculatorOutlined,
  BarChartOutlined,
  ReadOutlined,
  DatabaseOutlined,
  ToolOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { useIsMobile } from "../lib/useIsMobile";
import { useAuthStore } from "../lib/authStore";
import { DASHBOARD_CATEGORY_ORDER, getVisibleNavigationItems } from "../lib/navigation";
import styles from "./Dashboard.module.css";

const CATEGORY_ORDER = DASHBOARD_CATEGORY_ORDER;
const ICONS = { team: <TeamOutlined />, file: <FileTextOutlined />, global: <GlobalOutlined />, calculator: <CalculatorOutlined />, chart: <BarChartOutlined />, read: <ReadOutlined />, database: <DatabaseOutlined />, tool: <ToolOutlined />, setting: <SettingOutlined />, app: <AppstoreOutlined />, shop: <FileTextOutlined /> };
type SystemEntry = { key: string; title: string; description: string; icon: React.ReactNode; color: string; path: string; category: string };

export function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);

  const visibleSystems = getVisibleNavigationItems(user).map((item) => ({
    key: item.key,
    title: item.title,
    description: item.description,
    icon: ICONS[item.icon],
    color: item.color,
    path: item.key,
    category: item.category,
  }));

  // 按分类分组
  const grouped: Record<string, SystemEntry[]> = {};
  for (const cat of CATEGORY_ORDER) {
    const items = visibleSystems.filter((s) => s.category === cat);
    if (items.length > 0) {
      grouped[cat] = items;
    }
  }

  return (
    <div className={isMobile ? `${styles.container} ${styles.containerMobile}` : styles.container}>
      {/* Categorized Modules */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot} style={{ background: items[0].color }} />
            <span className={styles.sectionTitle}>{category}</span>
            <span className={styles.sectionCount}>· {items.length} 个模块</span>
          </div>

          <Row gutter={[14, 14]}>
            {items.map((sys) => (
              <Col xs={24} sm={12} md={8} key={sys.key}>
                <Card
                  hoverable
                  className={`${styles.moduleCard}`}
                  style={{ borderLeft: `3px solid ${sys.color}` }}
                  styles={{ body: { padding: 0 } }}
                  onClick={() => navigate(sys.path)}
                >
                  <div className={styles.moduleInner}>
                    <div
                      className={styles.moduleIconBox}
                      style={{ background: `${sys.color}14`, color: sys.color }}
                    >
                      {sys.icon}
                    </div>
                    <div className={styles.moduleText}>
                      <div className={styles.moduleName}>{sys.title}</div>
                      <div className={styles.moduleDesc}>{sys.description}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </div>
  );
}
