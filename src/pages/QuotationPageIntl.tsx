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
import CustomerCardIntl from "../components/intl/CustomerCardIntl";
import QuoteMetaCardIntl from "../components/intl/QuoteMetaCardIntl";
import ProductCardIntl from "../components/intl/ProductCardIntl";
import { TermsCardIntl } from "../components/TermsCard";
import { MoldCardIntl } from "../components/MoldCard";
import { ExportSettingsCardIntl } from "../components/ExportSettingsCard";
import PreviewPanelIntl from "../components/intl/PreviewPanelIntl";
import QuotationHistoryDrawer from "../components/QuotationHistoryDrawer";
import { useIntlQuotationStore } from "../lib/store";
import { useQuotationHistoryStore } from "../lib/historyStore";
import { exportPDFIntl } from "../lib/pdf";
import { useIsMobile } from "../lib/useIsMobile";

interface Props {
  headerHeight: number;
}

const A4_WIDTH = 794;
const A4_HEIGHT = 1122;
const DESKTOP_PREVIEW_SCALE = 0.88;

export default function QuotationPageIntl({ headerHeight }: Props) {
  const isMobile = useIsMobile();
  const previewRef = useRef<HTMLDivElement>(null);
  const quotation = useIntlQuotationStore((s) => s.quotation);
  const resetToSample = useIntlQuotationStore((s) => s.resetToSample);
  const exportJSON = useIntlQuotationStore((s) => s.exportJSON);
  const importJSON = useIntlQuotationStore((s) => s.importJSON);
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
        title: "Incomplete Quotation",
        content: [!hasCustomer && "Customer name is required", !hasPrice && "At least one product price must be greater than 0"]
          .filter(Boolean)
          .join("; "),
        okText: "OK",
      });
      return;
    }

    try {
      await exportPDFIntl(previewRef.current, quotation);

      const totalAmount = quotation.products.reduce((sum, p) => sum + (p.qty ?? 0) * (p.price ?? 0), 0);
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

      messageApi.success("PDF exported and saved to history");
    } catch (err) {
      console.error("PDF export failed:", err);
      const msg = err instanceof Error ? err.message : "PDF export failed, please try again";
      messageApi.error(msg);
    }
  }, [quotation, messageApi, addRecord]);

  const handleSave = () => {
    exportJSON();
    messageApi.success("Draft saved to local browser");
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
    messageApi.success("Draft exported");
  };

  const handleImport = () => fileRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importJSON(reader.result as string);
      if (ok) {
        messageApi.success("Import successful");
      } else {
        messageApi.error("Import failed: Invalid JSON format");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{ height: `calc(100vh - ${headerHeight}px)`, display: "flex", flexDirection: "column" }}>
      {contextHolder}
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileChange} />

      {/* Toolbar */}
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
          Intl. Quotation Editor
        </span>
        <Space size={isMobile ? 4 : "small"}>
          <Button size="small" icon={<FileAddOutlined />} onClick={() => {
            if (window.confirm("Create a new quotation? Unsaved changes will be lost.")) resetToSample();
          }}>
            {!isMobile && "New"}
          </Button>
          <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>
            {!isMobile && "Import"}
          </Button>
          <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>
            {!isMobile && "Export"}
          </Button>
          <Button size="small" icon={<SaveOutlined />} onClick={handleSave}>
            {!isMobile && "Save Draft"}
          </Button>
          <Button type="primary" size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF}>
            {!isMobile && "Export PDF"}
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setDrawerOpen(true)}>
            {!isMobile && "History"}
          </Button>
        </Space>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
        {/* Left: Input Area */}
        <div
          style={{
            width: isMobile ? "100%" : "46%",
            minWidth: isMobile ? 0 : 540,
            maxWidth: isMobile ? undefined : 740,
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
          <CustomerCardIntl />
          <QuoteMetaCardIntl />
          <ProductCardIntl />
          {quotation.quoteMeta.showMold && <MoldCardIntl />}
          <TermsCardIntl />
          <ExportSettingsCardIntl />
          <div style={{ height: 16 }} />
        </div>

        {/* Right: Preview Area */}
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
                <PreviewPanelIntl ref={previewRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      <QuotationHistoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
