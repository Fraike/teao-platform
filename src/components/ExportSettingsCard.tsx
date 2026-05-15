import { Card, InputNumber, Switch, Space, Typography } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";
import type { ProductTableColumnWidths } from "../types/quotation";

const { Text } = Typography;

const COLUMN_LABELS: Array<{ key: keyof ProductTableColumnWidths; label: string }> = [
  { key: "index", label: "#" },
  { key: "name", label: "产品名称" },
  { key: "partNo", label: "料号" },
  { key: "spec", label: "规格" },
  { key: "unit", label: "单位" },
  { key: "price", label: "单价" },
  { key: "torque", label: "参数/扭矩" },
  { key: "image", label: "图片" },
  { key: "remark", label: "备注" },
];

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
            <Text strong style={{ fontSize: 13 }}>显示模具报价</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              在报价单中显示模具费用摊销明细
            </Text>
          </div>
          <Switch
            checked={meta.showMold}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showMold: v }))}
          />
        </div>
        <div>
          <Text strong style={{ fontSize: 13 }}>报价单列宽</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            调整导出报价单中产品表格每一列的宽度
          </Text>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              marginTop: 10,
            }}
          >
            {COLUMN_LABELS.map((item) => (
              <label key={item.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Text>
                <InputNumber
                  size="small"
                  min={24}
                  max={220}
                  value={meta.tableColumnWidths[item.key]}
                  onChange={(value) =>
                    setMeta((prev) => ({
                      ...prev,
                      tableColumnWidths: {
                        ...prev.tableColumnWidths,
                        [item.key]: value ?? prev.tableColumnWidths[item.key],
                      },
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </Space>
    </Card>
  );
}
