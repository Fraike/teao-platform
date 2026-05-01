import { Card, Switch, Space, Typography } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";

const { Text } = Typography;

export default function ExportSettingsCard() {
  const meta = useQuotationStore((s) => s.quotation.quoteMeta);
  const setMeta = useQuotationStore((s) => s.setQuoteMeta);

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <SettingOutlined style={{ marginRight: 6 }} />
          导出设置
        </span>
      }
      size="small"
      styles={{ body: { padding: "12px 16px" } }}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Text strong style={{ fontSize: 13 }}>显示公章</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              在报价单底部显示公司电子公章
            </Text>
          </div>
          <Switch
            checked={meta.showStamp}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showStamp: v }))}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Text strong style={{ fontSize: 13 }}>显示数量/金额</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              在报价单中显示数量和金额列
            </Text>
          </div>
          <Switch
            checked={meta.showAmount}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showAmount: v }))}
          />
        </div>
      </Space>
    </Card>
  );
}
