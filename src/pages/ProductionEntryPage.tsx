import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Card, Button, DatePicker, Select, Input, Tag,
  Space, Spin, message, Popconfirm, Tooltip,
  Modal, Form, InputNumber, Popover,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined, HistoryOutlined,
  SaveOutlined, CopyOutlined, FilterOutlined, FileTextOutlined,
  DownloadOutlined, UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api, getToken } from "../lib/api";
import type { ProductionRecord, DailyGroup, ProductionQueryResponse, AuditLog } from "../types/production";
import { PROCESS_FIELDS } from "../types/production";
import { EntryDrawer } from "../components/production/EntryDrawer";
import { EditableCell } from "../components/production/EditableCell";
import { ProductionImportModal } from "../components/production/ProductionImportModal";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { exportProductionExcel, type ExportColumn } from "../lib/productionExcel";
import { getCustomerOptions, getFinishedProductOptions } from "../lib/productionReferenceData";
import styles from "./ProductionEntryPage.module.css";

const { RangePicker } = DatePicker;
const PAGE_SIZE = 10;
const PROCESS_COLORS = ["#1677ff", "#52c41a", "#13c2c2", "#2f54eb", "#722ed1", "#fa8c16", "#eb2f96"];
const STAFF_COLORS = ["blue", "green", "cyan", "orange", "purple", "lime", "gold"];

function StaffTags({ text }: { text: string }) {
  if (!text) return <span style={{ color: "#ccc" }}>-</span>;
  if (text === "外发") return <Tag color="default" style={{ margin: 0, fontSize: 11 }}>外发</Tag>;
  const names = text.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return <span style={{ color: "#ccc" }}>-</span>;
  const shown = names.slice(0, 3);
  const hidden = names.slice(3);
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
      {shown.map((name, i) => (
        <Tag key={i} color={STAFF_COLORS[i % STAFF_COLORS.length]} style={{ margin: "0 1px", fontSize: 11, lineHeight: "16px", padding: "0 3px" }}>
          {name}
        </Tag>
      ))}
      {hidden.length > 0 && (
        <Popover key="more" content={hidden.join("、")} title="更多">
          <Tag style={{ margin: "0 1px", fontSize: 11, cursor: "pointer", padding: "0 3px" }}>+{hidden.length}</Tag>
        </Popover>
      )}
    </span>
  );
}

function BatchText({ text }: { text: string }) {
  if (!text) return <span style={{ color: "#ccc" }}>-</span>;
  const firstLine = text.split("\n")[0].trim();
  if (text === firstLine) return <span style={{ fontSize: 11 }}>{firstLine.length > 20 ? firstLine.slice(0, 20) + "…" : firstLine}</span>;
  return (
    <Popover content={<div style={{ maxWidth: 360, whiteSpace: "pre-wrap", fontSize: 12 }}>{text}</div>} title="原材料批号">
      <span style={{ fontSize: 11, cursor: "pointer", color: "#1677ff" }}>
        {firstLine.length > 18 ? firstLine.slice(0, 18) + "…" : firstLine}
        <FileTextOutlined style={{ marginLeft: 3, fontSize: 11 }} />
      </span>
    </Popover>
  );
}

const ASSEMBLY_DETAIL_COLUMNS: ExportColumn[] = [
  { key: "date", title: "日期" }, { key: "line", title: "产线" }, { key: "customer", title: "客户名称" }, { key: "spec", title: "规格" }, { key: "productName", title: "品名" }, { key: "materialBatch", title: "原材料批号" }, { key: "workHours", title: "工时" }, { key: "productionBatch", title: "生产批号" }, { key: "orderQty", title: "订单数量", format: "#,##0" }, { key: "planQty", title: "计划生产", format: "#,##0" }, { key: "dailyQty", title: "当天生产", format: "#,##0" }, { key: "achievementRate", title: "达成率", format: "0.0%" }, { key: "cumulativeQty", title: "累计生产", format: "#,##0" }, { key: "defects", title: "不良数", format: "#,##0" }, { key: "qualifiedRate", title: "合格率", format: "0.0%" }, { key: "ppm", title: "PPM", format: "#,##0" }, { key: "backorder", title: "欠数", format: "#,##0" },
  ...PROCESS_FIELDS.map((field) => ({ key: field.key, title: field.label })), { key: "filler", title: "填表人" }, { key: "remark", title: "备注" }, { key: "updatedBy", title: "编辑人" }, { key: "createdAt", title: "创建时间" },
];
const ASSEMBLY_SUMMARY_COLUMNS: ExportColumn[] = [
  { key: "date", title: "日期" }, { key: "lines", title: "产线数" }, { key: "totalOrderQty", title: "订单数量", format: "#,##0" }, { key: "totalPlanQty", title: "计划生产", format: "#,##0" }, { key: "totalDailyQty", title: "当天生产", format: "#,##0" }, { key: "totalCumulativeQty", title: "累计生产", format: "#,##0" }, { key: "totalDefects", title: "不良数", format: "#,##0" }, { key: "achievementRate", title: "达成率", format: "0.0%" }, { key: "qualifiedRate", title: "合格率", format: "0.0%" }, { key: "totalBackorder", title: "欠数", format: "#,##0" },
];

export function ProductionEntryPage() {
  // ---- 所有筛选条件使用本地状态，点击"搜索"才提交 ----
  const [fDateFrom, setFDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 9); return d.toISOString().slice(0, 10); });
  const [fDateTo, setFDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [fLine, setFLine] = useState<string | null>(null);
  const [fProduct, setFProduct] = useState("");
  const [fCustomer, setFCustomer] = useState("");
  const [fSearch, setFSearch] = useState("");

  // 已提交的筛选值（用于实际查询）
  const [activeFilters, setActiveFilters] = useState({ dateFrom: fDateFrom, dateTo: fDateTo, line: fLine, product: fProduct, customer: fCustomer, search: fSearch });

  const [groups, setGroups] = useState<DailyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [copyFromRecord, setCopyFromRecord] = useState<ProductionRecord | null>(null);
  const [defaultDate, setDefaultDate] = useState("");
  const offsetRef = useRef(0);
  const groupsRef = useRef<DailyGroup[]>([]);

  const [quickDate, setQuickDate] = useState<Record<string, boolean>>({});
  const [quickForm] = Form.useForm();
  const [quickSaving, setQuickSaving] = useState(false);
  const [materials, setMaterials] = useState<{ value: string; label: string; spec?: string }[]>([]);
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<AuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyCacheRef = useRef(new Map<number, AuditLog[]>());

  useEffect(() => { groupsRef.current = groups; }, [groups]);

  // 加载关联数据
  useEffect(() => {
    Promise.allSettled([
      getFinishedProductOptions(),
      getCustomerOptions(),
      api.get<{ ok: boolean; data: string[] }>("/api/production/lines"),
    ]).then(([mRes, cRes, lRes]) => {
      if (mRes.status === "fulfilled") setMaterials(mRes.value);
      if (cRes.status === "fulfilled") setCustomers(cRes.value);
      if (lRes.status === "fulfilled" && lRes.value.ok)
        setLines(lRes.value.data.filter((l: string) => l && !l.includes("组装线")));
    });
  }, []);

  // 点击搜索 → 提交所有筛选条件
  const doSearch = () => {
    setActiveFilters({ dateFrom: fDateFrom, dateTo: fDateTo, line: fLine, product: fProduct, customer: fCustomer, search: fSearch });
  };

  const doReset = () => {
    const df = (() => { const d = new Date(); d.setDate(d.getDate() - 9); return d.toISOString().slice(0, 10); })();
    const dt = new Date().toISOString().slice(0, 10);
    setFDateFrom(df); setFDateTo(dt); setFLine(null); setFProduct(""); setFCustomer(""); setFSearch("");
    setActiveFilters({ dateFrom: df, dateTo: dt, line: null, product: "", customer: "", search: "" });
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(activeFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await api.get<{ ok: boolean; data: { groups: DailyGroup[] } }>(`/api/production/entries/export?${params.toString()}`);
      await exportProductionExcel(`装配部生产日报_${activeFilters.dateFrom}_${activeFilters.dateTo}.xlsx`, response.data.groups, ASSEMBLY_DETAIL_COLUMNS, ASSEMBLY_SUMMARY_COLUMNS);
      message.success(`已导出 ${response.data.groups.length} 天生产日报`);
    } catch (error) { message.error(error instanceof Error ? error.message : "导出失败"); }
    finally { setExporting(false); }
  };

  const fetchData = useCallback(async (append: boolean) => {
    setLoading(true); const curr = append ? offsetRef.current : 0;
    try {
      const af = activeFilters;
      const p = new URLSearchParams();
      if (af.dateFrom) p.set("dateFrom", af.dateFrom); if (af.dateTo) p.set("dateTo", af.dateTo);
      if (af.line) p.set("line", af.line);
      if (af.product) p.set("product", af.product);
      if (af.customer) p.set("customer", af.customer);
      if (af.search) p.set("search", af.search);
      p.set("limit", String(PAGE_SIZE)); p.set("offset", String(curr));
      const r = await api.get<ProductionQueryResponse>(`/api/production/entries?${p.toString()}`);
      if (!r || !r.data) { console.error("API response missing data:", r); message.error("数据格式异常"); return; }
      const d = r.data;
      setGroups(append ? [...groupsRef.current, ...d.groups] : d.groups);
      setTotal(d.total); setHasMore(d.hasMore);
      offsetRef.current = curr + PAGE_SIZE;
    } catch (err) { console.error("fetchData error:", err); message.error("加载数据失败"); }
    finally { setLoading(false); }
  }, [activeFilters]);

  // activeFilters 变化 → 重新加载
  useEffect(() => { void Promise.resolve().then(() => { offsetRef.current = 0; return fetchData(false); }); }, [fetchData]);

  const cellSave = useCallback(async (rec: ProductionRecord, field: keyof ProductionRecord, val: string | number) => {
    try {
      await api.put(`/api/production/entries/${rec.id}`, { [field]: val });
      historyCacheRef.current.delete(rec.id);
      setGroups((prev) => prev.map((g) => ({
        ...g, records: g.records.map((r) => r.id === rec.id ? { ...r, [field]: val } : r),
      })));
    } catch { message.error("更新失败"); }
  }, []);

  const add = useCallback((date?: string) => { setEditingRecord(null); setCopyFromRecord(null); setDefaultDate(date || fDateTo); setDrawerOpen(true); }, [fDateTo]);
  const edit = useCallback((rec: ProductionRecord) => { setEditingRecord(rec); setCopyFromRecord(null); setDefaultDate(""); setDrawerOpen(true); }, []);
  const copy = useCallback((rec: ProductionRecord) => { setEditingRecord(null); setCopyFromRecord(rec); setDefaultDate(""); setDrawerOpen(true); }, []);
  const del = useCallback(async (id: number) => {
    try { await api.delete(`/api/production/entries/${id}`); historyCacheRef.current.delete(id); message.success("已删除"); offsetRef.current = 0; fetchData(false); }
    catch { message.error("删除失败"); }
  }, [fetchData]);
  const onDrawerClose = (saved: boolean) => {
    setDrawerOpen(false); setEditingRecord(null); setCopyFromRecord(null);
    if (saved) { historyCacheRef.current.clear(); offsetRef.current = 0; fetchData(false); }
  };
  const showHistory = useCallback(async (id: number) => {
    setHistoryOpen(true); setHistoryLoading(true); setHistoryData([]);
    const cached = historyCacheRef.current.get(id);
    if (cached) { setHistoryData(cached); setHistoryLoading(false); return; }
    try {
      const tk = getToken();
      const r = await fetch(`/api/production/entries/${id}/history`, { headers: tk ? { Authorization: `Bearer ${tk}` } : {} });
      const d = await r.json();
      if (d.ok) { historyCacheRef.current.set(id, d.data); setHistoryData(d.data); }
    } catch { message.error("加载失败"); }
    finally { setHistoryLoading(false); }
  }, []);
  const toggleQuick = (date: string) => { setQuickDate((prev) => ({ ...prev, [date]: !prev[date] })); quickForm.resetFields(); };
  const quickSave = async (date: string) => {
    try {
      const v = await quickForm.validateFields(); setQuickSaving(true);
      await api.post("/api/production/entries", {
        date, line: v.line, productName: v.productName, customer: v.customer,
        dailyQty: v.dailyQty || 0, planQty: v.planQty || 0, orderQty: v.orderQty || 0,
        cumulativeQty: v.cumulativeQty || 0, defects: v.defects || 0,
        productionBatch: v.productionBatch || "", spec: v.spec || "", workHours: v.workHours || 10,
      });
      message.success("已保存"); quickForm.resetFields();
      setQuickDate((prev) => ({ ...prev, [date]: false })); offsetRef.current = 0; fetchData(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      message.error((err as Error).message || "保存失败");
    } finally { setQuickSaving(false); }
  };

  const flm: Record<string, string> = {
    date: "日期", line: "产线", customer: "客户", spec: "规格",
    product_name: "品名", material_batch: "原材料批号", work_hours: "工作时间",
    production_batch: "生产批号", order_qty: "订单数量", daily_qty: "当天生产数量",
    plan_qty: "计划生产数量", cumulative_qty: "实际生产数量（累计生产）", defects: "不良数",
    oil_injection: "注油", rubber_ring: "装胶圈", capping: "盖盖子",
    shaft_core: "放轴芯", ultrasonic: "超声", testing: "测试", gear: "装齿轮",
    filler: "填表人", remark: "备注",
  };

  const rowCls = (_: unknown, i: number) => i % 2 === 0 ? "table-row-even" : "table-row-odd";

  const columns = useMemo<ColumnsType<ProductionRecord & { key: number }>>(() => [
    { title: "产线", dataIndex: "line", key: "ln", width: 42, fixed: "left",
      render: (v: string) => <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{v}</span> },
    { title: "日期", dataIndex: "date", key: "dt", width: 76, fixed: "left",
      render: (v: string) => <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{v}</span> },
    { title: "客户名称", dataIndex: "customer", key: "cs", width: 72,
      render: (v: string) => <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{v}</Tag> },
    { title: "规格", dataIndex: "spec", key: "sp", width: 66, ellipsis: true },
    { title: "品名", dataIndex: "productName", key: "pn", width: 140, ellipsis: true,
      render: (v: string) => <Tooltip title={v} placement="topLeft"><span style={{ fontSize: 12 }}>{v}</span></Tooltip> },
    { title: "原材料批号", dataIndex: "materialBatch", key: "mb", width: 50, align: "center" as const,
      render: (v: string) => <BatchText text={v} /> },
    { title: "工时", dataIndex: "workHours", key: "wh", width: 42, align: "center" as const,
      render: (v: number) => v ? <span style={{ fontSize: 12 }}>{v}h</span> : "-" },
    { title: "生产批号", dataIndex: "productionBatch", key: "pb", width: 92, ellipsis: true,
      render: (v: string) => v ? <Tooltip title={v}><span style={{ fontSize: 12 }}>{v}</span></Tooltip> : "-" },
    { title: "订单数量", dataIndex: "orderQty", key: "oq", width: 62, align: "right" as const,
      render: (v: number) => <span style={{ fontSize: 12 }}>{v?.toLocaleString() || "-"}</span> },
    { title: "计划生产", dataIndex: "planQty", key: "pq", width: 62, align: "right" as const,
      render: (v: number) => <span style={{ fontSize: 12 }}>{v?.toLocaleString() || "-"}</span> },
    { title: "当天生产", dataIndex: "dailyQty", key: "dq", width: 72, align: "right" as const,
      render: (_v: unknown, rec: ProductionRecord) => (
        <EditableCell value={rec.dailyQty} fieldType="number" onSave={(v) => cellSave(rec, "dailyQty", v)}
          format={(v) => <span style={{ fontWeight: 700, color: "#1677ff", fontSize: 12 }}>{(v as number)?.toLocaleString() || "-"}</span>} />
      ), },
    { title: "达成率", dataIndex: "achievementRate", key: "ar", width: 56, align: "center" as const,
      render: (v: number | null) => v != null
        ? <Tag color={v >= 1 ? "success" : v >= 0.9 ? "warning" : "error"} style={{ margin: 0, fontSize: 11, padding: "0 3px" }}>{(v * 100).toFixed(0)}%</Tag> : "-" },
    { title: "累计生产", dataIndex: "cumulativeQty", key: "cq", width: 66, align: "right" as const,
      render: (v: number) => <span style={{ fontSize: 12 }}>{v?.toLocaleString() || "-"}</span> },
    { title: "不良", dataIndex: "defects", key: "df", width: 44, align: "right" as const,
      render: (_v: unknown, rec: ProductionRecord) => (
        <EditableCell value={rec.defects} fieldType="number" onSave={(v) => cellSave(rec, "defects", v)}
          format={(v) => (v as number) > 0 ? <span style={{ color: "#ff4d4f", fontWeight: 600, fontSize: 12 }}>{v}</span> : <span style={{ fontSize: 12, color: "#ccc" }}>0</span>} />
      ), },
    { title: "合格率", dataIndex: "qualifiedRate", key: "qr", width: 56, align: "center" as const,
      render: (v: number | null) => v != null
        ? <Tag color={v >= 0.95 ? "success" : v >= 0.9 ? "warning" : "error"} style={{ margin: 0, fontSize: 11, padding: "0 3px" }}>{(v * 100).toFixed(1)}%</Tag> : "-" },
    { title: "PPM", dataIndex: "ppm", key: "pm", width: 52, align: "right" as const,
      render: (v: number | null) => <span style={{ fontSize: 12 }}>{v != null ? v.toLocaleString() : "-"}</span> },
    { title: "欠数", dataIndex: "backorder", key: "bo", width: 52, align: "right" as const,
      render: (v: number) => v > 0
        ? <span style={{ color: "#faad14", fontWeight: 600, fontSize: 12 }}>{v.toLocaleString()}</span>
        : <span style={{ color: "#52c41a", fontSize: 12 }}>0</span> },
    ...[...PROCESS_FIELDS.map(({ key, label }, i) => ({
      title: <span style={{ fontSize: 11, color: PROCESS_COLORS[i] }}>{label}</span>,
      dataIndex: key as string, key: key as string, width: 68,
      render: (_v: unknown, rec: ProductionRecord) => (
        <EditableCell value={rec[key as keyof ProductionRecord] as string} fieldType="text"
          onSave={(v) => cellSave(rec, key as keyof ProductionRecord, v)}
          format={(v) => <StaffTags text={v as string} />} />
      ),
    })) as ColumnsType<ProductionRecord & { key: number }>],
    { title: "填表人", dataIndex: "filler", key: "fl", width: 56,
      render: (v: string) => v ? <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{v}</span> : "-" },
    { title: "备注", dataIndex: "remark", key: "rm", width: 80, ellipsis: true,
      render: (v: string) => v ? <Tooltip title={v}><span style={{ fontSize: 12 }}>{v}</span></Tooltip> : "-" },
    { title: "编辑人", dataIndex: "updatedBy", key: "ub", width: 56,
      render: (v: string) => <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{v || "-"}</span> },
    { title: "创建时间", dataIndex: "createdAt", key: "ca", width: 78,
      render: (v: string) => <span style={{ fontSize: 11, whiteSpace: "nowrap", color: "#999" }}>{v ? dayjs(v).format("MM-DD HH:mm") : "-"}</span> },
    { title: "操作", key: "ac", width: 118, fixed: "right",
      render: (_: unknown, rec: ProductionRecord) => (
        <Space size={0}>
          <Tooltip title="复制"><Button type="link" size="small" icon={<CopyOutlined style={{ fontSize: 12 }} />} onClick={() => copy(rec)} /></Tooltip>
          <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined style={{ fontSize: 12 }} />} onClick={() => edit(rec)} /></Tooltip>
          <Tooltip title="历史"><Button type="link" size="small" icon={<HistoryOutlined style={{ fontSize: 12 }} />} onClick={() => showHistory(rec.id)} /></Tooltip>
          <Popconfirm title="删除？" onConfirm={() => del(rec.id)}>
            <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ], [cellSave, copy, del, edit, showHistory]);

  return (
    <div className={styles.page}>
      {/* ===== 合并顶部栏 ===== */}
      <div className={styles.topBar}>
        <span className={styles.topTitle}>生产日报录入 — 装配部</span>
        <div className={styles.topFilters}>
          <FilterOutlined style={{ color: "#1677ff", fontSize: 14 }} />
          <RangePicker
            value={fDateFrom && fDateTo ? [dayjs(fDateFrom), dayjs(fDateTo)] : null}
            onChange={(dates) => { if (dates && dates[0] && dates[1]) { setFDateFrom(dates[0].format("YYYY-MM-DD")); setFDateTo(dates[1].format("YYYY-MM-DD")); } }}
            allowClear size="middle" style={{ width: 240 }} placeholder={["开始日期", "结束日期"]}
          />
          <Select placeholder="产线" value={fLine} onChange={setFLine} allowClear size="middle" style={{ width: 90 }}
            options={lines.map((l) => ({ value: l, label: l }))} />
          <Input placeholder="品名搜索" value={fProduct} onChange={(e) => setFProduct(e.target.value)} allowClear size="middle" style={{ width: 160 }}
            onPressEnter={doSearch} />
          <Input placeholder="客户名称" value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} allowClear size="middle" style={{ width: 140 }}
            onPressEnter={doSearch} />
          <Input placeholder="全局搜索（品名/客户/批号/备注）" value={fSearch} onChange={(e) => setFSearch(e.target.value)}
            allowClear size="middle" style={{ width: 240 }} prefix={<SearchOutlined />}
            onPressEnter={doSearch} />
          <Button type="primary" size="middle" icon={<SearchOutlined />} onClick={doSearch}>搜索</Button>
          <Button size="middle" onClick={doReset}>重置筛选</Button>
        </div>
        <div className={styles.topActions}>
          <Tooltip title="导出 Excel"><Button size="small" icon={<DownloadOutlined />} onClick={exportExcel} loading={exporting} /></Tooltip>
          <Button size="small" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>导入</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { offsetRef.current = 0; fetchData(false); }} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => add()}>新增录入</Button>
        </div>
      </div>

      {/* ===== 内容区 ===== */}
      <div className={styles.content}>
        <Spin spinning={loading}>
          {groups.length === 0 && !loading ? (
            <Card style={{ textAlign: "center", padding: 40 }}>
              <div style={{ color: "#999", marginBottom: 12 }}>暂无生产数据</div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => add()}>新增第一条</Button>
            </Card>
          ) : (
            <div className={styles.scrollWrapper}>
              {groups.map((group) => (
                <Card key={group.date} className={styles.dailyCard}
                  title={
                    <Space size={6} wrap>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{group.date}</span>
                      {/* weekday removed */}
                      <Tag color="blue" style={{ fontSize: 11 }}>{group.summary.lines}条产线</Tag>
                      <Tag style={{ fontSize: 11 }}>{group.records.length}条记录</Tag>
                      {/* 汇总数据 */}
                      <span style={{ color: "#999", fontSize: 11, marginLeft: 4 }}>|</span>
                      <span style={{ fontSize: 11, color: "#666" }}>订单 <b>{group.summary.totalOrderQty.toLocaleString()}</b></span>
                      <span style={{ fontSize: 11, color: "#666" }}>计划 <b>{group.summary.totalPlanQty.toLocaleString()}</b></span>
                      <span style={{ fontSize: 11 }}>当天 <b style={{ color: "#1677ff" }}>{group.summary.totalDailyQty.toLocaleString()}</b></span>
                      <span style={{ fontSize: 11, color: "#666" }}>累计 <b>{group.summary.totalCumulativeQty.toLocaleString()}</b></span>
                      <Tag color={group.summary.totalDefects > 0 ? "red" : "green"} style={{ fontSize: 10 }}>不良 {group.summary.totalDefects}</Tag>
                      <span style={{ fontSize: 11, color: "#666" }}>达成率 <b style={{ color: (group.summary.achievementRate ?? 0) >= 1 ? "#52c41a" : "#ff4d4f" }}>{group.summary.achievementRate != null ? `${(group.summary.achievementRate * 100).toFixed(0)}%` : "-"}</b></span>
                      <span style={{ fontSize: 11, color: "#666" }}>合格率 <b style={{ color: (group.summary.qualifiedRate ?? 1) >= 0.95 ? "#52c41a" : "#ff4d4f" }}>{group.summary.qualifiedRate != null ? `${(group.summary.qualifiedRate * 100).toFixed(1)}%` : "-"}</b></span>
                      <span style={{ fontSize: 11, color: "#666" }}>欠数 <b style={{ color: group.summary.totalBackorder > 0 ? "#faad14" : "#333" }}>{group.summary.totalBackorder.toLocaleString()}</b></span>
                    </Space>
                  }
                  extra={
                    <Space size={4}>
                      <Button type="link" size="small" style={{ fontSize: 11 }} icon={<PlusOutlined />} onClick={() => toggleQuick(group.date)}>快速录入</Button>
                      <Button type="link" size="small" style={{ fontSize: 11 }} icon={<EditOutlined />} onClick={() => add(group.date)}>完整新增</Button>
                    </Space>
                  }
                  size="small"
                >
                  <ResponsiveTable
                    columns={columns}
                    dataSource={group.records.map((r) => ({ ...r, key: r.id }))}
                    pagination={false} size="small" minWidth={2050} bordered
                    rowClassName={rowCls} locale={{ emptyText: "暂无数据" }}
                  />

                  {quickDate[group.date] && (
                    <div className={styles.quickAddRow}>
                      <Form form={quickForm} layout="inline" size="small">
                        <Form.Item name="date" noStyle hidden><Input /></Form.Item>
                        <Form.Item name="line" rules={[{ required: true, message: "必填" }]} style={{ marginBottom: 0 }}>
                          <Select placeholder="产线" style={{ width: 56 }} options={lines.map((l) => ({ value: l, label: l }))} /></Form.Item>
                        <Form.Item name="productName" rules={[{ required: true, message: "必填" }]} style={{ marginBottom: 0 }}>
                          <Select showSearch placeholder="品名" style={{ width: 130 }}
                            filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                            options={materials}
                            onSelect={(val: string) => { const m = materials.find((x) => x.value === val); if (m?.spec) quickForm.setFieldValue("spec", m.spec); }} /></Form.Item>
                        <Form.Item name="customer" rules={[{ required: true, message: "必填" }]} style={{ marginBottom: 0 }}>
                          <Select showSearch placeholder="客户" style={{ width: 90 }}
                            filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                            options={customers} /></Form.Item>
                        <Form.Item name="productionBatch" style={{ marginBottom: 0 }}><Input placeholder="批号" style={{ width: 90 }} /></Form.Item>
                        <Form.Item name="orderQty" style={{ marginBottom: 0 }}><InputNumber placeholder="订单" style={{ width: 58 }} min={0} /></Form.Item>
                        <Form.Item name="planQty" style={{ marginBottom: 0 }}><InputNumber placeholder="计划" style={{ width: 58 }} min={0} /></Form.Item>
                        <Form.Item name="dailyQty" rules={[{ required: true, message: "必填" }]} style={{ marginBottom: 0 }}><InputNumber placeholder="当天" style={{ width: 62 }} min={0} /></Form.Item>
                        <Form.Item name="cumulativeQty" style={{ marginBottom: 0 }}><InputNumber placeholder="累计" style={{ width: 62 }} min={0} /></Form.Item>
                        <Form.Item name="defects" style={{ marginBottom: 0 }}><InputNumber placeholder="不良" style={{ width: 54 }} min={0} /></Form.Item>
                        <Button type="primary" size="small" icon={<SaveOutlined />} loading={quickSaving} onClick={() => quickSave(group.date)}>保存</Button>
                        <Button size="small" onClick={() => setQuickDate((prev) => ({ ...prev, [group.date]: false }))}>取消</Button>
                      </Form>
                    </div>
                  )}
                </Card>
              ))}
              {hasMore && (
                <div className={styles.loadMore}>
                  <Button onClick={() => fetchData(true)} loading={loading}>加载更多（共 {total} 条）</Button>
                </div>
              )}
            </div>
          )}
        </Spin>
      </div>

      <EntryDrawer open={drawerOpen} record={editingRecord} copyFrom={copyFromRecord} defaultDate={defaultDate} onClose={onDrawerClose} />
      <ProductionImportModal
        department="assembly"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={({ dateFrom, dateTo }) => {
          setFDateFrom(dateFrom);
          setFDateTo(dateTo);
          setActiveFilters({ dateFrom, dateTo, line: null, product: "", customer: "", search: "" });
          setFLine(null);
          setFProduct("");
          setFCustomer("");
          setFSearch("");
          historyCacheRef.current.clear();
          offsetRef.current = 0;
        }}
      />

      <Modal title="修改历史" open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={700}>
        <Spin spinning={historyLoading}>
          {historyData.length === 0 && !historyLoading ? (
            <div style={{ color: "#999", textAlign: "center", padding: 20 }}>暂无修改记录</div>
          ) : (
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {historyData.map((log, idx) => (
                <div key={log.id || idx} style={{ padding: "8px 0", borderBottom: idx < historyData.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <div style={{ marginBottom: 4 }}>
                    <Tag color={log.action === "INSERT" ? "green" : log.action === "DELETE" ? "red" : "blue"}>
                      {log.action === "INSERT" ? "新增" : log.action === "DELETE" ? "删除" : "修改"}
                    </Tag>
                    <strong>{log.changed_by}</strong>
                    <span style={{ color: "#999", marginLeft: 8 }}>{dayjs(log.changed_at).format("YYYY-MM-DD HH:mm:ss")}</span>
                  </div>
                  {log.action === "UPDATE" && (
                    <div style={{ fontSize: 12, color: "#666" }}>
                      <span style={{ color: "#999" }}>{flm[log.field_name] || log.field_name}:</span>{" "}
                      <span style={{ color: "#ff4d4f", textDecoration: "line-through" }}>{log.old_value || "（空）"}</span>
                      {" → "}
                      <span style={{ color: "#52c41a" }}>{log.new_value || "（空）"}</span>
                    </div>
                  )}
                  {log.action === "INSERT" && <div style={{ fontSize: 12, color: "#999" }}>创建了此条记录</div>}
                  {log.action === "DELETE" && <div style={{ fontSize: 12, color: "#999" }}>删除了此条记录</div>}
                </div>
              ))}
            </div>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
