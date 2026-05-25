import { Card, Table, Button, Input, InputNumber, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useIntlQuotationStore } from "../../lib/store-intl";
import type { MoldItem } from "../../types/quotation";
import type { ColumnsType } from "antd/es/table";

type MoldRow = MoldItem & { index: number };

export default function MoldCardIntl() {
  const molds = useIntlQuotationStore((s) => s.quotation.molds);
  const addMold = useIntlQuotationStore((s) => s.addMold);
  const removeMold = useIntlQuotationStore((s) => s.removeMold);
  const updateMold = useIntlQuotationStore((s) => s.updateMold);

  const update = (id: string, field: keyof MoldItem, value: unknown) => {
    updateMold(id, (prev) => ({ ...prev, [field]: value }));
  };

  const columns: ColumnsType<MoldRow> = [
    {
      title: "#",
      dataIndex: "index",
      width: 40,
      render: (v: number) => <span style={{ color: "#999" }}>{v + 1}</span>,
    },
    {
      title: "Mold Name",
      dataIndex: "name",
      width: 160,
      render: (_name: string, r: MoldRow) => (
        <Input
          size="small"
          variant="borderless"
          placeholder="Mold name"
          value={r.name}
          onChange={(e) => update(r.id, "name", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "Total Cost",
      dataIndex: "totalCost",
      width: 120,
      render: (_v: number, r: MoldRow) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          value={r.totalCost}
          onChange={(v: number | null) => update(r.id, "totalCost", v ?? 0)}
          precision={2}
          min={0}
          prefix="$"
        />
      ),
    },
    {
      title: "Amortized QTY",
      dataIndex: "amortizeQty",
      width: 120,
      render: (_v: number, r: MoldRow) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          value={r.amortizeQty}
          onChange={(v: number | null) => update(r.id, "amortizeQty", v ?? 0)}
          min={1}
          suffix="PCS"
        />
      ),
    },
    {
      title: "Unit Cost",
      dataIndex: "unitCost",
      width: 100,
      render: (_v: number, r: MoldRow) => {
        const unitCost = r.amortizeQty > 0 ? r.totalCost / r.amortizeQty : 0;
        return (
          <span style={{ color: "#1677ff", fontWeight: 500, fontFamily: "monospace" }}>
            ${unitCost.toFixed(4)}
          </span>
        );
      },
    },
    {
      title: "",
      width: 50,
      render: (_v: unknown, r: MoldRow) => (
        <Popconfirm
          title="Delete this mold?"
          onConfirm={() => removeMold(r.id)}
          okText="Delete"
          cancelText="Cancel"
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const dataSource = molds.map((m, idx) => ({ ...m, index: idx, key: m.id }));

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>Mold Tooling Cost</span>}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addMold}>
          Add Mold
        </Button>
      }
      size="small"
      styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<MoldRow>
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
        scroll={{ x: 600 }}
        bordered
      />
    </Card>
  );
}
