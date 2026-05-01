import { Card, Table, Button, Input, InputNumber, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuoteStore, generateId } from "../../lib/costStore";
import { calcManufacturingProcessItem } from "../../lib/costCalculations";
import { formatMoney } from "../../lib/costFormat";
import type { ManufacturingProcessItem } from "../../types/costQuote";
import type { ColumnsType } from "antd/es/table";

function emptyProcess(): ManufacturingProcessItem {
  return { id: generateId(), processName: "", toolingName: "", equipmentName: "", equipmentPowerKw: 0, operatorCount: 1, processTimeMinute: 0, wagePerHour: 0, electricityPricePerKwh: 0, depreciationCost: 0 };
}

type Row = ManufacturingProcessItem & { key: string };

export default function ManufacturingSection() {
  const processes = useQuoteStore((s) => s.quote.processes);
  const setProcesses = useQuoteStore((s) => s.setProcesses);
  const total = processes.reduce((sum, p) => sum + calcManufacturingProcessItem(p).manufacturingCost, 0);

  const update = (id: string, field: keyof ManufacturingProcessItem, value: string | number) => {
    setProcesses(processes.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };
  const add = () => setProcesses([...processes, emptyProcess()]);
  const remove = (id: string) => setProcesses(processes.filter((p) => p.id !== id));
  const copy = (id: string) => {
    const target = processes.find((p) => p.id === id);
    if (target) setProcesses([...processes, { ...target, id: generateId() }]);
  };

  const columns: ColumnsType<Row> = [
    { title: "工序", dataIndex: "processName", width: 85, render: (_v, r) => <Input size="small" variant="borderless" value={r.processName} onChange={(e) => update(r.id, "processName", e.target.value)} /> },
    { title: "工装", dataIndex: "toolingName", width: 75, render: (_v, r) => <Input size="small" variant="borderless" value={r.toolingName ?? ""} onChange={(e) => update(r.id, "toolingName", e.target.value)} /> },
    { title: "设备", dataIndex: "equipmentName", width: 75, render: (_v, r) => <Input size="small" variant="borderless" value={r.equipmentName ?? ""} onChange={(e) => update(r.id, "equipmentName", e.target.value)} /> },
    { title: "功率 kw", dataIndex: "equipmentPowerKw", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.equipmentPowerKw} onChange={(v) => update(r.id, "equipmentPowerKw", v ?? 0)} min={0} /> },
    { title: "人数", dataIndex: "operatorCount", width: 60, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.operatorCount} onChange={(v) => update(r.id, "operatorCount", v ?? 0)} min={0} /> },
    { title: "工时 min", dataIndex: "processTimeMinute", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.processTimeMinute} onChange={(v) => update(r.id, "processTimeMinute", v ?? 0)} min={0} /> },
    { title: "工资/h", dataIndex: "wagePerHour", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.wagePerHour} onChange={(v) => update(r.id, "wagePerHour", v ?? 0)} min={0} /> },
    { title: "电费/度", dataIndex: "electricityPricePerKwh", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.electricityPricePerKwh} onChange={(v) => update(r.id, "electricityPricePerKwh", v ?? 0)} min={0} /> },
    { title: "人工费", key: "laborCost", width: 75, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(calcManufacturingProcessItem(r).laborCost)}</span> },
    { title: "燃动费", key: "powerCost", width: 75, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{formatMoney(calcManufacturingProcessItem(r).powerCost)}</span> },
    { title: "折旧", dataIndex: "depreciationCost", width: 75, align: "right", render: (_v, r) => <InputNumber size="small" style={{ width: "100%" }} value={r.depreciationCost} onChange={(v) => update(r.id, "depreciationCost", v ?? 0)} min={0} /> },
    { title: "制造费", key: "manufacturingCost", width: 85, align: "right", render: (_v, r) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1677ff", fontSize: 12 }}>{formatMoney(calcManufacturingProcessItem(r).manufacturingCost)}</span> },
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
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>C 制造费用分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增</Button>}
      size="small" styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<Row> columns={columns} dataSource={processes.map((p) => ({ ...p, key: p.id }))} pagination={false} size="small" scroll={{ x: 1050 }} bordered locale={{ emptyText: <>暂无数据，点击"新增"添加</> }} />
    </Card>
  );
}
