import { useRef, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Space, message, Modal } from "antd";
import {
  FilePdfOutlined,
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  FileAddOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { CustomerCardIntl } from "../components/CustomerCard";
import { QuoteMetaCardIntl } from "../components/QuoteMetaCard";
import ProductCardIntl from "../components/intl/ProductCardIntl";
import { TermsCardIntl } from "../components/TermsCard";
import { MoldCardIntl } from "../components/MoldCard";
import { ExportSettingsCardIntl } from "../components/ExportSettingsCard";
import PreviewPanelIntl from "../components/intl/PreviewPanelIntl";
import { prepareQuotationCopy, useIntlQuotationStore } from "../lib/store";
import { exportPDFIntl } from "../lib/pdf";
import { useIsMobile } from "../lib/useIsMobile";
import { api } from "../lib/api";
import type { ManagedQuotation } from "../types/quotation";
import { confirmTierPricing } from "../components/confirmTierPricing";

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
  const replaceQuotation = useIntlQuotationStore((s) => s.replaceQuotation);
  const exportJSON = useIntlQuotationStore((s) => s.exportJSON);
  const importJSON = useIntlQuotationStore((s) => s.importJSON);
  const fileRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingQueryId = searchParams.get("id");
  const copyingQueryId = searchParams.get("copyId");
  const loadingQueryId = editingQueryId ?? copyingQueryId;
  const activeEditingId = editingQueryId ? editingId : null;

  useEffect(() => {
    if (!loadingQueryId) {
      return;
    }
    let active = true;
    void api.get<{ ok: true; data: ManagedQuotation }>(`/api/quotations/${encodeURIComponent(loadingQueryId)}`)
      .then((result) => {
        if (!active) return;
        if (result.data.market !== "international") throw new Error("This quotation is not an international quotation");
        replaceQuotation(copyingQueryId ? prepareQuotationCopy(result.data.quotation) : result.data.quotation);
        setEditingId(copyingQueryId ? null : result.data.id);
      })
      .catch((err: unknown) => {
        if (active) messageApi.error(err instanceof Error ? err.message : "Failed to load quotation");
      });
    return () => { active = false; };
  }, [copyingQueryId, loadingQueryId, messageApi, replaceQuotation]);

  const confirmTierValidation = useCallback(async (): Promise<boolean> => {
    return confirmTierPricing(quotation.products, "en");
  }, [quotation.products]);

  const handleExportPDF = useCallback(async () => {
    if (!previewRef.current) return;

    const hasCustomer = quotation.customer.name.trim() !== "";
    const hasPrice = quotation.products.some((product) => product.tierPricingEnabled
      ? product.tiers?.some((tier) => tier.price > 0)
      : (product.price ?? 0) > 0);
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
    if (!await confirmTierValidation()) return;

    try {
      await exportPDFIntl(previewRef.current, quotation);

      messageApi.success("PDF exported");
    } catch (err) {
      console.error("PDF export failed:", err);
      const msg = err instanceof Error ? err.message : "PDF export failed, please try again";
      messageApi.error(msg);
    }
  }, [confirmTierValidation, quotation, messageApi]);

  const handleSubmit = async () => {
    const hasCustomer = quotation.customer.name.trim() !== "";
    const hasQuoteNo = quotation.quoteMeta.no.trim() !== "";
    const hasProduct = quotation.products.length > 0 && quotation.products.every((product) => product.name.trim() !== "");
    if (!hasCustomer || !hasQuoteNo || !hasProduct) {
      Modal.warning({
        title: "Incomplete quotation",
        content: [!hasQuoteNo && "Quotation number is required", !hasCustomer && "Customer name is required", !hasProduct && "Every product needs a name"]
          .filter(Boolean)
          .join("; "),
        okText: "OK",
      });
      return;
    }
    if (!await confirmTierValidation()) return;
    try {
      const payload = { market: "international" as const, quotation };
      const result = activeEditingId
        ? await api.put<{ ok: true; data: ManagedQuotation }>(`/api/quotations/${encodeURIComponent(activeEditingId)}`, payload)
        : await api.post<{ ok: true; data: ManagedQuotation }>("/api/quotations", payload);
      setEditingId(result.data.id);
      setSearchParams({ id: result.data.id });
      messageApi.success(activeEditingId ? "Quotation updated and submitted" : "Quotation submitted");
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "Quotation submission failed");
    }
  };

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
        setEditingId(null);
        setSearchParams({});
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
          {copyingQueryId ? "Copied Quotation (New Quote)" : "Intl. Quotation Editor"}
        </span>
        <Space size={isMobile ? 4 : "small"}>
          <Button size="small" icon={<FileAddOutlined />} onClick={() => {
            if (window.confirm("Create a new quotation? Unsaved changes will be lost.")) {
              resetToSample();
              setEditingId(null);
              setSearchParams({});
            }
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
          <Button type="primary" size="small" icon={<CloudUploadOutlined />} onClick={() => void handleSubmit()}>
            {!isMobile && (activeEditingId ? "Update Quote" : "Submit Quote")}
          </Button>
          <Button type="primary" size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF}>
            {!isMobile && "Export PDF"}
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
    </div>
  );
}
