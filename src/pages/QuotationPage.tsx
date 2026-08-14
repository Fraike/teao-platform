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
import { DomesticCustomerCard } from "../components/CustomerCard";
import { DomesticQuoteMetaCard } from "../components/QuoteMetaCard";
import ProductCard from "../components/ProductCard";
import TermsCard from "../components/TermsCard";
import MoldCard from "../components/MoldCard";
import ExportSettingsCard from "../components/ExportSettingsCard";
import PreviewPanel from "../components/PreviewPanel";
import { prepareQuotationCopy, useQuotationStore } from "../lib/store";
import { exportPDF } from "../lib/pdf";
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

export default function QuotationPage({ headerHeight }: Props) {
  const isMobile = useIsMobile();
  const previewRef = useRef<HTMLDivElement>(null);
  const quotation = useQuotationStore((s) => s.quotation);
  const resetToSample = useQuotationStore((s) => s.resetToSample);
  const replaceQuotation = useQuotationStore((s) => s.replaceQuotation);
  const exportJSON = useQuotationStore((s) => s.exportJSON);
  const importJSON = useQuotationStore((s) => s.importJSON);
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
        if (result.data.market !== "domestic") throw new Error("该报价不属于国内报价");
        replaceQuotation(copyingQueryId ? prepareQuotationCopy(result.data.quotation) : result.data.quotation);
        setEditingId(copyingQueryId ? null : result.data.id);
      })
      .catch((err: unknown) => {
        if (active) messageApi.error(err instanceof Error ? err.message : "报价读取失败");
      });
    return () => { active = false; };
  }, [copyingQueryId, loadingQueryId, messageApi, replaceQuotation]);

  const confirmTierValidation = useCallback(async (): Promise<boolean> => {
    return confirmTierPricing(quotation.products, "zh");
  }, [quotation.products]);

  const handleExportPDF = useCallback(async () => {
    if (!previewRef.current) return;

    const hasCustomer = quotation.customer.name.trim() !== "";
    const hasPrice = quotation.products.some((p) => p.tierPricingEnabled
      ? p.tiers?.some((tier) => tier.price > 0)
      : (p.price ?? 0) > 0);
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
    if (!await confirmTierValidation()) return;

    try {
      await exportPDF(previewRef.current, quotation);

      messageApi.success("PDF 导出成功");
    } catch (err) {
      console.error("PDF export failed:", err);
      const msg = err instanceof Error ? err.message : "PDF 导出失败，请重试";
      messageApi.error(msg);
    }
  }, [confirmTierValidation, quotation, messageApi]);

  const handleSubmit = async () => {
    const hasCustomer = quotation.customer.name.trim() !== "";
    const hasQuoteNo = quotation.quoteMeta.no.trim() !== "";
    const hasProduct = quotation.products.length > 0 && quotation.products.every((product) => product.name.trim() !== "");
    if (!hasCustomer || !hasQuoteNo || !hasProduct) {
      Modal.warning({
        title: "报价信息不完整",
        content: [!hasQuoteNo && "报价单号不能为空", !hasCustomer && "客户名称不能为空", !hasProduct && "产品名称不能为空"]
          .filter(Boolean)
          .join("；"),
        okText: "知道了",
      });
      return;
    }
    if (!await confirmTierValidation()) return;
    try {
      const payload = { market: "domestic" as const, quotation };
      const result = activeEditingId
        ? await api.put<{ ok: true; data: ManagedQuotation }>(`/api/quotations/${encodeURIComponent(activeEditingId)}`, payload)
        : await api.post<{ ok: true; data: ManagedQuotation }>("/api/quotations", payload);
      setEditingId(result.data.id);
      setSearchParams({ id: result.data.id });
      messageApi.success(activeEditingId ? "报价已更新并提交后台" : "报价已提交后台");
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "报价提交失败");
    }
  };

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
        setEditingId(null);
        setSearchParams({});
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
          {copyingQueryId ? "复制报价单（新报价）" : "报价单编辑"}
        </span>
        <Space size={isMobile ? 4 : "small"}>
          <Button size="small" icon={<FileAddOutlined />} onClick={() => {
            if (window.confirm("确定新建报价单？")) {
              resetToSample();
              setEditingId(null);
              setSearchParams({});
            }
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
          <Button type="primary" size="small" icon={<CloudUploadOutlined />} onClick={() => void handleSubmit()}>
            {!isMobile && (activeEditingId ? "更新报价" : "提交报价")}
          </Button>
          <Button type="primary" size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF}>
            {!isMobile && "导出 PDF"}
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
          <DomesticCustomerCard />
          <DomesticQuoteMetaCard />
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
    </div>
  );
}
