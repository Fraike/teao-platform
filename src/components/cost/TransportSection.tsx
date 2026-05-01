import { Card, Table, Button, Input, InputNumber, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuoteStore, generateId } from "../../lib/costStore";
import { calcTransportItem } from "../../lib/costCalculations";
import { formatMoney } from "../../lib/costFormat";
import type { TransportItem } from "../../types/costQuote";
import type { ColumnsType } from "antd/es/table";

function emptyTransport(): TransportItem {
  return { id: generateId(), route: "", distanceKm: 0, partsPerShipment: 0, freightCost: 0, managementCost: 0 };
}

type Row = TransportItem & { key: string };

export default function TransportSection() {
  const items = useQuoteStore((s) => s.quote.transportItems);
  const setItems = useQuoteStore((s) => s.setTransportItems);
  const total = items.reduce((sum, i) => sum + calcTransportItem(i), 0);

  const update = (id: string, field: keyof TransportItem, value: string | number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };
  const add = () => setItems([...items, emptyTransport()]);
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));
  const copy = (id: string) => {
    const target = items.find((i) => i.id === id);
    if (target) setItems([...items, { ...target, id: generateId() }]);
  };

  const columns: ColumnsType<Row> = [
    { title: "运输路线", dataIndex: "route", width: 120, render: (_v, r) => <Input size="small" variant="borderless" value={r.route} onChange={(e) => update(r.id, "route", e.target.value)} /> },
    { title: "距离 km", dataIndex: "distanceKm", width: 80, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.distanceKm ?? 0} onChange={(v) => update(r.id, "distanceKm", v ?? 0)} min={0} /> },
    { title: "每次发运件数", dataIndex: "partsPerShipment", width: 110, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.partsPerShipment} onChange={(v) => update(r.id, "partsPerShipment", v ?? 0)} min={0} /> },
    { title: "单次运费", dataIndex: "freightCost", width: 90, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.freightCost} onChange={(v) => update(r.id, "freightCost", v ?? 0)} min={0} /> },
    { title: "管理费", dataIndex: "managementCost", width: 85, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.managementCost} onChange={(v) => update(r.id, "managementCost", v ?? 0)} min={0} /> },
    { title: "单次总费", key: "totalShipment", width: 90, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(r.freightCost + r.managementCost)}</span> },
    { title: "单件运费", key: "perUnit", width: 90, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1677ff", fontSize: 12 }}>{formatMoney(calcTransportItem(r))}</span> },
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
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>F 运输费分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增</Button>}
      size="small" styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<Row> columns={columns} dataSource={items.map((i) => ({ ...i, key: i.id }))} pagination={false} size="small" scroll={{ x: 760 }} bordered locale={{ emptyText: <>暂无数据，点击"新增"添加</> }} />
    </Card>
  );
}
