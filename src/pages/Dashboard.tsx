import { useNavigate } from "react-router-dom";
import { Card, Row, Col, Typography, Button } from "antd";
import { FileTextOutlined, CalculatorOutlined, ReadOutlined, GlobalOutlined, BarChartOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useIsMobile } from "../lib/useIsMobile";
import styles from "./Dashboard.module.css";

const { Title, Paragraph, Text } = Typography;

const SYSTEMS = [
  {
    key: "quotation",
    title: "国内报价系统",
    description: "快速录入客户、产品、价格信息，生成专业商务报价单，一键导出 A4 格式 PDF。支持公章叠加、产品图片、条款自定义。",
    icon: <FileTextOutlined style={{ fontSize: 40, color: "#1677ff" }} />,
    color: "#e6f4ff",
    path: "/quotation",
  },
  {
    key: "quotation-intl",
    title: "International Quotation",
    description: "Generate professional English quotation for overseas customers. Supports USD/HKD/EUR, EXW/FOB trade terms, T/T payment, packaging details, and bank information.",
    icon: <GlobalOutlined style={{ fontSize: 40, color: "#722ed1" }} />,
    color: "#f9f0ff",
    path: "/quotation-intl",
  },
  {
    key: "cost",
    title: "成本计算系统",
    description: "基于原材料、外购件、制造工序、包装运输等维度，精确计算产品成本和利润率，支持数据的导入导出与本地保存。",
    icon: <CalculatorOutlined style={{ fontSize: 40, color: "#52c41a" }} />,
    color: "#f6ffed",
    path: "/cost",
  },
  {
    key: "production-report",
    title: "生产日报",
    description: "自动从维格表拉取装配部、注塑部每日生产数据，汇总产量、达成率、合格率、不良数，支持一键推送到企业微信群。",
    icon: <BarChartOutlined style={{ fontSize: 40, color: "#13c2c2" }} />,
    color: "#e6fffb",
    path: "/production-report",
  },
  {
    key: "process",
    title: "流程查阅中心",
    description: "查阅产品开发、质量控制、生产制造等标准作业流程，支持流程图交互查看，方便快速了解各环节规范。",
    icon: <ReadOutlined style={{ fontSize: 40, color: "#fa8c16" }} />,
    color: "#fff7e6",
    path: "/process",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <div className={isMobile ? `${styles.container} ${styles.containerMobile}` : styles.container}>
      <div className={isMobile ? `${styles.header} ${styles.headerMobile}` : styles.header}>
        <Title level={isMobile ? 3 : 2} className={styles.headerTitle}>
          特澳科技业务工具平台
        </Title>
        <Text type="secondary" className={isMobile ? styles.headerSubMobile : styles.headerSub}>
          东莞市特澳电子科技有限公司 · 内部业务系统
        </Text>
      </div>

      <Row gutter={[24, 24]}>
        {SYSTEMS.map((sys) => (
          <Col xs={24} sm={12} key={sys.key}>
            <Card hoverable style={{ height: "100%", borderRadius: 8 }} onClick={() => navigate(sys.path)}>
              <div className={styles.cardInner}>
                <div className={styles.iconBox} style={{ background: sys.color }}>
                  {sys.icon}
                </div>
                <Title level={4} className={styles.cardTitle}>
                  {sys.title}
                </Title>
                <Paragraph type="secondary" className={styles.cardDesc}>
                  {sys.description}
                </Paragraph>
                <Button type="primary" icon={<ArrowRightOutlined />} size="middle">
                  进入系统
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <div className={styles.footer}>
        <Text type="secondary">© 2026 东莞市特澳电子科技有限公司</Text>
      </div>
    </div>
  );
}
