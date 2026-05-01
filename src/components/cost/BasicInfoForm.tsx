import { Card, Input, InputNumber, DatePicker } from "antd";
import { useQuoteStore } from "../../lib/costStore";
import dayjs from "dayjs";

export default function BasicInfoForm() {
  const basicInfo = useQuoteStore((s) => s.quote.basicInfo);
  const update = useQuoteStore((s) => s.updateBasicInfo);

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>基础信息</span>}
      size="small"
      styles={{ body: { padding: "12px 16px" } }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, fontSize: 13 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>产品名称</span>
          <Input
            size="small"
            value={basicInfo.productName}
            onChange={(e) => update({ productName: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>名称</span>
          <Input
            size="small"
            value={basicInfo.productCategory}
            onChange={(e) => update({ productCategory: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>适用车型</span>
          <Input
            size="small"
            value={basicInfo.applicableVehicle}
            onChange={(e) => update({ applicableVehicle: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>产品件号</span>
          <Input
            size="small"
            value={basicInfo.productPartNo}
            onChange={(e) => update({ productPartNo: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>产品净重 (g)</span>
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            value={basicInfo.netWeightGram}
            onChange={(v) => update({ netWeightGram: v ?? 0 })}
            min={0}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>计量单位</span>
          <Input
            size="small"
            value={basicInfo.unit}
            onChange={(e) => update({ unit: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>供方名称</span>
          <Input
            size="small"
            value={basicInfo.supplierName}
            onChange={(e) => update({ supplierName: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>供方联系人</span>
          <Input
            size="small"
            value={basicInfo.supplierContact}
            onChange={(e) => update({ supplierContact: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>报价日期</span>
          <DatePicker
            size="small"
            style={{ width: "100%" }}
            value={basicInfo.quoteDate ? dayjs(basicInfo.quoteDate) : null}
            onChange={(d) => update({ quoteDate: d ? d.format("YYYY-MM-DD") : "" })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#64748b" }}>税率</span>
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            value={basicInfo.taxRate}
            onChange={(v) => update({ taxRate: v ?? 0 })}
            min={0}
            max={1}
            step={0.01}
          />
        </label>
      </div>
    </Card>
  );
}
