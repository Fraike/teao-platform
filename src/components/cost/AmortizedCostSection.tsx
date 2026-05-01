import { Card, Table, Button, Input, InputNumber, Select, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuoteStore, generateId } from "../../lib/costStore";
import { calcAmortizedItem } from "../../lib/costCalculations";
import { formatMoney } from "../../lib/costFormat";
import type { AmortizedCostItem, AmortizedCategory } from "../../types/costQuote";
import type { ColumnsType } from "antd/es/table";

function emptyAmortized(): AmortizedCostItem {
  return { id: generateId(), category: "mold", name: "", totalAmount: 0, amortizationQuantity: 0 };
}

const CATEGORY_LABELS: Record<AmortizedCategory, string> = {
  mold: "模具",
  fixture: "工装/检具",
  test: "试验",
};

type Row = AmortizedCostItem & { key: string };

export default function AmortizedCostSection() {
  const costs = useQuoteStore((s) => s.quote.amortizedCosts);
  const setCosts = useQuoteStore((s) => s.setAmortizedCosts);
  const total = costs.reduce((sum, c) => sum + calcAmortizedItem(c), 0);

  const update = (id: string, field: keyof AmortizedCostItem, value: string | number) => {
    setCosts(costs.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };
  const add = () => setCosts([...costs, emptyAmortized()]);
  const remove = (id: string) => setCosts(costs.filter((c) => c.id !== id));
  const copy = (id: string) => {
    const target = costs.find((c) => c.id === id);
    if (target) setCosts([...costs, { ...target, id: generateId() }]);
  };

  const columns: ColumnsType<Row> = [
    { title: "类别", dataIndex: "category", width: 110, render: (_v, r) => (
      <Select size="small" style={{ width: "100%" }} value={r.category} onChange={(v) => update(r.id, "category", v)}
        options={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
    )},
    { title: "名称", dataIndex: "name", width: 140, render: (_v, r) => <Input size="small" variant="borderless" value={r.name} onChange={(e) => update(r.id, "name", e.target.value)} /> },
    { title: "总金额", dataIndex: "totalAmount", width: 110, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.totalAmount} onChange={(v) => update(r.id, "totalAmount", v ?? 0)} min={0} /> },
    { title: "分摊数量", dataIndex: "amortizationQuantity", width: 100, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.amortizationQuantity} onChange={(v) => update(r.id, "amortizationQuantity", v ?? 0)} min={0} /> },
    { title: "单项分摊", key: "perUnit", width: 100, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1677ff", fontSize: 12 }}>{formatMoney(calcAmortizedItem(r))}</span> },
    { title: "操作", key: "actions", width: 72, fixed: "right" as const, render: (_v, r) => (
      <Space size="small">
        <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(r.id)} />
        <Popconfirm title="确定删除该行？" onConfirm={() => remove(r.id)} okText="删除" cancelText="取消">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>D 专项分摊分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增</Button>}
      size="small" styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<Row> columns={columns} dataSource={costs.map((c) => ({ ...c, key: c.id }))} pagination={false} size="small" scroll={{ x: 650 }} bordered locale={{ emptyText: <>暂无数据，点击"新增"添加</> }} />
    </Card>
  );
}
