import { useState, useMemo } from "react";
import {
  Typography,
  Input,
  Tag,
  Card,
  List,
  Space,
  Alert,
} from "antd";
import {
  SearchOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import processes from "../data/processes";
import FlowChart from "../components/process/FlowChart";
import { useIsMobile } from "../lib/useIsMobile";

const { Title, Paragraph, Text } = Typography;

const DEPARTMENTS = [
  "全部",
  "工程部",
  "生管部",
  "品质部",
  "行政部",
  "采购部",
  "仓库部",
  "注塑部",
  "装配部",
  "业务部",
  "财务部",
  "总经办",
];

const STATUS_COLOR: Record<string, string> = {
  "生效中": "green",
  "修订中": "orange",
  "已作废": "red",
};

export default function ProcessCenter() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("全部");

  const filtered = useMemo(() => {
    return processes.filter((p) => {
      const matchDept = department === "全部" || p.department === department;
      const kw = search.trim().toLowerCase();
      const matchSearch =
        !kw ||
        p.title.toLowerCase().includes(kw) ||
        p.department.toLowerCase().includes(kw) ||
        p.category.toLowerCase().includes(kw) ||
        p.summary.toLowerCase().includes(kw) ||
        p.steps.some(
          (s) =>
            s.title.toLowerCase().includes(kw) ||
            (s.description && s.description.toLowerCase().includes(kw))
        ) ||
        p.notes.some((n) => n.toLowerCase().includes(kw));
      return matchDept && matchSearch;
    });
  }, [search, department]);

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 960, margin: "0 auto" }}>
      <Title level={isMobile ? 4 : 3} style={{ marginBottom: 8 }}>
        流程查阅中心
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: isMobile ? 13 : 14 }}>
        用于查看公司各部门标准流程、操作说明和相关表单，审批请在企业微信对应流程中执行。
      </Paragraph>

      <Alert
        message="如需发起申请或审批，请前往企业微信对应审批流程。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Space direction="vertical" size={16} style={{ width: "100%", marginBottom: 24 }}>
        <Input
          placeholder="搜索流程名称、部门、关键词"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 400 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DEPARTMENTS.map((dept) => (
            <div
              key={dept}
              onClick={() => setDepartment(dept)}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
                background: department === dept ? "#1677ff" : "#f0f0f0",
                color: department === dept ? "#fff" : "#333",
                transition: "all 0.2s",
              }}
            >
              {dept}
            </div>
          ))}
        </div>
      </Space>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#999" }}>
          未找到匹配的流程
        </div>
      ) : (
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          {filtered.map((process) => (
            <Card
              key={process.id}
              id={process.id}
              title={
                <Space size={12} wrap>
                  <Text strong style={{ fontSize: 16 }}>
                    {process.title}
                  </Text>
                  <Tag color={STATUS_COLOR[process.status]}>{process.status}</Tag>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {process.department} · {process.category} · {process.version}
                  </Text>
                </Space>
              }
              styles={{ body: { padding: isMobile ? 16 : 24 } }}
            >
              <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                {process.summary}
              </Paragraph>

              {/* 流程图 */}
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
                  流程图
                </Text>
                <FlowChart steps={process.steps} />
              </div>

              {/* 流程步骤 — 紧凑编号列表 */}
              <Text strong style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
                流程步骤
              </Text>
              <ol
                style={{
                  margin: "0 0 16px 0",
                  paddingLeft: 20,
                  fontSize: 13,
                  color: "#555",
                  lineHeight: 2,
                }}
              >
                {process.steps.map((step, i) => (
                  <li key={i}>
                    <Text strong>{step.title}</Text>
                    {step.description && (
                      <Text type="secondary"> — {step.description}</Text>
                    )}
                  </li>
                ))}
              </ol>

              {/* 注意事项 */}
              <Text strong style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
                注意事项
              </Text>
              <List
                size="small"
                dataSource={process.notes}
                renderItem={(note) => (
                  <List.Item style={{ padding: "3px 0", border: "none" }}>
                    <Space>
                      <ExclamationCircleOutlined style={{ color: "#faad14", fontSize: 12 }} />
                      <Text style={{ fontSize: 13 }}>{note}</Text>
                    </Space>
                  </List.Item>
                )}
                style={{ marginBottom: 12 }}
              />

              {/* 附件下载 */}
              {process.attachments.length > 0 && (
                <Space size={8} wrap>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    附件：
                  </Text>
                  {process.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13 }}
                    >
                      <DownloadOutlined /> {a.name}
                    </a>
                  ))}
                </Space>
              )}
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
}
