import { useNavigate } from "react-router-dom";
import { Card, Row, Col, Typography, Button } from "antd";
import { FileTextOutlined, CalculatorOutlined, ArrowRightOutlined } from "@ant-design/icons";

const { Title, Paragraph, Text } = Typography;

const SYSTEMS = [
  {
    key: "quotation",
    title: "报价单生成系统",
    description: "快速录入客户、产品、价格信息，生成专业商务报价单，一键导出 A4 格式 PDF。支持公章叠加、产品图片、条款自定义。",
    icon: <FileTextOutlined style={{ fontSize: 40, color: "#1677ff" }} />,
    color: "#e6f4ff",
    path: "/quotation",
  },
  {
    key: "cost",
    title: "成本计算系统",
    description: "基于原材料、外购件、制造工序、包装运输等维度，精确计算产品成本和利润率，支持数据的导入导出与本地保存。",
    icon: <CalculatorOutlined style={{ fontSize: 40, color: "#52c41a" }} />,
    color: "#f6ffed",
    path: "/cost",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <Title level={2} style={{ marginBottom: 8, fontWeight: 700 }}>
          特澳科技业务工具平台
        </Title>
        <Text type="secondary" style={{ fontSize: 15 }}>
          东莞市特澳电子科技有限公司 · 内部业务系统
        </Text>
      </div>

      <Row gutter={[24, 24]}>
        {SYSTEMS.map((sys) => (
          <Col xs={24} sm={12} key={sys.key}>
            <Card
              hoverable
              style={{ height: "100%", borderRadius: 8 }}
              onClick={() => navigate(sys.path)}
            >
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 16,
                    background: sys.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  {sys.icon}
                </div>
                <Title level={4} style={{ marginBottom: 8 }}>
                  {sys.title}
                </Title>
                <Paragraph
                  type="secondary"
                  style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 16, textAlign: "left" }}
                >
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

      <div style={{ textAlign: "center", marginTop: 48 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          © 2026 东莞市特澳电子科技有限公司
        </Text>
      </div>
    </div>
  );
}
