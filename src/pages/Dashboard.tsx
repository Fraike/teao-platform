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
} from "@ant-design/icons";
import { useIsMobile } from "../lib/useIsMobile";
import { useAuthStore } from "../lib/authStore";
import styles from "./Dashboard.module.css";

interface SystemEntry {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  path: string;
  permission?: string;
  category: string;
}

const SYSTEMS: SystemEntry[] = [
  // 人事管理
  {
    key: "employees",
    title: "员工管理",
    description: "在职/离职员工档案、合同到期提醒、增删改查",
    icon: <TeamOutlined />,
    color: "#eb2f96",
    path: "/employees",
    permission: "hr",
    category: "人事管理",
  },
  // 业务系统
  {
    key: "quotation",
    title: "国内报价",
    description: "生成专业商务报价单，一键导出 A4 格式 PDF",
    icon: <FileTextOutlined />,
    color: "#1677ff",
    path: "/quotation",
    permission: "business",
    category: "业务系统",
  },
  {
    key: "quotation-intl",
    title: "国际报价",
    description: "海外客户英文报价，支持多币种与贸易条款",
    icon: <GlobalOutlined />,
    color: "#722ed1",
    path: "/quotation-intl",
    permission: "business",
    category: "业务系统",
  },
  {
    key: "cost",
    title: "成本计算",
    description: "原材料、工序、包装等维度成本与利润率分析",
    icon: <CalculatorOutlined />,
    color: "#52c41a",
    path: "/cost",
    permission: "business",
    category: "业务系统",
  },
  // 生产管理
  {
    key: "production-report",
    title: "生产日报",
    description: "装配部、注塑部每日产量、达成率、合格率汇总",
    icon: <BarChartOutlined />,
    color: "#13c2c2",
    path: "/production-report",
    permission: "production",
    category: "生产管理",
  },
  // 工具
  {
    key: "process",
    title: "流程查阅",
    description: "产品开发、质量控制、生产制造等标准作业流程",
    icon: <ReadOutlined />,
    color: "#fa8c16",
    path: "/process",
    permission: "tools",
    category: "工具",
  },
  // 基础资料
  {
    key: "materials",
    title: "商品资料",
    description: "从金蝶云星辰同步全部商品，按分类浏览与搜索",
    icon: <DatabaseOutlined />,
    color: "#2f54eb",
    path: "/materials",
    permission: "basic_data",
    category: "基础资料",
  },
  {
    key: "customers",
    title: "客户资料",
    description: "客户信息管理，从金蝶云星辰实时同步",
    icon: <DatabaseOutlined />,
    color: "#531dab",
    path: "/customers",
    permission: "basic_data",
    category: "基础资料",
  },
  {
    key: "suppliers",
    title: "供应商资料",
    description: "供应商信息管理，从金蝶云星辰实时同步",
    icon: <DatabaseOutlined />,
    color: "#08979c",
    path: "/suppliers",
    permission: "basic_data",
    category: "基础资料",
  },
];

const CATEGORY_ORDER = ["人事管理", "业务系统", "生产管理", "工具", "基础资料"];

export function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);

  const visibleSystems = SYSTEMS.filter((sys) => {
    if (!sys.permission) return true;
    if (user?.role === "admin") return true;
    return user?.permissions?.includes(sys.permission);
  });

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
