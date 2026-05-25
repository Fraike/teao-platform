import { Card, InputNumber, Switch, Space, Typography } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useIntlQuotationStore } from "../../lib/store-intl";
import type { ProductTableColumnWidths } from "../../types/quotation";

const { Text } = Typography;

const COLUMN_LABELS: Array<{ key: keyof ProductTableColumnWidths; label: string }> = [
  { key: "index", label: "#" },
  { key: "name", label: "Item" },
  { key: "partNo", label: "Part No." },
  { key: "spec", label: "Spec" },
  { key: "unit", label: "Unit" },
  { key: "price", label: "Unit Price" },
  { key: "torque", label: "Torque" },
  { key: "image", label: "Image" },
  { key: "remark", label: "Note" },
];

export default function ExportSettingsCardIntl() {
  const meta = useIntlQuotationStore((s) => s.quotation.quoteMeta);
  const setMeta = useIntlQuotationStore((s) => s.setQuoteMeta);

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <SettingOutlined style={{ marginRight: 6 }} />
          Export Settings
        </span>
      }
      size="small"
      styles={{ body: { padding: "12px 16px" } }}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Show Stamp</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Display company stamp at the bottom
            </Text>
          </div>
          <Switch
            checked={meta.showStamp}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showStamp: v }))}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Show Mold Cost</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Display mold tooling cost breakdown
            </Text>
          </div>
          <Switch
            checked={meta.showMold}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showMold: v }))}
          />
        </div>
        <div>
          <Text strong style={{ fontSize: 13 }}>Column Widths</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            Adjust product table column widths in exported PDF
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
