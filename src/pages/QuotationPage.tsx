import { useRef, useCallback, useState } from "react";
import { Button, Space, message, Modal } from "antd";
import {
  FilePdfOutlined,
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  FileAddOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import CustomerCard from "../components/CustomerCard";
import QuoteMetaCard from "../components/QuoteMetaCard";
import ProductCard from "../components/ProductCard";
import TermsCard from "../components/TermsCard";
import MoldCard from "../components/MoldCard";
import ExportSettingsCard from "../components/ExportSettingsCard";
import PreviewPanel from "../components/PreviewPanel";
import QuotationHistoryDrawer from "../components/QuotationHistoryDrawer";
import { useQuotationStore } from "../lib/store";
import { useQuotationHistoryStore } from "../lib/historyStore";
import { exportPDF } from "../lib/pdf";
import { useIsMobile } from "../lib/useIsMobile";

interface Props {
  headerHeight: number;
}

const A4_WIDTH = 794;
const A4_HEIGHT = 1122;
const DESKTOP_PREVIEW_SCALE = 0.88;

export default function QuotationPage({ headerHeight }: Props) {
  const isMobile = useIsMobile();
  const previewRef = useRef<HTMLDivElement>(null);
  const quotation = useQuotationStore((s) => s.quotation);
  const resetToSample = useQuotationStore((s) => s.resetToSample);
  const exportJSON = useQuotationStore((s) => s.exportJSON);
  const importJSON = useQuotationStore((s) => s.importJSON);
  const fileRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const addRecord = useQuotationHistoryStore((s) => s.addRecord);

  const handleExportPDF = useCallback(async () => {
    if (!previewRef.current) return;

    const hasCustomer = quotation.customer.name.trim() !== "";
    const hasPrice = quotation.products.some((p) => (p.price ?? 0) > 0);
    if (!hasCustomer || !hasPrice) {
      Modal.warning({
        title: "报价信息不完整",
        content: [!hasCustomer && "客户名称不能为空", !hasPrice && "至少需要一个产品单价大于 0"]
          .filter(Boolean)
          .join("；"),
        okText: "知道了",
      });
      return;
    }

    try {
      await exportPDF(previewRef.current, quotation);

      const totalAmount = quotation.products.reduce((sum, p) => sum + (p.price ?? 0), 0);
      const cleanProducts = quotation.products.map(({ image: _, ...rest }) => rest);
      addRecord({
        id: `${Date.now()}_${quotation.quoteMeta.no}`,
        createdAt: new Date().toISOString(),
        quoteNo: quotation.quoteMeta.no,
        date: quotation.quoteMeta.date,
        customerName: quotation.customer.name,
        contact: quotation.customer.contact || "",
        currency: quotation.quoteMeta.currency,
        products: cleanProducts,
        molds: quotation.molds || [],
        terms: quotation.terms,
        salesName: quotation.quoteMeta.salesName,
        totalAmount,
      });

      messageApi.success("PDF 导出成功，已保存至报价汇总");
    } catch (err) {
      console.error("PDF export failed:", err);
      const msg = err instanceof Error ? err.message : "PDF 导出失败，请重试";
      messageApi.error(msg);
    }
  }, [quotation, messageApi, addRecord]);

  const handleSave = () => {
    exportJSON();
    messageApi.success("草稿已保存到本地浏览器");
  };

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Quotation_${quotation.quoteMeta.no}_${quotation.quoteMeta.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    messageApi.success("草稿已导出");
  };

  const handleImport = () => fileRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importJSON(reader.result as string);
      if (ok) {
        messageApi.success("导入成功");
      } else {
        messageApi.error("导入失败：JSON 格式不正确");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{ height: `calc(100vh - ${headerHeight}px)`, display: "flex", flexDirection: "column" }}>
      {contextHolder}
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* 报价系统子工具栏 */}
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
          报价单编辑
        </span>
        <Space size={isMobile ? 4 : "small"}>
          <Button size="small" icon={<FileAddOutlined />} onClick={() => {
            if (window.confirm("确定新建报价单？")) resetToSample();
          }}>
            {!isMobile && "新建"}
          </Button>
          <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>
            {!isMobile && "导入"}
          </Button>
          <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>
            {!isMobile && "导出"}
          </Button>
          <Button size="small" icon={<SaveOutlined />} onClick={handleSave}>
            {!isMobile && "保存草稿"}
          </Button>
          <Button type="primary" size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF}>
            {!isMobile && "导出 PDF"}
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setDrawerOpen(true)}>
            {!isMobile && "报价汇总"}
          </Button>
        </Space>
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
        {/* 左侧录入区 */}
        <div
          style={{
            width: isMobile ? "100%" : "46%",
            minWidth: isMobile ? 0 : 520,
            maxWidth: isMobile ? undefined : 720,
            overflowY: "auto",
            padding: isMobile ? "12px" : "18px 24px",
            background: "#fafafa",
            borderRight: isMobile ? "none" : "1px solid #f0f0f0",
            borderBottom: isMobile ? "1px solid #f0f0f0" : "none",
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? 10 : 14,
          }}
        >
          <CustomerCard />
          <QuoteMetaCard />
          <ProductCard />
          {quotation.quoteMeta.showMold && <MoldCard />}
          <TermsCard />
          <ExportSettingsCard />
          <div style={{ height: 16 }} />
        </div>

        {/* 右侧预览区（移动端隐藏） */}
        {!isMobile && (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              background: "#e2e2e2",
              display: "flex",
              justifyContent: "center",
              padding: "24px 16px",
            }}
          >
            <div
              style={{
                width: A4_WIDTH * DESKTOP_PREVIEW_SCALE,
                height: A4_HEIGHT * DESKTOP_PREVIEW_SCALE,
                position: "relative",
                flex: "0 0 auto",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: `translateX(-50%) scale(${DESKTOP_PREVIEW_SCALE})`,
                  transformOrigin: "top center",
                  boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
                  borderRadius: 2,
                }}
              >
                <PreviewPanel ref={previewRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      <QuotationHistoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
