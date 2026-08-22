import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Card, Button, DatePicker, Select, Input, Tag,
  Space, Spin, message, Popconfirm, Tooltip,
  Modal, Form, InputNumber, Row, Col, AutoComplete, Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined, HistoryOutlined,
  SaveOutlined, CopyOutlined, FilterOutlined, DownloadOutlined, UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api, getToken } from "../lib/api";
import { useAuthStore } from "../lib/authStore";
import { ProductionImportModal } from "../components/production/ProductionImportModal";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { exportProductionExcel, type ExportColumn } from "../lib/productionExcel";
import { getFinishedProductOptions } from "../lib/productionReferenceData";
import styles from "./ProductionEntryPage.module.css";

const { RangePicker } = DatePicker;
const PAGE_SIZE = 10;

// ---- 类型 ----
interface InjRecord {
  id: number; date: string; machine: string; productName: string;
  material: string; materialBatch: string; shift: string;
  operator: string; orderQty: number; dailyQty: number;
  cumulativeQty: number; defects: number; batchNo: string;
  remark: string; createdAt: string; updatedAt: string;
  createdBy: string; updatedBy: string;
  qualifiedRate: number | null; backorder: number;
}
interface InjGroup { date: string; records: InjRecord[]; summary: InjSummary; }
interface InjSummary { machines: number; totalOrderQty: number; totalDailyQty: number; totalCumulativeQty: number; totalDefects: number; qualifiedRate: number | null; totalBackorder: number; }

const MACHINES = ["1#", "2#", "3#", "4#", "5#", "6#", "7#", "8#", "9#", "10#", "11#", "12#"];
const SHIFTS = ["白班", "夜班"];

const INJECTION_DETAIL_COLUMNS: ExportColumn[] = [
  { key: "date", title: "日期" }, { key: "machine", title: "机台" }, { key: "shift", title: "班次" }, { key: "productName", title: "品名/型号" }, { key: "material", title: "原材料" }, { key: "materialBatch", title: "原材料批号" }, { key: "operator", title: "操作人" }, { key: "orderQty", title: "订单数量", format: "#,##0" }, { key: "dailyQty", title: "当天生产", format: "#,##0" }, { key: "cumulativeQty", title: "累计生产", format: "#,##0" }, { key: "defects", title: "不良数", format: "#,##0" }, { key: "qualifiedRate", title: "合格率", format: "0.0%" }, { key: "backorder", title: "欠数", format: "#,##0" }, { key: "batchNo", title: "半成品生产批号" }, { key: "remark", title: "备注" }, { key: "updatedBy", title: "编辑人" }, { key: "createdAt", title: "创建时间" },
];
const INJECTION_SUMMARY_COLUMNS: ExportColumn[] = [
  { key: "date", title: "日期" }, { key: "machines", title: "机台数" }, { key: "totalOrderQty", title: "订单数量", format: "#,##0" }, { key: "totalDailyQty", title: "当天生产", format: "#,##0" }, { key: "totalCumulativeQty", title: "累计生产", format: "#,##0" }, { key: "totalDefects", title: "不良数", format: "#,##0" }, { key: "qualifiedRate", title: "合格率", format: "0.0%" }, { key: "totalBackorder", title: "欠数", format: "#,##0" },
];

// ---- 录入弹窗 ----
function EntryModal({ open, record, copyFrom, onClose }: { open: boolean; record: InjRecord | null; copyFrom: InjRecord | null; onClose: (saved: boolean) => void }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<{ value: string; label: string }[]>([]);
  const currentUser = useAuthStore((s) => s.user);
  const isEdit = !!record; const isCopy = !record && !!copyFrom;

  useEffect(() => {
    getFinishedProductOptions().then((options) => setMaterials(options));
  }, []);

  useEffect(() => {
    if (!open) return;
    const fillRecord = record || copyFrom;
    if (fillRecord) {
      form.setFieldsValue({
        date: copyFrom ? dayjs() : dayjs(fillRecord.date),
        machine: fillRecord.machine, productName: fillRecord.productName,
        material: fillRecord.material, materialBatch: fillRecord.materialBatch,
        shift: fillRecord.shift, operator: fillRecord.operator,
        orderQty: copyFrom ? 0 : fillRecord.orderQty,
        dailyQty: copyFrom ? 0 : fillRecord.dailyQty,
        cumulativeQty: copyFrom ? 0 : fillRecord.cumulativeQty,
        defects: 0, batchNo: fillRecord.batchNo, remark: fillRecord.remark,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ date: dayjs(), shift: "白班" });
    }
  }, [open, record, copyFrom, form]);

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields(); setLoading(true);
      const p = { ...v, date: v.date.format("YYYY-MM-DD") };
      if (isEdit) { await api.put(`/api/production/injection/entries/${record!.id}`, p); message.success("更新成功"); }
      else { await api.post("/api/production/injection/entries", p); message.success("新增成功"); }
      onClose(true);
    } catch (e: unknown) { if (e && typeof e === "object" && "errorFields" in e) return; message.error((e as Error).message || "保存失败"); }
    finally { setLoading(false); }
  };

  const dq = Form.useWatch("dailyQty", form) || 0;
  const df = Form.useWatch("defects", form) || 0;
  const oq = Form.useWatch("orderQty", form) || 0;
  const cq = Form.useWatch("cumulativeQty", form) || 0;

  return (
    <Modal title={isEdit ? "编辑注塑记录" : isCopy ? "复制注塑记录（今日）" : "新增注塑记录"} open={open} onCancel={() => onClose(false)} width={700}
      footer={<Space><Button onClick={() => onClose(false)}>取消</Button><Button type="primary" size="large" onClick={handleSubmit} loading={loading}>保存</Button></Space>}>
      <Form form={form} layout="vertical" size="middle">
        <Row gutter={16}>
          <Col span={8}><Form.Item label="日期" name="date" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" /></Form.Item></Col>
          <Col span={8}><Form.Item label="机台" name="machine" rules={[{ required: true, message: "必填" }]}><AutoComplete placeholder="选择或输入机台" options={MACHINES.map(l => ({ value: l, label: l }))} filterOption={(i, o) => (o?.label as string)?.includes(i ?? "")} /></Form.Item></Col>
          <Col span={8}><Form.Item label="班次" name="shift" rules={[{ required: true }]}><Select options={SHIFTS.map(s => ({ value: s, label: s }))} /></Form.Item></Col>
        </Row>
        <Form.Item label="品名/型号" name="productName" rules={[{ required: true, message: "必填" }]}>
          <Select showSearch placeholder="搜索并选择商品（成品）" filterOption={(i, o) => (o?.label as string)?.toLowerCase().includes(i.toLowerCase())} options={materials} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="原材料" name="material"><Input placeholder="如 POM, PC" /></Form.Item></Col>
          <Col span={12}><Form.Item label="原材料批号" name="materialBatch"><Input /></Form.Item></Col>
        </Row>
        <Form.Item label="操作人" name="operator"><Input placeholder="操作人员姓名" /></Form.Item>
        <Divider style={{ margin: "8px 0" }}>生产数据</Divider>
        <Row gutter={16}>
          <Col span={6}><Form.Item label="订单数量" name="orderQty"><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
          <Col span={6}><Form.Item label="当天生产数量 *" name="dailyQty" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
          <Col span={6}><Form.Item label="累计生产" name="cumulativeQty"><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
          <Col span={6}><Form.Item label="不良数" name="defects"><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="半成品生产批号" name="batchNo"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item label="备注" name="remark"><Input /></Form.Item></Col>
        </Row>
        <div style={{ background: "#fafafa", borderRadius: 6, padding: "8px 12px", fontSize: 12, lineHeight: "22px" }}>
          合格率: <b style={{ color: (dq > 0 ? (dq - df) / dq : 1) >= 0.95 ? "#52c41a" : "#ff4d4f" }}>{dq > 0 ? `${((dq - df) / dq * 100).toFixed(1)}%` : "-"}</b> 欠数: <b style={{ color: (oq - cq) > 0 ? "#faad14" : "#333" }}>{(oq - cq).toLocaleString()}</b>
        </div>
        <div style={{ color: "#999", fontSize: 11, marginTop: 8 }}>录入人: {currentUser?.name || currentUser?.username}，{dayjs().format("YYYY-MM-DD HH:mm")}</div>
      </Form>
    </Modal>
  );
}

// ---- 主页面 ----
export function ProductionEntryInjectionPage() {
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 9); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [machine, setMachine] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const [search, setSearch] = useState("");
  const [lProduct, setLProduct] = useState("");
  const [lSearch, setLSearch] = useState("");

  const [groups, setGroups] = useState<InjGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editRec, setEditRec] = useState<InjRecord | null>(null);
  const [copyRec, setCopyRec] = useState<InjRecord | null>(null);
  const offsetRef = useRef(0);
  const groupsRef = useRef<InjGroup[]>([]);

  const [quickDate, setQuickDate] = useState<Record<string, boolean>>({});
  const [quickForm] = Form.useForm();
  const [quickSaving, setQuickSaving] = useState(false);
  const [materials, setMaterials] = useState<{ value: string; label: string }[]>([]);

  const [histOpen, setHistOpen] = useState(false);
  const [histData, setHistData] = useState<{ id: number; action: string; field_name: string; old_value: string | null; new_value: string | null; changed_by: string; changed_at: string }[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const historyCacheRef = useRef(new Map<number, typeof histData>());

  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => { getFinishedProductOptions().then((options) => setMaterials(options)); }, []);

  const doSearch = () => { setProduct(lProduct); setSearch(lSearch); };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (machine) params.set("machine", machine);
      if (product) params.set("product", product);
      if (search) params.set("search", search);
      const response = await api.get<{ ok: boolean; data: { groups: InjGroup[] } }>(`/api/production/injection/entries/export?${params.toString()}`);
      await exportProductionExcel(`注塑部生产日报_${dateFrom}_${dateTo}.xlsx`, response.data.groups, INJECTION_DETAIL_COLUMNS, INJECTION_SUMMARY_COLUMNS);
      message.success(`已导出 ${response.data.groups.length} 天生产日报`);
    } catch (error) { message.error(error instanceof Error ? error.message : "导出失败"); }
    finally { setExporting(false); }
  };

  const fetchData = useCallback(async (append: boolean) => {
    setLoading(true); const curr = append ? offsetRef.current : 0;
    try {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom); if (dateTo) p.set("dateTo", dateTo);
      if (machine) p.set("machine", machine); if (product) p.set("product", product); if (search) p.set("search", search);
      p.set("limit", String(PAGE_SIZE)); p.set("offset", String(curr));
      const r = await api.get<{ ok: boolean; data: { groups: InjGroup[]; total: number; hasMore: boolean } }>(`/api/production/injection/entries?${p.toString()}`);
      const d = r.data;
      setGroups(append ? [...groupsRef.current, ...d.groups] : d.groups);
      setTotal(d.total); setHasMore(d.hasMore); offsetRef.current = curr + PAGE_SIZE;
    } catch { message.error("加载失败"); } finally { setLoading(false); }
  }, [dateFrom, dateTo, machine, product, search]);

  useEffect(() => { void Promise.resolve().then(() => { offsetRef.current = 0; return fetchData(false); }); }, [fetchData]);

  const add = useCallback(() => { setEditRec(null); setCopyRec(null); setModalOpen(true); }, []);
  const edit = useCallback((r: InjRecord) => { setEditRec(r); setCopyRec(null); setModalOpen(true); }, []);
  const copy = useCallback((r: InjRecord) => { setEditRec(null); setCopyRec(r); setModalOpen(true); }, []);
  const del = useCallback(async (id: number) => { try { await api.delete(`/api/production/injection/entries/${id}`); historyCacheRef.current.delete(id); message.success("已删除"); offsetRef.current = 0; fetchData(false); } catch { message.error("删除失败"); } }, [fetchData]);
  const onModalClose = (s: boolean) => { setModalOpen(false); setEditRec(null); setCopyRec(null); if (s) { historyCacheRef.current.clear(); offsetRef.current = 0; fetchData(false); } };
  const showHist = useCallback(async (id: number) => {
    setHistOpen(true);
    const cached = historyCacheRef.current.get(id);
    if (cached) { setHistData(cached); return; }
    setHistLoading(true);
    try {
      const tk = getToken();
      const r = await fetch(`/api/production/injection/entries/${id}/history`, { headers: tk ? { Authorization: `Bearer ${tk}` } : {} });
      const d = await r.json();
      if (d.ok) { historyCacheRef.current.set(id, d.data); setHistData(d.data); }
    } catch { message.error("加载失败"); } finally { setHistLoading(false); }
  }, []);
  const toggleQuick = (date: string) => { setQuickDate(prev => ({ ...prev, [date]: !prev[date] })); quickForm.resetFields(); };
  const quickSave = async (date: string) => { try { const v = await quickForm.validateFields(); setQuickSaving(true); await api.post("/api/production/injection/entries", { date, machine: v.machine, productName: v.productName, material: v.material || "", shift: v.shift, operator: v.operator || "", dailyQty: v.dailyQty || 0, cumulativeQty: v.cumulativeQty || 0, orderQty: v.orderQty || 0, defects: v.defects || 0, batchNo: v.batchNo || "", }); message.success("已保存"); quickForm.resetFields(); setQuickDate(prev => ({ ...prev, [date]: false })); offsetRef.current = 0; fetchData(false); } catch (e: unknown) { if (e && typeof e === "object" && "errorFields" in e) return; message.error((e as Error).message || "保存失败"); } finally { setQuickSaving(false); } };

  const flm: Record<string, string> = { date: "日期", machine: "机台", product_name: "品名/型号", material: "原材料", material_batch: "原材料批号", shift: "班次", operator: "操作人", order_qty: "订单数量", daily_qty: "当天生产数量", cumulative_qty: "累计生产", defects: "不良数", batch_no: "半成品生产批号", remark: "备注" };

  const columns = useMemo<ColumnsType<InjRecord & { key: number }>>(() => [
    { title: "机台", dataIndex: "machine", key: "m", width: 48, fixed: "left", render: (v: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{v}</span> },
    { title: "日期", dataIndex: "date", key: "d", width: 76, fixed: "left", render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: "班次", dataIndex: "shift", key: "s", width: 52, render: (v: string) => <Tag color={v === "白班" ? "blue" : "purple"} style={{ margin: 0, fontSize: 11 }}>{v}</Tag> },
    { title: "品名/型号", dataIndex: "productName", key: "pn", width: 150, ellipsis: true, render: (v: string) => <Tooltip title={v}><span style={{ fontSize: 12 }}>{v}</span></Tooltip> },
    { title: "原材料", dataIndex: "material", key: "mat", width: 60, render: (v: string) => v || "-" },
    { title: "原材料批号", dataIndex: "materialBatch", key: "mb", width: 100, ellipsis: true, render: (v: string) => v ? <Tooltip title={v}><span style={{ fontSize: 12 }}>{v}</span></Tooltip> : "-" },
    { title: "操作人", dataIndex: "operator", key: "op", width: 62, render: (v: string) => <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{v || "-"}</span> },
    { title: "订单数量", dataIndex: "orderQty", key: "oq", width: 68, align: "right" as const, render: (v: number) => <span style={{ fontSize: 12 }}>{v?.toLocaleString()}</span> },
    { title: "当天生产", dataIndex: "dailyQty", key: "dq", width: 72, align: "right" as const, render: (v: number) => <span style={{ fontWeight: 700, color: "#1677ff", fontSize: 12 }}>{v?.toLocaleString()}</span> },
    { title: "累计生产", dataIndex: "cumulativeQty", key: "cq", width: 68, align: "right" as const, render: (v: number) => <span style={{ fontSize: 12 }}>{v?.toLocaleString()}</span> },
    { title: "不良", dataIndex: "defects", key: "df", width: 44, align: "right" as const, render: (v: number) => v > 0 ? <span style={{ color: "#ff4d4f", fontWeight: 600, fontSize: 12 }}>{v}</span> : <span style={{ color: "#ccc" }}>0</span> },
    { title: "合格率", dataIndex: "qualifiedRate", key: "qr", width: 58, align: "center" as const, render: (v: number | null) => v != null ? <Tag color={v >= 0.95 ? "success" : v >= 0.9 ? "warning" : "error"} style={{ margin: 0, fontSize: 11 }}>{(v * 100).toFixed(1)}%</Tag> : "-" },
    { title: "欠数", dataIndex: "backorder", key: "bo", width: 52, align: "right" as const, render: (v: number) => v > 0 ? <span style={{ color: "#faad14", fontWeight: 600, fontSize: 12 }}>{v.toLocaleString()}</span> : <span style={{ color: "#52c41a" }}>0</span> },
    { title: "批号", dataIndex: "batchNo", key: "bn", width: 110, ellipsis: true, render: (v: string) => v ? <Tooltip title={v}><span style={{ fontSize: 12 }}>{v}</span></Tooltip> : "-" },
    { title: "备注", dataIndex: "remark", key: "rm", width: 80, ellipsis: true, render: (v: string) => v ? <Tooltip title={v}><span style={{ fontSize: 12 }}>{v}</span></Tooltip> : "-" },
    { title: "编辑人", dataIndex: "updatedBy", key: "ub", width: 56, render: (v: string) => <span style={{ fontSize: 12 }}>{v || "-"}</span> },
    { title: "创建时间", dataIndex: "createdAt", key: "ca", width: 78, render: (v: string) => <span style={{ fontSize: 11, color: "#999" }}>{v ? dayjs(v).format("MM-DD HH:mm") : "-"}</span> },
    { title: "操作", key: "ac", width: 118, fixed: "right", render: (_: unknown, r: InjRecord) => (
      <Space size={0}>
        <Tooltip title="复制"><Button type="link" size="small" icon={<CopyOutlined />} onClick={() => copy(r)} /></Tooltip>
        <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => edit(r)} /></Tooltip>
        <Tooltip title="历史"><Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => showHist(r.id)} /></Tooltip>
        <Popconfirm title="删除？" onConfirm={() => del(r.id)}><Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Tooltip></Popconfirm>
      </Space>),
    },
  ], [copy, del, edit, showHist]);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topTitle}>生产日报录入 — 注塑部</span>
        <div className={styles.topFilters}>
          <FilterOutlined style={{ color: "#722ed1", fontSize: 14 }} />
          <RangePicker value={dateFrom && dateTo ? [dayjs(dateFrom), dayjs(dateTo)] : null}
            onChange={(d) => { if (d && d[0] && d[1]) { setDateFrom(d[0].format("YYYY-MM-DD")); setDateTo(d[1].format("YYYY-MM-DD")); } }}
            allowClear size="middle" style={{ width: 240 }} placeholder={["开始", "结束"]} />
          <Select placeholder="机台" value={machine} onChange={setMachine} allowClear size="middle" style={{ width: 90 }} options={MACHINES.map(l => ({ value: l, label: l }))} />
          <Input placeholder="品名搜索" value={lProduct} onChange={e => setLProduct(e.target.value)} allowClear size="middle" style={{ width: 160 }} onPressEnter={doSearch} />
          <Input placeholder="全局搜索" value={lSearch} onChange={e => setLSearch(e.target.value)} allowClear size="middle" style={{ width: 200 }} prefix={<SearchOutlined />} onPressEnter={doSearch} />
          <Button type="primary" size="middle" icon={<SearchOutlined />} onClick={doSearch}>搜索</Button>
          <Button size="middle" onClick={() => { setMachine(null); setProduct(""); setLProduct(""); setSearch(""); setLSearch(""); }}>重置筛选</Button>
        </div>
        <div className={styles.topActions}>
          <Tooltip title="导出 Excel"><Button size="small" icon={<DownloadOutlined />} onClick={exportExcel} loading={exporting} /></Tooltip>
          <Button size="small" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>导入</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { offsetRef.current = 0; fetchData(false); }} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={add}>新增录入</Button>
        </div>
      </div>

      <div className={styles.content}>
        <Spin spinning={loading}>
          {groups.length === 0 && !loading ? (
            <Card style={{ textAlign: "center", padding: 40 }}><div style={{ color: "#999", marginBottom: 12 }}>暂无生产数据</div><Button type="primary" icon={<PlusOutlined />} onClick={add}>新增第一条</Button></Card>
          ) : (
            <div className={styles.scrollWrapper}>
              {groups.map(g => (
                <Card key={g.date} className={styles.dailyCard}
                  title={<Space size={6} wrap><span style={{ fontSize: 14, fontWeight: 600 }}>{g.date}</span><Tag color="purple" style={{ fontSize: 11 }}>{g.summary.machines}台机</Tag><Tag style={{ fontSize: 11 }}>{g.records.length}条</Tag><span style={{ color: "#999", fontSize: 11 }}>|</span><span style={{ fontSize: 11 }}>订单 <b>{g.summary.totalOrderQty.toLocaleString()}</b></span><span style={{ fontSize: 11 }}>当天 <b style={{ color: "#722ed1" }}>{g.summary.totalDailyQty.toLocaleString()}</b></span><span style={{ fontSize: 11 }}>累计 <b>{g.summary.totalCumulativeQty.toLocaleString()}</b></span><Tag color={g.summary.totalDefects > 0 ? "red" : "green"} style={{ fontSize: 10 }}>不良 {g.summary.totalDefects}</Tag><span style={{ fontSize: 11 }}>合格率 <b style={{ color: (g.summary.qualifiedRate ?? 1) >= 0.95 ? "#52c41a" : "#ff4d4f" }}>{g.summary.qualifiedRate != null ? `${(g.summary.qualifiedRate * 100).toFixed(1)}%` : "-"}</b></span><span style={{ fontSize: 11 }}>欠数 <b style={{ color: g.summary.totalBackorder > 0 ? "#faad14" : "#333" }}>{g.summary.totalBackorder.toLocaleString()}</b></span></Space>}
                  extra={<Space size={4}><Button type="link" size="small" icon={<PlusOutlined />} onClick={() => toggleQuick(g.date)}>快速录入</Button><Button type="link" size="small" icon={<EditOutlined />} onClick={add}>完整新增</Button></Space>}
                  size="small"
                >
                  <ResponsiveTable columns={columns} dataSource={g.records.map(r => ({ ...r, key: r.id }))} pagination={false} size="small" minWidth={1600} bordered
                    rowClassName={(_, i) => i % 2 === 0 ? "table-row-even" : "table-row-odd"} locale={{ emptyText: "暂无数据" }} />

                  {quickDate[g.date] && (
                    <div className={styles.quickAddRow}>
                      <Form form={quickForm} layout="inline" size="small">
                        <Form.Item name="machine" rules={[{ required: true }]} style={{ marginBottom: 0 }}><Select placeholder="机台" style={{ width: 65 }} options={MACHINES.map(l => ({ value: l, label: l }))} /></Form.Item>
                        <Form.Item name="shift" rules={[{ required: true }]} style={{ marginBottom: 0 }}><Select placeholder="班次" style={{ width: 65 }} options={SHIFTS.map(s => ({ value: s, label: s }))} /></Form.Item>
                        <Form.Item name="productName" rules={[{ required: true }]} style={{ marginBottom: 0 }}><Select showSearch placeholder="品名" style={{ width: 130 }} filterOption={(i, o) => (o?.label as string)?.toLowerCase().includes(i.toLowerCase())} options={materials} /></Form.Item>
                        <Form.Item name="material" style={{ marginBottom: 0 }}><Input placeholder="原材料" style={{ width: 70 }} /></Form.Item>
                        <Form.Item name="orderQty" style={{ marginBottom: 0 }}><InputNumber placeholder="订单" style={{ width: 65 }} min={0} /></Form.Item>
                        <Form.Item name="dailyQty" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber placeholder="当天" style={{ width: 70 }} min={0} /></Form.Item>
                        <Form.Item name="cumulativeQty" style={{ marginBottom: 0 }}><InputNumber placeholder="累计" style={{ width: 70 }} min={0} /></Form.Item>
                        <Form.Item name="defects" style={{ marginBottom: 0 }}><InputNumber placeholder="不良" style={{ width: 55 }} min={0} /></Form.Item>
                        <Button type="primary" size="small" icon={<SaveOutlined />} loading={quickSaving} onClick={() => quickSave(g.date)}>保存</Button>
                        <Button size="small" onClick={() => setQuickDate(prev => ({ ...prev, [g.date]: false }))}>取消</Button>
                      </Form>
                    </div>
                  )}
                </Card>
              ))}
              {hasMore && <div className={styles.loadMore}><Button onClick={() => fetchData(true)} loading={loading}>加载更多（共 {total} 条）</Button></div>}
            </div>
          )}
        </Spin>
      </div>

      <EntryModal open={modalOpen} record={editRec} copyFrom={copyRec} onClose={onModalClose} />
      <ProductionImportModal
        department="injection"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={({ dateFrom, dateTo }) => {
          setDateFrom(dateFrom);
          setDateTo(dateTo);
          setMachine(null);
          setProduct("");
          setSearch("");
          setLProduct("");
          setLSearch("");
          historyCacheRef.current.clear();
          offsetRef.current = 0;
        }}
      />

      <Modal title="修改历史" open={histOpen} onCancel={() => setHistOpen(false)} footer={null} width={700}>
        <Spin spinning={histLoading}>
          {histData.length === 0 && !histLoading ? <div style={{ color: "#999", textAlign: "center", padding: 20 }}>暂无修改记录</div> : (
            <div style={{ maxHeight: 400, overflow: "auto" }}>{histData.map((l, i) => (
              <div key={l.id || i} style={{ padding: "8px 0", borderBottom: i < histData.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                <div style={{ marginBottom: 4 }}><Tag color={l.action === "INSERT" ? "green" : l.action === "DELETE" ? "red" : "blue"}>{l.action === "INSERT" ? "新增" : l.action === "DELETE" ? "删除" : "修改"}</Tag><strong>{l.changed_by}</strong><span style={{ color: "#999", marginLeft: 8 }}>{dayjs(l.changed_at).format("YYYY-MM-DD HH:mm:ss")}</span></div>
                {l.action === "UPDATE" && <div style={{ fontSize: 12, color: "#666" }}><span style={{ color: "#999" }}>{flm[l.field_name] || l.field_name}:</span> <span style={{ color: "#ff4d4f", textDecoration: "line-through" }}>{l.old_value || "（空）"}</span>{" → "}<span style={{ color: "#52c41a" }}>{l.new_value || "（空）"}</span></div>}
                {l.action === "INSERT" && <div style={{ fontSize: 12, color: "#999" }}>创建了此条记录</div>}
                {l.action === "DELETE" && <div style={{ fontSize: 12, color: "#999" }}>删除了此条记录</div>}
              </div>
            ))}</div>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
