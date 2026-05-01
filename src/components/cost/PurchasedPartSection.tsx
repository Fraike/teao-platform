import { Card, Table, Button, Input, InputNumber, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuoteStore, generateId } from "../../lib/costStore";
import { formatMoney } from "../../lib/costFormat";
import type { PurchasedPartItem } from "../../types/costQuote";
import type { ColumnsType } from "antd/es/table";

function emptyPart(): PurchasedPartItem {
  return { id: generateId(), partName: "", supplierName: "", location: "", quantity: 1, unitPrice: 0 };
}

type Row = PurchasedPartItem & { key: string };

export default function PurchasedPartSection() {
  const parts = useQuoteStore((s) => s.quote.purchasedParts);
  const setParts = useQuoteStore((s) => s.setPurchasedParts);
  const total = parts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);

  const update = (id: string, field: keyof PurchasedPartItem, value: string | number) => {
    setParts(parts.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };
  const add = () => setParts([...parts, emptyPart()]);
  const remove = (id: string) => setParts(parts.filter((p) => p.id !== id));
  const copy = (id: string) => {
    const target = parts.find((p) => p.id === id);
    if (target) setParts([...parts, { ...target, id: generateId() }]);
  };

  const columns: ColumnsType<Row> = [
    { title: "零件名称", dataIndex: "partName", width: 120, render: (_v, r) => <Input size="small" variant="borderless" value={r.partName} onChange={(e) => update(r.id, "partName", e.target.value)} /> },
    { title: "供应商", dataIndex: "supplierName", width: 100, render: (_v, r) => <Input size="small" variant="borderless" value={r.supplierName} onChange={(e) => update(r.id, "supplierName", e.target.value)} /> },
    { title: "地点", dataIndex: "location", width: 90, render: (_v, r) => <Input size="small" variant="borderless" value={r.location ?? ""} onChange={(e) => update(r.id, "location", e.target.value)} /> },
    { title: "数量", dataIndex: "quantity", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.quantity} onChange={(v) => update(r.id, "quantity", v ?? 0)} min={0} /> },
    { title: "单价", dataIndex: "unitPrice", width: 90, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.unitPrice} onChange={(v) => update(r.id, "unitPrice", v ?? 0)} min={0} /> },
    { title: "金额", key: "amount", width: 90, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1677ff", fontSize: 12 }}>{formatMoney(r.quantity * r.unitPrice)}</span> },
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
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>B 外购件分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增</Button>}
      size="small" styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<Row> columns={columns} dataSource={parts.map((p) => ({ ...p, key: p.id }))} pagination={false} size="small" scroll={{ x: 650 }} bordered locale={{ emptyText: <>暂无数据，点击"新增"添加</> }} />
    </Card>
  );
}
