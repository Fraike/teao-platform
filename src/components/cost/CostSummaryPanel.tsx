import { Card } from "antd";
import { useCostSummary, useQuoteStore } from "../../lib/costStore";
import { formatMoney } from "../../lib/costFormat";
import { calcMaterialItem, calcManufacturingProcessItem, calcPackagingItem, calcTransportItem, calcAmortizedItem } from "../../lib/costCalculations";

export default function CostSummaryPanel() {
  const quote = useQuoteStore((s) => s.quote);
  const summary = useCostSummary();

  const materialDetails = quote.materials.map((m) => {
    const r = calcMaterialItem(m);
    return { name: m.materialName, cost: r.materialCost };
  });
  const purchasedDetails = quote.purchasedParts.map((p) => ({
    name: p.partName,
    cost: p.quantity * p.unitPrice,
  }));
  const processDetails = quote.processes.map((p) => {
    const r = calcManufacturingProcessItem(p);
    return { name: p.processName, cost: r.manufacturingCost };
  });
  const amortizedDetails = quote.amortizedCosts.map((a) => ({
    name: a.name,
    cost: calcAmortizedItem(a),
  }));
  const packagingDetails = quote.packagingItems.map((p) => ({
    name: p.packagingName,
    cost: calcPackagingItem(p),
  }));
  const transportDetails = quote.transportItems.map((t) => ({
    name: t.route,
    cost: calcTransportItem(t),
  }));

  const items = [
    { label: "A 原材料费", cost: summary.materialCost, details: materialDetails },
    { label: "B 外购件费", cost: summary.purchasedPartCost, details: purchasedDetails },
    { label: "C 制造费用", cost: summary.manufacturingCost, details: processDetails },
    { label: "D 专项费", cost: summary.amortizedCost, details: amortizedDetails },
    { label: "E 包装费", cost: summary.packagingCost, details: packagingDetails },
    { label: "F 运输费", cost: summary.transportCost, details: transportDetails },
    { label: "G 加成费用", cost: summary.markupCost, details: [] },
  ];

  const totalCost = summary.subtotalWithoutTax || 0;
  const costStructure = totalCost
    ? items.map((item) => ({ ...item, pct: (item.cost / totalCost) * 100 }))
    : items.map((item) => ({ ...item, pct: 0 }));

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>费用汇总</span>}
      size="small"
      styles={{ body: { padding: "12px 14px" } }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {costStructure.map((item) => (
          <div key={item.label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>{item.label}</span>
              <span style={{ fontFamily: "monospace", fontWeight: 500, color: "#1e293b" }}>{formatMoney(item.cost)}</span>
            </div>
            {item.pct > 0 && (
              <div style={{ marginTop: 3, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#93c5fd", borderRadius: 2, width: `${Math.min(item.pct, 100)}%` }} />
              </div>
            )}
            {item.details.length > 0 && (
              <div style={{ marginTop: 4, marginLeft: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                {item.details.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
                    <span>{d.name}</span>
                    <span style={{ fontFamily: "monospace" }}>{formatMoney(d.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 13 }}>
            <span style={{ color: "#334155" }}>H 不含税合计</span>
            <span style={{ fontFamily: "monospace" }}>{formatMoney(summary.subtotalWithoutTax)}</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
          <span>税额 ({((quote.basicInfo.taxRate) * 100).toFixed(0)}%)</span>
          <span style={{ fontFamily: "monospace" }}>{formatMoney(summary.taxAmount)}</span>
        </div>

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, color: "#1677ff" }}>
            <span>I 含税合计</span>
            <span style={{ fontFamily: "monospace" }}>{formatMoney(summary.totalWithTax)}</span>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          加成占比：{totalCost ? ((summary.markupCost / totalCost) * 100).toFixed(1) : "0"}%
        </div>
      </div>
    </Card>
  );
}
