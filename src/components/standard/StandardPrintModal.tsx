import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Modal, Progress, Segmented, Select, Space, Table, Tag, message } from "antd";
import { FileExcelOutlined, PrinterOutlined } from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { api } from "../../lib/api";
import { exportStandardExcel } from "../../lib/standardExcel";
import { buildStandardPrintHtml, loadStandardPrintProducts } from "../../lib/standardPrint";
import { standardStatusColor } from "../../lib/standardFormat";
import { STANDARD_STATUS_LABELS } from "../../types/standard";
import type { StandardListItem, StandardPageResponse } from "../../types/standard";
import type { StandardPrintModalProps, StandardPrintDetailResponse, StandardOutputAction } from "../../types/standardPrint";
import { StandardFilterInput } from "./StandardFilterInput";
import styles from "./StandardPrintModal.module.css";

function activatePrinting(preview: Window) {
  const document = preview.document;
  const button = document.getElementById("print-document") as HTMLButtonElement;
  const label = document.getElementById("print-ready")!;
  const link = document.getElementById("print-styles") as HTMLLinkElement;
  button.addEventListener("click", () => preview.print());
  const ready = () => { button.disabled = false; label.textContent = "可预览后打印，或在打印窗口选择“另存为 PDF”"; };
  link.addEventListener("load", ready, { once: true });
  link.addEventListener("error", () => { label.textContent = "打印样式加载失败，请关闭窗口后重新生成"; }, { once: true });
  if (link.sheet) ready();
}

export function StandardPrintModal({ categories, currentCategory, currentRows, onClose }: StandardPrintModalProps) {
  const [initialRows] = useState(currentRows);
  const [scope, setScope] = useState("current");
  const [mode, setMode] = useState("all");
  const [rows, setRows] = useState(currentRows);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [action, setAction] = useState<StandardOutputAction | null>(null);
  const generating = action !== null;
  const [progress, setProgress] = useState(0);
  const listRequest = useRef<AbortController | null>(null);
  const printRequest = useRef<AbortController | null>(null);
  const preparingWindow = useRef<Window | null>(null);
  useEffect(() => () => { listRequest.current?.abort(); printRequest.current?.abort(); preparingWindow.current?.close(); }, []);
  const searched = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return rows.filter(row => !term || [row.serialNo, row.customer, row.model, row.categoryName].some(value => value.toLocaleLowerCase().includes(term)));
  }, [rows, query]);
  const chosen = useMemo(() => { const ids = new Set(selected); return mode === "all" ? rows : rows.filter(row => ids.has(row.id)); }, [mode, rows, selected]);
  const chosenIds = useMemo(() => new Set(selected), [selected]);
  const checkedCount = searched.filter(row => chosenIds.has(row.id)).length;

  const changeScope = async (value: string) => {
    listRequest.current?.abort();
    const controller = new AbortController();listRequest.current = controller;
    setScope(value);setSelected([]);setQuery("");setLoadError("");
    if (value === "current") { setRows(initialRows);setLoading(false);return; }
    setRows([]);setLoading(true);
    try {
      const all: StandardListItem[] = [];
      for (const category of categories) {
        const params = new URLSearchParams({ category: category.key, all: "true", excludeObsolete: "true" });
        const response = await api.get<StandardPageResponse>(`/api/standards?${params}`, { signal: controller.signal });
        controller.signal.throwIfAborted();all.push(...response.data);
      }
      setRows(all);
    } catch (error) { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "标准读取失败，请重试"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };

  const generate = async (target: StandardOutputAction) => {
    if (!chosen.length || generating || printRequest.current) return;
    let preview: Window | null = null;
    if (target === "print") {
      preview = window.open("", "_blank", "width=1050,height=850");
      if (!preview) { message.warning("浏览器拦截了预览窗口，请允许本站弹出窗口后重试");return; }
      preview.opener = null;
      preview.document.write('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>正在生成产品标准</title><body><p>正在准备生产规格，请稍候。可在原页面取消生成。</p></body></html>');preview.document.close();
    }
    const controller = new AbortController();printRequest.current = controller;preparingWindow.current = preview;
    setAction(target);setProgress(0);
    const closedCheck = preview ? setInterval(() => { if (preview.closed) controller.abort(); }, 300) : undefined;
    try {
      const products = await loadStandardPrintProducts(chosen, async (id, signal) => {
        const suffix = target === "excel" ? "&comments=current" : "";
        const response = await api.get<StandardPrintDetailResponse>(`/api/standards/${encodeURIComponent(id)}?summary=true${suffix}`, { signal });
        if (target === "excel" && response.currentCommentsIncluded !== true) throw new Error("后端服务尚未更新，无法保证 Excel 批注完整；请更新并重启后端后重试");
        return response.data;
      }, controller.signal, setProgress);
      controller.signal.throwIfAborted();
      if (target === "excel") await exportStandardExcel(products, categories, controller.signal);
      else if (preview) {
        const html = buildStandardPrintHtml(products, categories, { generatedAt: new Date().toISOString(), styleUrl: new URL("../../lib/standardPrint.css", import.meta.url).href });
        preview.document.open();preview.document.write(html);preview.document.close();activatePrinting(preview);
      }
      preparingWindow.current = null;onClose();
    } catch (error) {
      controller.abort();preview?.close();
      if (!(error instanceof DOMException && error.name === "AbortError")) message.error(error instanceof Error ? error.message : "导出或打印失败");
    } finally { clearInterval(closedCheck);printRequest.current = null;setAction(null); }
  };
  const toggleSearch = (checked: boolean) => setSelected(previous => {
    const ids = new Set(previous);
    for (const row of searched) { if (checked) ids.add(row.id);else ids.delete(row.id); }
    return [...ids];
  });
  const columns: TableColumnsType<StandardListItem> = [
    { title: "序号", dataIndex: "serialNo", width: 150 }, { title: "客户", dataIndex: "customer" },
    { title: "产品型号", dataIndex: "model", width: 170 },
    ...(scope === "all" ? [{ title: "分类", dataIndex: "categoryName", width: 120 }] : []),
    { title: "版本 / 状态", width: 150, render: (_, row) => <Space size={4}>V{row.versionNo}<Tag color={standardStatusColor(row.status)}>{STANDARD_STATUS_LABELS[row.status]}</Tag></Space> },
  ];
  return <Modal open title="导出 / 打印产品标准" width={960} onCancel={onClose} footer={<Space wrap>
    <Button onClick={onClose}>{generating ? "取消生成" : "取消"}</Button>
    <Button icon={<PrinterOutlined />} loading={action === "print"} disabled={loading || Boolean(loadError) || !chosen.length || action === "excel"} onClick={() => void generate("print")}>打印 / PDF（{chosen.length} 条）</Button>
    <Button type="primary" icon={<FileExcelOutlined />} loading={action === "excel"} disabled={loading || Boolean(loadError) || !chosen.length || action === "print"} onClick={() => void generate("excel")}>导出 Excel（{chosen.length} 条）</Button>
  </Space>}>
    <div className={styles.settings}>
      <section className={styles.setting} aria-label="数据范围">
        <h4><span className={styles.step}>1</span>数据范围</h4>
        <Select className={styles.scopeSelect} aria-label="分类范围" value={scope} disabled={generating} onChange={value => void changeScope(value)} options={[{ value: "current", label: `${categories.find(category => category.key === currentCategory)?.name || "当前分类"} · 当前筛选结果` }, { value: "all", label: "全部分类（不含停用）" }]} />
        <p>先确定从哪些分类读取产品数据。</p>
      </section>
      <section className={styles.setting} aria-label="产品选择">
        <h4><span className={styles.step}>2</span>产品选择</h4>
        <Segmented aria-label="产品选择方式" value={mode} disabled={generating || loading} onChange={value => setMode(String(value))} options={[{ value: "all", label: "全部产品" }, { value: "selected", label: "勾选指定产品" }]} />
        <p>再决定全部处理，还是逐项勾选产品。</p>
      </section>
    </div>
    <div className={styles.outputHints}>
      <span><FileExcelOutlined /> <strong>Excel</strong> 全规格属性、版本信息、原始批注</span>
      <span><PrinterOutlined /> <strong>打印 / PDF</strong> 产品信息和生产规格，隐藏审核流程</span>
    </div>
    <p className={styles.hint}>草稿、待审核和停用状态会注明，不可用于生产。以下选择同时用于 Excel 导出和打印。</p>
    {loadError && <Alert type="error" message={loadError} action={<Button size="small" onClick={() => void changeScope(scope)}>重试</Button>} />}
    {mode === "selected" ? <>
      <div className={styles.selection}>
        <StandardFilterInput className={styles.search} allowClear placeholder="搜索序号、客户、型号" onApply={setQuery} initialValue={query} resetVersion={scope === "current" ? 0 : 1} />
        <Checkbox checked={Boolean(searched.length) && checkedCount === searched.length} indeterminate={checkedCount > 0 && checkedCount < searched.length} disabled={generating || loading} onChange={event => toggleSearch(event.target.checked)}>全选搜索结果</Checkbox>
        <span className={styles.count}>已选 {chosen.length} / {rows.length} 条</span>
      </div>
      <Table className={styles.table} size="small" rowKey="id" loading={loading} dataSource={searched} columns={columns} scroll={{ x: 700 }}
        rowSelection={{ preserveSelectedRowKeys: true, selectedRowKeys: selected, onChange: keys => setSelected(keys.map(String)), getCheckboxProps: () => ({ disabled: generating }) }}
        pagination={{ pageSize: 8, showSizeChanger: false, showTotal: total => `搜索结果 ${total} 条` }} />
    </> : <p className={styles.hint}>{loading ? "正在读取各分类标准…" : `将导出 ${rows.length} 条产品标准，可选择导出完整 Excel，或打印生产规格。`}</p>}
    {generating && <div className={styles.progress}><Progress percent={Math.round(progress / chosen.length * 100)} size="small" />已读取 {progress} / {chosen.length} 条，正在准备所选产品…</div>}
  </Modal>;
}
