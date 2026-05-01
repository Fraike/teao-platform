import { Card, Table, Button, Input, InputNumber, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuoteStore, generateId } from "../../lib/costStore";
import { calcMaterialItem } from "../../lib/costCalculations";
import { formatMoney } from "../../lib/costFormat";
import type { MaterialItem } from "../../types/costQuote";
import type { ColumnsType } from "antd/es/table";

function emptyMaterial(): MaterialItem {
  return { id: generateId(), materialName: "", supplierName: "", specification: "", netWeightKg: 0, lossRate: 0, unitPrice: 0, scrapUnitPrice: 0 };
}

type Row = MaterialItem & { key: string };

export default function MaterialCostSection() {
  const materials = useQuoteStore((s) => s.quote.materials);
  const setMaterials = useQuoteStore((s) => s.setMaterials);

  const total = materials.reduce((sum, m) => sum + calcMaterialItem(m).materialCost, 0);

  const update = (id: string, field: keyof MaterialItem, value: string | number) => {
    setMaterials(materials.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const add = () => setMaterials([...materials, emptyMaterial()]);
  const remove = (id: string) => setMaterials(materials.filter((m) => m.id !== id));
  const copy = (id: string) => {
    const target = materials.find((m) => m.id === id);
    if (target) setMaterials([...materials, { ...target, id: generateId() }]);
  };

  const columns: ColumnsType<Row> = [
    { title: "材料名称", dataIndex: "materialName", width: 100, render: (_v, r) => <Input size="small" variant="borderless" value={r.materialName} onChange={(e) => update(r.id, "materialName", e.target.value)} /> },
    { title: "供应商", dataIndex: "supplierName", width: 90, render: (_v, r) => <Input size="small" variant="borderless" value={r.supplierName} onChange={(e) => update(r.id, "supplierName", e.target.value)} /> },
    { title: "规格", dataIndex: "specification", width: 85, render: (_v, r) => <Input size="small" variant="borderless" value={r.specification} onChange={(e) => update(r.id, "specification", e.target.value)} /> },
    { title: "净重 KG", dataIndex: "netWeightKg", width: 85, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.netWeightKg} onChange={(v) => update(r.id, "netWeightKg", v ?? 0)} min={0} /> },
    { title: "损耗%", dataIndex: "lossRate", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.lossRate} onChange={(v) => update(r.id, "lossRate", v ?? 0)} min={0} step={0.01} /> },
    { title: "总重", key: "totalWeight", width: 85, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(calcMaterialItem(r).totalWeight)}</span> },
    { title: "单价", dataIndex: "unitPrice", width: 80, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.unitPrice} onChange={(v) => update(r.id, "unitPrice", v ?? 0)} min={0} /> },
    { title: "金额", key: "amount", width: 90, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(calcMaterialItem(r).amount)}</span> },
    { title: "废料价格", dataIndex: "scrapUnitPrice", width: 90, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.scrapUnitPrice} onChange={(v) => update(r.id, "scrapUnitPrice", v ?? 0)} min={0} /> },
    { title: "废料金额", key: "scrapAmount", width: 90, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(calcMaterialItem(r).scrapAmount)}</span> },
    { title: "材料费", key: "materialCost", width: 90, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1677ff", fontSize: 12 }}>{formatMoney(calcMaterialItem(r).materialCost)}</span> },
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
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>A 原材料分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增</Button>}
      size="small" styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<Row> columns={columns} dataSource={materials.map((m) => ({ ...m, key: m.id }))} pagination={false} size="small" scroll={{ x: 1050 }} bordered locale={{ emptyText: <>暂无数据，点击"新增"添加</> }} />
    </Card>
  );
}
