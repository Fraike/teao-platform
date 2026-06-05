import { Card, Table, Button, Input, InputNumber, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { MoldItem } from "../types/quotation";
import type { ColumnsType } from "antd/es/table";
import { useQuotationStore, useIntlQuotationStore } from "../lib/store";

type MoldRow = MoldItem & { index: number };

type StoreHook = typeof useQuotationStore | typeof useIntlQuotationStore;

export interface MoldCardLabels {
  title: string;
  name: string;
  namePlaceholder: string;
  totalCost: string;
  amortizedQty: string;
  unitCost: string;
  deleteConfirm: string;
  deleteOk: string;
  deleteCancel: string;
  addButton: string;
  currencyPrefix: string;
  currencyUnitCostPrefix: string;
}

const CN: MoldCardLabels = {
  title: "模具费用",
  name: "模具名称",
  namePlaceholder: "模具名称",
  totalCost: "模具总费用",
  amortizedQty: "分摊数量",
  unitCost: "模具单价",
  deleteConfirm: "确定删除该模具？",
  deleteOk: "删除",
  deleteCancel: "取消",
  addButton: "添加模具",
  currencyPrefix: "¥",
  currencyUnitCostPrefix: "¥",
};

const EN: MoldCardLabels = {
  title: "Mold Tooling Cost",
  name: "Mold Name",
  namePlaceholder: "Mold name",
  totalCost: "Total Cost",
  amortizedQty: "Amortized QTY",
  unitCost: "Unit Cost",
  deleteConfirm: "Delete this mold?",
  deleteOk: "Delete",
  deleteCancel: "Cancel",
  addButton: "Add Mold",
  currencyPrefix: "$",
  currencyUnitCostPrefix: "$",
};

function MoldCard({ useStore, labels }: { useStore: StoreHook; labels: MoldCardLabels }) {
  const molds = useStore((s) => s.quotation.molds);
  const addMold = useStore((s) => s.addMold);
  const removeMold = useStore((s) => s.removeMold);
  const updateMold = useStore((s) => s.updateMold);

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
      title: labels.name,
      dataIndex: "name",
      width: 160,
      render: (_name: string, r: MoldRow) => (
        <Input
          size="small"
          variant="borderless"
          placeholder={labels.namePlaceholder}
          value={r.name}
          onChange={(e) => update(r.id, "name", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: labels.totalCost,
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
          prefix={labels.currencyPrefix}
        />
      ),
    },
    {
      title: labels.amortizedQty,
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
      title: labels.unitCost,
      dataIndex: "unitCost",
      width: 100,
      render: (_v: number, r: MoldRow) => {
        const unitCost = r.amortizeQty > 0 ? r.totalCost / r.amortizeQty : 0;
        return (
          <span style={{ color: "#1677ff", fontWeight: 500, fontFamily: "monospace" }}>
            {labels.currencyUnitCostPrefix}{unitCost.toFixed(4)}
          </span>
        );
      },
    },
    {
      title: "",
      width: 50,
      render: (_v: unknown, r: MoldRow) => (
        <Popconfirm
          title={labels.deleteConfirm}
          onConfirm={() => removeMold(r.id)}
          okText={labels.deleteOk}
          cancelText={labels.deleteCancel}
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const dataSource = molds.map((m, idx) => ({ ...m, index: idx, key: m.id }));

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>{labels.title}</span>}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addMold}>
          {labels.addButton}
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

export default function DomesticMoldCard() {
  return <MoldCard useStore={useQuotationStore} labels={CN} />;
}

export function MoldCardIntl() {
  return <MoldCard useStore={useIntlQuotationStore} labels={EN} />;
}
