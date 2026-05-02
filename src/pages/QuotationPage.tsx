import { useRef, useCallback } from "react";
import { Button, Space, message } from "antd";
import {
  FilePdfOutlined,
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  FileAddOutlined,
} from "@ant-design/icons";
import CustomerCard from "../components/CustomerCard";
import QuoteMetaCard from "../components/QuoteMetaCard";
import ProductCard from "../components/ProductCard";
import TermsCard from "../components/TermsCard";
import ExportSettingsCard from "../components/ExportSettingsCard";
import PreviewPanel from "../components/PreviewPanel";
import { useQuotationStore } from "../lib/store";
import { exportPDF } from "../lib/pdf";
import { useIsMobile } from "../lib/useIsMobile";

interface Props {
  headerHeight: number;
}

export default function QuotationPage({ headerHeight }: Props) {
  const isMobile = useIsMobile();
  const previewRef = useRef<HTMLDivElement>(null);
  const quotation = useQuotationStore((s) => s.quotation);
  const resetToSample = useQuotationStore((s) => s.resetToSample);
  const exportJSON = useQuotationStore((s) => s.exportJSON);
  const importJSON = useQuotationStore((s) => s.importJSON);
  const fileRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const handleExportPDF = useCallback(async () => {
    if (!previewRef.current) return;
    try {
      await exportPDF(previewRef.current, quotation);
      messageApi.success("PDF 导出成功");
    } catch (err) {
      console.error("PDF export failed:", err);
      messageApi.error("PDF 导出失败，请重试");
    }
  }, [quotation, messageApi]);

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
        </Space>
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
        {/* 左侧录入区 */}
        <div
          style={{
            width: isMobile ? "100%" : "40%",
            minWidth: isMobile ? 0 : 420,
            maxWidth: isMobile ? undefined : 560,
            overflowY: "auto",
            padding: isMobile ? "12px" : "16px 20px",
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
              padding: "28px 20px",
            }}
          >
            <div
              style={{
                boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
                borderRadius: 2,
                height: "fit-content",
              }}
            >
              <PreviewPanel ref={previewRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
