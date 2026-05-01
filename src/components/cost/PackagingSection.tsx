import { Card, Table, Button, Input, InputNumber, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuoteStore, generateId } from "../../lib/costStore";
import { calcPackagingItem } from "../../lib/costCalculations";
import { formatMoney } from "../../lib/costFormat";
import type { PackagingItem } from "../../types/costQuote";
import type { ColumnsType } from "antd/es/table";

function emptyPackaging(): PackagingItem {
  return { id: generateId(), packagingName: "", specification: "", unit: "", unitPrice: 0, materialUsage: 1, partsPerPackage: 0 };
}

type Row = PackagingItem & { key: string };

export default function PackagingSection() {
  const items = useQuoteStore((s) => s.quote.packagingItems);
  const setItems = useQuoteStore((s) => s.setPackagingItems);
  const total = items.reduce((sum, i) => sum + calcPackagingItem(i), 0);

  const update = (id: string, field: keyof PackagingItem, value: string | number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };
  const add = () => setItems([...items, emptyPackaging()]);
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));
  const copy = (id: string) => {
    const target = items.find((i) => i.id === id);
    if (target) setItems([...items, { ...target, id: generateId() }]);
  };

  const columns: ColumnsType<Row> = [
    { title: "包装名称", dataIndex: "packagingName", width: 110, render: (_v, r) => <Input size="small" variant="borderless" value={r.packagingName} onChange={(e) => update(r.id, "packagingName", e.target.value)} /> },
    { title: "规格", dataIndex: "specification", width: 100, render: (_v, r) => <Input size="small" variant="borderless" value={r.specification} onChange={(e) => update(r.id, "specification", e.target.value)} /> },
    { title: "单位", dataIndex: "unit", width: 65, render: (_v, r) => <Input size="small" variant="borderless" value={r.unit} onChange={(e) => update(r.id, "unit", e.target.value)} /> },
    { title: "单价", dataIndex: "unitPrice", width: 85, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.unitPrice} onChange={(v) => update(r.id, "unitPrice", v ?? 0)} min={0} /> },
    { title: "用量", dataIndex: "materialUsage", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.materialUsage} onChange={(v) => update(r.id, "materialUsage", v ?? 0)} min={0} /> },
    { title: "包装件数", dataIndex: "partsPerPackage", width: 90, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.partsPerPackage} onChange={(v) => update(r.id, "partsPerPackage", v ?? 0)} min={0} /> },
    { title: "单件包装费", key: "perUnit", width: 100, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1677ff", fontSize: 12 }}>{formatMoney(calcPackagingItem(r))}</span> },
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
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>E 包装费分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增</Button>}
      size="small" styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<Row> columns={columns} dataSource={items.map((i) => ({ ...i, key: i.id }))} pagination={false} size="small" scroll={{ x: 720 }} bordered locale={{ emptyText: <>暂无数据，点击"新增"添加</> }} />
    </Card>
  );
}
