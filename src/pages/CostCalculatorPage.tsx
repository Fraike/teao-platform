import BasicInfoForm from "../components/cost/BasicInfoForm";
import QuoteToolbar from "../components/cost/QuoteToolbar";
import MaterialCostSection from "../components/cost/MaterialCostSection";
import PurchasedPartSection from "../components/cost/PurchasedPartSection";
import ManufacturingSection from "../components/cost/ManufacturingSection";
import AmortizedCostSection from "../components/cost/AmortizedCostSection";
import PackagingSection from "../components/cost/PackagingSection";
import TransportSection from "../components/cost/TransportSection";
import MarkupSection from "../components/cost/MarkupSection";
import CostSummaryPanel from "../components/cost/CostSummaryPanel";

export default function CostCalculatorPage() {
  return (
    <div style={{ height: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}>
      {/* 子工具栏 */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          padding: "8px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>
          成本报价计算器
        </span>
        <QuoteToolbar />
      </div>

      {/* 主体：左右分屏 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 左侧录入区 */}
        <div
          style={{
            width: "65%",
            minWidth: 600,
            overflowY: "auto",
            padding: "16px 20px",
            background: "#f5f5f5",
            borderRight: "1px solid #f0f0f0",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <BasicInfoForm />
          <MaterialCostSection />
          <PurchasedPartSection />
          <ManufacturingSection />
          <AmortizedCostSection />
          <PackagingSection />
          <TransportSection />
          <MarkupSection />
          <div style={{ height: 16 }} />
        </div>

        {/* 右侧汇总面板 */}
        <div
          style={{
            width: "35%",
            minWidth: 300,
            maxWidth: 420,
            overflowY: "auto",
            padding: "16px 20px",
            background: "#fafafa",
          }}
        >
          <CostSummaryPanel />
        </div>
      </div>
    </div>
  );
}
