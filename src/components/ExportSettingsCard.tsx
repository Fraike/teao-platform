import { Card, InputNumber, Switch, Space, Typography } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useQuotationStore, useIntlQuotationStore } from "../lib/store";
import type { ProductTableColumnWidths } from "../types/quotation";

type StoreHook = typeof useQuotationStore | typeof useIntlQuotationStore;

const { Text } = Typography;

const CN_COLUMNS: Array<{ key: keyof ProductTableColumnWidths; label: string }> = [
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

const EN_COLUMNS: Array<{ key: keyof ProductTableColumnWidths; label: string }> = [
  { key: "index", label: "#" },
  { key: "name", label: "Item" },
  { key: "partNo", label: "Part No." },
  { key: "spec", label: "Spec" },
  { key: "unit", label: "Unit" },
  { key: "price", label: "Unit Price" },
  { key: "torque", label: "Torque" },
  { key: "image", label: "Image" },
  { key: "packaging", label: "Packaging" },
  { key: "remark", label: "Note" },
];

export interface ExportSettingsLabels {
  title: string;
  stampLabel: string;
  stampDesc: string;
  moldLabel: string;
  moldDesc: string;
  columnWidthsLabel: string;
  columnWidthsDesc: string;
  columns: Array<{ key: keyof ProductTableColumnWidths; label: string }>;
}

const CN: ExportSettingsLabels = {
  title: "导出设置",
  stampLabel: "显示公章",
  stampDesc: "在报价单底部显示公司电子公章",
  moldLabel: "显示模具报价",
  moldDesc: "在报价单中显示模具费用摊销明细",
  columnWidthsLabel: "报价单列宽",
  columnWidthsDesc: "调整导出报价单中产品表格每一列的宽度",
  columns: CN_COLUMNS,
};

const EN: ExportSettingsLabels = {
  title: "Export Settings",
  stampLabel: "Show Stamp",
  stampDesc: "Display company stamp at the bottom",
  moldLabel: "Show Mold Cost",
  moldDesc: "Display mold tooling cost breakdown",
  columnWidthsLabel: "Column Widths",
  columnWidthsDesc: "Adjust product table column widths in exported PDF",
  columns: EN_COLUMNS,
};

function ExportSettingsCard({ useStore, labels }: { useStore: StoreHook; labels: ExportSettingsLabels }) {
  const meta = useStore((s) => s.quotation.quoteMeta);
  const setMeta = useStore((s) => s.setQuoteMeta);

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <SettingOutlined style={{ marginRight: 6 }} />
          {labels.title}
        </span>
      }
      size="small"
      styles={{ body: { padding: "12px 16px" } }}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>{labels.stampLabel}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{labels.stampDesc}</Text>
          </div>
          <Switch
            checked={meta.showStamp}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showStamp: v }))}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>{labels.moldLabel}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{labels.moldDesc}</Text>
          </div>
          <Switch
            checked={meta.showMold}
            onChange={(v: boolean) => setMeta((prev) => ({ ...prev, showMold: v }))}
          />
        </div>
        <div>
          <Text strong style={{ fontSize: 13 }}>{labels.columnWidthsLabel}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{labels.columnWidthsDesc}</Text>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              marginTop: 10,
            }}
          >
            {labels.columns.map((item) => (
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

export default function DomesticExportSettingsCard() {
  return <ExportSettingsCard useStore={useQuotationStore} labels={CN} />;
}

export function ExportSettingsCardIntl() {
  return <ExportSettingsCard useStore={useIntlQuotationStore} labels={EN} />;
}
