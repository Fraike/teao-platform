import { Card, InputNumber } from "antd";
import { useQuoteStore } from "../../lib/costStore";
import { calcMarkupTotal } from "../../lib/costCalculations";
import { formatMoney } from "../../lib/costFormat";
import { useIsMobile } from "../../lib/useIsMobile";
import type { MarkupCosts } from "../../types/costQuote";

const FIELDS: { key: keyof MarkupCosts; label: string }[] = [
  { key: "managementCost", label: "管理费用" },
  { key: "financeCost", label: "财务费用" },
  { key: "salesCost", label: "销售费用" },
  { key: "profit", label: "利润" },
  { key: "otherCost", label: "其他" },
];

export default function MarkupSection() {
  const markup = useQuoteStore((s) => s.quote.markupCosts);
  const setMarkup = useQuoteStore((s) => s.setMarkupCosts);
  const total = calcMarkupTotal(markup);
  const isMobile = useIsMobile();

  const update = (key: keyof MarkupCosts, value: number | null) => {
    setMarkup({ ...markup, [key]: value ?? 0 });
  };

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>G 加成费用分析 <span style={{ fontSize: 12, fontWeight: 400, color: "#1677ff" }}>小计：{formatMoney(total)}</span></span>}
      size="small"
      styles={{ body: { padding: isMobile ? "10px 12px" : "12px 16px" } }}
    >
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)", gap: 12, alignItems: "end" }}>
        {FIELDS.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>{label}</span>
            <InputNumber
              size="small"
              style={{ width: "100%" }}
              value={markup[key]}
              onChange={(v) => update(key, v)}
              min={0}
              step={0.01}
            />
          </label>
        ))}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: "#64748b" }}>加成合计</span>
          <div style={{
            border: "1px solid #d9d9d9",
            borderRadius: 6,
            padding: "4px 11px",
            textAlign: "right",
            fontFamily: "monospace",
            fontWeight: 600,
            color: "#1677ff",
            background: "#fafafa",
            fontSize: 13,
          }}>
            {formatMoney(total)}
          </div>
        </div>
      </div>
    </Card>
  );
}
