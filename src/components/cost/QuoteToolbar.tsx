import { useRef } from "react";
import { Button, Space } from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  SaveOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useQuoteStore } from "../../lib/costStore";

export default function QuoteToolbar() {
  const resetToExample = useQuoteStore((s) => s.resetToExample);
  const exportJSON = useQuoteStore((s) => s.exportJSON);
  const importJSON = useQuoteStore((s) => s.importJSON);
  const saveQuote = useQuoteStore((s) => s.saveQuote);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quote-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => fileRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importJSON(reader.result as string);
      if (!ok) alert("导入失败：文件格式不正确");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Space size="small">
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileChange} />
      <Button size="small" icon={<UploadOutlined />} onClick={handleImport}>
        导入 JSON
      </Button>
      <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
        导出 JSON
      </Button>
      <Button size="small" icon={<SaveOutlined />} onClick={saveQuote}>
        保存
      </Button>
      <Button
        size="small"
        icon={<ReloadOutlined />}
        onClick={() => {
          if (window.confirm("确定要重置为示例数据吗？当前数据将丢失。")) {
            resetToExample();
          }
        }}
      >
        重置示例
      </Button>
    </Space>
  );
}
