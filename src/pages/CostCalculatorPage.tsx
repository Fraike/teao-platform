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
import { useIsMobile } from "../lib/useIsMobile";

interface Props {
  headerHeight: number;
}

export default function CostCalculatorPage({ headerHeight }: Props) {
  const isMobile = useIsMobile();

  return (
    <div style={{ height: `calc(100vh - ${headerHeight}px)`, display: "flex", flexDirection: "column" }}>
      {/* 子工具栏 */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          padding: isMobile ? "8px 12px" : "8px 24px",
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

      {/* 主体：桌面左右分屏，移动端上下堆叠 */}
      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        {/* 录入区 */}
        <div
          style={{
            width: isMobile ? "100%" : "65%",
            minWidth: isMobile ? 0 : 600,
            overflowY: "auto",
            padding: isMobile ? "12px" : "16px 20px",
            background: "#f5f5f5",
            borderRight: isMobile ? "none" : "1px solid #f0f0f0",
            borderBottom: isMobile ? "1px solid #e0e0e0" : "none",
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? 10 : 14,
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

        {/* 汇总面板 */}
        <div
          style={{
            width: isMobile ? "100%" : "35%",
            minWidth: isMobile ? 0 : 300,
            maxWidth: isMobile ? undefined : 420,
            overflowY: "auto",
            padding: isMobile ? "12px" : "16px 20px",
            background: "#fafafa",
          }}
        >
          <CostSummaryPanel />
        </div>
      </div>
    </div>
  );
}
