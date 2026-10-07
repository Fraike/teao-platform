import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Button, Card, Col, DatePicker, Modal, Row, Space,
  Spin, Statistic, Tabs, Tag, Typography, message,
} from "antd";
import { EyeOutlined, ReloadOutlined, SendOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { api } from "../lib/api";
import {
  createProductionReportCoordinator, formatReportRate, getConfirmedSendRequest,
  getDefaultProductionReportRange, isSingleDayRange, requiresRepeatConfirmation,
  validateProductionReportRange,
} from "../lib/productionReportUi";
import { useIsMobile } from "../lib/useIsMobile";
import type {
  ProductionDepartment, ProductionPreviewView, ProductionReportConfig,
  ProductionReportData, ProductionReportPreview, ProductionReportProduct,
  ProductionReportRecords, ProductionReportTicket,
} from "../types/productionReport";
import styles from "./ProductionReportPage.module.css";

const { RangePicker } = DatePicker;
const { Title } = Typography;
const PAGE_SIZE = 50;

function initialRange(): [Dayjs, Dayjs] {
  const value = getDefaultProductionReportRange(dayjs().format("YYYY-MM-DD"));
  return [dayjs(value.dateFrom), dayjs(value.dateTo)];
}

export function ProductionReportPage() {
  const isMobile = useIsMobile();
  const [range, setRange] = useState<[Dayjs, Dayjs]>(initialRange);
  const [report, setReport] = useState<ProductionReportData | null>(null);
  const [records, setRecords] = useState<Record<ProductionDepartment, ProductionReportRecords | null>>({ assembly: null, injection: null });
  const [config, setConfig] = useState<ProductionReportConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [operation, setOperation] = useState<"send" | null>(null);
  const [preview, setPreview] = useState<ProductionPreviewView | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [repeatConfirmation, setRepeatConfirmation] = useState<ProductionReportTicket | null>(null);
  const [activeTab, setActiveTab] = useState<ProductionDepartment>("assembly");
  const operationRef = useRef<ProductionReportTicket | null>(null);
  const previewRequestRef = useRef<ProductionReportTicket | null>(null);

  const dateFrom = range[0].format("YYYY-MM-DD");
  const dateTo = range[1].format("YYYY-MM-DD");
  const rangeLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} 至 ${dateTo}`;
  const singleDay = isSingleDayRange(dateFrom, dateTo);
  const [coordinator] = useState(() => createProductionReportCoordinator(dateFrom, dateTo));
  const busy = loading || recordsLoading || previewLoading || operation !== null;

  const presets = useMemo(() => {
    const yesterday = dayjs().subtract(1, "day");
    return [
      { label: "最近7天", value: [yesterday.subtract(6, "day"), yesterday] as [Dayjs, Dayjs] },
      { label: "最近30天", value: [yesterday.subtract(29, "day"), yesterday] as [Dayjs, Dayjs] },
      { label: "本月迄今", value: [yesterday.startOf("month"), yesterday] as [Dayjs, Dayjs] },
      { label: "上月", value: [yesterday.subtract(1, "month").startOf("month"), yesterday.subtract(1, "month").endOf("month")] as [Dayjs, Dayjs] },
    ];
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigError(null);
    try {
      setConfig(await api.get<ProductionReportConfig>("/api/production/config"));
    } catch (error) {
      setConfig(null);
      setConfigError(error instanceof Error ? error.message : "获取配置失败");
    }
  }, []);

  const fetchReport = useCallback(async () => {
    const ticket = coordinator.begin("report");
    setLoading(true);
    setReportError(null);
    try {
      const query = new URLSearchParams({ dateFrom: ticket.dateFrom, dateTo: ticket.dateTo });
      const data = await api.get<ProductionReportData>(`/api/production/report?${query}`);
      if (coordinator.isCurrent(ticket)) setReport(data);
    } catch (error) {
      if (coordinator.isCurrent(ticket)) {
        setReport(null);
        setReportError(error instanceof Error ? error.message : "加载失败");
      }
    } finally {
      if (coordinator.isCurrent(ticket)) setLoading(false);
    }
  }, [coordinator]);

  const fetchRecords = useCallback(async (department: ProductionDepartment, page: number) => {
    const ticket = coordinator.begin("records");
    setRecordsLoading(true);
    try {
      const query = new URLSearchParams({
        department, dateFrom: ticket.dateFrom, dateTo: ticket.dateTo,
        page: String(page), pageSize: String(PAGE_SIZE),
      });
      const data = await api.get<ProductionReportRecords>(`/api/production/report/records?${query}`);
      if (coordinator.isCurrent(ticket)) setRecords((previous) => ({ ...previous, [department]: data }));
    } catch (error) {
      if (coordinator.isCurrent(ticket)) message.error(error instanceof Error ? error.message : "明细加载失败");
    } finally {
      if (coordinator.isCurrent(ticket)) setRecordsLoading(false);
    }
  }, [coordinator]);

  const refresh = useCallback(() => {
    setRecords({ assembly: null, injection: null });
    void fetchReport();
    void fetchRecords(activeTab, 1);
  }, [activeTab, fetchRecords, fetchReport]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([fetchConfig(), fetchReport(), fetchRecords("assembly", 1)]);
    return () => coordinator.invalidateAll();
  }, [coordinator, fetchConfig, fetchRecords, fetchReport]);

  const changeRange = (next: null | [Dayjs | null, Dayjs | null]) => {
    if (!next?.[0] || !next[1]) return;
    const nextFrom = next[0].format("YYYY-MM-DD");
    const nextTo = next[1].format("YYYY-MM-DD");
    const error = validateProductionReportRange(nextFrom, nextTo);
    if (error) {
      message.warning(error);
      return;
    }
    if (nextFrom === dateFrom && nextTo === dateTo) return;
    coordinator.setContext(nextFrom, nextTo);
    setRange([next[0], next[1]]);
    setReport(null);
    setRecords({ assembly: null, injection: null });
    setReportError(null);
    setPreview(null);
    setRepeatConfirmation(null);
    void fetchReport();
    void fetchRecords(activeTab, 1);
  };

  const changeTab = (key: string) => {
    const department = key as ProductionDepartment;
    setActiveTab(department);
    if (!records[department]) void fetchRecords(department, 1);
  };

  const closePreview = () => {
    coordinator.invalidate("preview");
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!singleDay || busy || previewRequestRef.current || operationRef.current) return;
    const ticket = coordinator.begin("preview");
    previewRequestRef.current = ticket;
    setPreview({ ticket, data: null, error: null });
    setPreviewLoading(true);
    try {
      const data = await api.post<ProductionReportPreview>(`/api/production/preview?date=${encodeURIComponent(ticket.dateFrom)}`, {});
      if (coordinator.isCurrent(ticket)) setPreview({ ticket, data, error: null });
    } catch (error) {
      if (coordinator.isCurrent(ticket)) setPreview({ ticket, data: null, error: error instanceof Error ? error.message : "预览失败" });
    } finally {
      if (previewRequestRef.current === ticket) {
        previewRequestRef.current = null;
        setPreviewLoading(false);
      }
    }
  };

  const handleSend = async (confirmation?: ProductionReportTicket) => {
    if (!singleDay || operationRef.current || loading || previewLoading) return;
    const confirmed = confirmation ? getConfirmedSendRequest(coordinator, confirmation) : null;
    if (confirmation && !confirmed) {
      setRepeatConfirmation(null);
      return;
    }
    const ticket = coordinator.begin("send");
    operationRef.current = ticket;
    setOperation("send");
    setRepeatConfirmation(null);
    try {
      const data = await api.post<{ status: "sent"; message: string }>(confirmed?.url ?? `/api/production/send?date=${encodeURIComponent(ticket.dateFrom)}`, confirmed?.body ?? {});
      if (coordinator.isCurrent(ticket)) message.success(data.message || "已推送到企业微信群");
    } catch (error) {
      if (!coordinator.isCurrent(ticket)) return;
      if (requiresRepeatConfirmation(error)) setRepeatConfirmation(ticket);
      else message.error(error instanceof Error ? error.message : "推送失败");
    } finally {
      if (operationRef.current === ticket) {
        operationRef.current = null;
        setOperation(null);
      }
    }
  };

  const rateClass = (rate: number | null | undefined) => rate == null ? styles.rateUnknown : rate >= 0.95 ? styles.rateGood : styles.rateBad;
  const rateColor = (rate: number | null) => rate == null ? "default" : rate >= 0.95 ? "success" : "error";
  const assemblyColumns = [
    { title: "日期", dataIndex: "date", key: "date", width: 100 },
    { title: "产线", dataIndex: "line", key: "line", width: 80 },
    { title: "品名", dataIndex: "name", key: "name", width: 150 },
    { title: "规格", dataIndex: "spec", key: "spec", width: 100 },
    { title: "客户", dataIndex: "customer", key: "customer", width: 140 },
    { title: "生产批号", dataIndex: "batchNo", key: "batchNo", width: 130 },
    { title: "计划数量", dataIndex: "planQty", key: "planQty", width: 95, render: (value: number) => value.toLocaleString() },
    { title: "实际数量", dataIndex: "actualQty", key: "actualQty", width: 95, render: (value: number) => value.toLocaleString() },
    { title: "达成率", dataIndex: "achievementRate", key: "achievementRate", width: 80, render: (value: number | null) => value == null ? "—" : <Tag color={rateColor(value)}>{formatReportRate(value, 0)}</Tag> },
    { title: "不良数", dataIndex: "defects", key: "defects", width: 75, render: (value: number) => <span className={value > 0 ? styles.defectValue : undefined}>{value}</span> },
    { title: "合格率", dataIndex: "qualifiedRate", key: "qualifiedRate", width: 80, render: (value: number | null) => value == null ? "—" : <Tag color={rateColor(value)}>{formatReportRate(value)}</Tag> },
    { title: "欠数", dataIndex: "backorder", key: "backorder", width: 85, render: (value: number) => value > 0 ? <span className={styles.backorderValue}>{value.toLocaleString()}</span> : "-" },
    { title: "备注", dataIndex: "remark", key: "remark", width: 160 },
  ];
  const injectionColumns = [
    { title: "日期", dataIndex: "date", key: "date", width: 100 },
    { title: "机台", dataIndex: "machine", key: "machine", width: 70 },
    { title: "班次", dataIndex: "shift", key: "shift", width: 70, render: (value: string) => <Tag color={value === "白班" ? "blue" : "purple"}>{value}</Tag> },
    { title: "品名", dataIndex: "name", key: "name", width: 150 },
    { title: "原材料", dataIndex: "material", key: "material", width: 100 },
    { title: "批号", dataIndex: "batchNo", key: "batchNo", width: 130 },
    { title: "操作人", dataIndex: "operator", key: "operator", width: 90 },
    { title: "订单数量", dataIndex: "planQty", key: "planQty", width: 95, render: (value: number) => value.toLocaleString() },
    { title: "当天产量", dataIndex: "actualQty", key: "actualQty", width: 95, render: (value: number) => value.toLocaleString() },
    { title: "不良数", dataIndex: "defects", key: "defects", width: 75, render: (value: number) => <span className={value > 0 ? styles.defectValue : undefined}>{value}</span> },
    { title: "合格率", dataIndex: "qualifiedRate", key: "qualifiedRate", width: 80, render: (value: number | null) => value == null ? "—" : <Tag color={rateColor(value)}>{formatReportRate(value)}</Tag> },
    { title: "欠数", dataIndex: "backorder", key: "backorder", width: 85, render: (value: number) => value > 0 ? <span className={styles.backorderValue}>{value.toLocaleString()}</span> : "-" },
    { title: "备注", dataIndex: "remark", key: "remark", width: 160 },
  ];

  const asm = report?.assembly.summary;
  const inj = report?.injection.summary;
  const noData = report && report.assembly.rawCount === 0 && report.injection.rawCount === 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Title level={isMobile ? 4 : 3} className={styles.title}>生产日报汇总</Title>
          <RangePicker value={range} onChange={changeRange} allowClear={false} size="large" className={styles.rangePicker} disabled={operation !== null} format="YYYY年M月D日" presets={presets} inputReadOnly={isMobile} />
        </div>
        <Space className={styles.actions} wrap>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading} disabled={busy}>刷新数据</Button>
          <Button title={singleDay ? undefined : "企微日报仅支持单日"} icon={<EyeOutlined />} onClick={() => void handlePreview()} loading={previewLoading} disabled={busy || !singleDay}>消息预览</Button>
          <Button title={singleDay ? undefined : "企微日报仅支持单日"} type="primary" icon={<SendOutlined />} onClick={() => void handleSend()} loading={operation === "send"} disabled={busy || !singleDay || !report || !config?.hasWebhook}>推送到企微</Button>
        </Space>
      </div>

      {!singleDay && <Alert className={styles.notice} type="info" showIcon message="当前为时间段汇总；企微日报仅支持选择同一天后预览和推送。" />}
      {configError && <Alert className={styles.notice} type="warning" showIcon message={`企微配置读取失败：${configError}`} action={<Button size="small" onClick={() => void fetchConfig()}>重试</Button>} />}
      {reportError && <Alert className={styles.notice} type="error" showIcon message={reportError} action={<Button size="small" onClick={refresh}>重新加载</Button>} />}
      {noData && <Alert className={styles.notice} type="info" showIcon message={`${rangeLabel} 暂无生产记录`} />}
      {report && report.missingDepartments.length > 0 && !noData && <Alert className={styles.notice} type="warning" showIcon message={`暂无记录：${report.missingDepartments.map((department) => department === "assembly" ? "装配部" : "注塑部").join("、")}`} />}

      <Modal open={preview !== null} title="生产日报消息预览" onCancel={closePreview} footer={<Button onClick={closePreview}>关闭</Button>} width={760}>
        {preview && <><p>日期：{preview.ticket.dateFrom}</p>{preview.error && <Alert type="error" showIcon message={preview.error} />}{previewLoading && <Spin />}{preview.data && !preview.data.hasData && <Alert type="info" showIcon message="该日期暂无生产记录" />}{preview.data && <pre className={styles.previewContent}>{preview.data.content}</pre>}</>}
      </Modal>
      <Modal open={repeatConfirmation !== null} title="确认重复推送" okText="确认重发" cancelText="取消" onOk={() => repeatConfirmation && void handleSend(repeatConfirmation)} onCancel={() => setRepeatConfirmation(null)} okButtonProps={{ disabled: busy }} maskClosable={false}>
        <p>{repeatConfirmation?.dateFrom} 的日报可能已经发送，请先核查企业微信群，再确认是否重发。</p>
      </Modal>

      <Spin spinning={loading}>
        {report ? <>
          <Row gutter={[16, 16]} className={styles.summaryRow}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="装配产线" value={asm?.lines || 0} suffix="条" /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="装配总产量" value={asm?.totalActualQty || 0} suffix="PCS" className={styles.assemblyTotal} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="注塑总产量" value={inj?.totalQty || 0} suffix="PCS" className={styles.injectionTotal} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="不良总数" value={(asm?.totalDefects || 0) + (inj?.totalDefects || 0)} suffix="PCS" className={(asm?.totalDefects || 0) + (inj?.totalDefects || 0) > 0 ? styles.defectTotal : styles.goodTotal} /></Card></Col>
          </Row>
          {((asm?.latestBackorder || 0) > 0 || (inj?.latestBackorder || 0) > 0) && <Card size="small" className={styles.backorderCard}><Space><WarningOutlined className={styles.warningIcon} /><span>最新欠数：{asm && asm.latestBackorder > 0 && `装配部 ${asm.latestBackorder.toLocaleString()} PCS（${asm.backorderAsOf}）`}{asm && asm.latestBackorder > 0 && inj && inj.latestBackorder > 0 && "，"}{inj && inj.latestBackorder > 0 && `注塑部 ${inj.latestBackorder.toLocaleString()} PCS（${inj.backorderAsOf}）`}</span></Space></Card>}
          <Tabs activeKey={activeTab} onChange={changeTab}>
            <Tabs.TabPane tab={`装配部（${asm?.lines || 0} 条产线）`} key="assembly">
              <Card size="small" className={styles.departmentSummary}><Row gutter={[16, 8]}>
                <Col xs={12} sm={4}><Statistic title="计划总量" value={asm?.totalPlanQty || 0} suffix="PCS" /></Col>
                <Col xs={12} sm={4}><Statistic title="实际产量" value={asm?.totalActualQty || 0} suffix="PCS" className={styles.assemblyTotal} /></Col>
                <Col xs={12} sm={4}><Statistic title="达成率" value={formatReportRate(asm?.avgAchievementRate, 0)} className={rateClass(asm?.avgAchievementRate)} /></Col>
                <Col xs={12} sm={4}><Statistic title="合格率" value={formatReportRate(asm?.avgQualifiedRate)} className={rateClass(asm?.avgQualifiedRate)} /></Col>
                <Col xs={12} sm={4}><Statistic title="不良数" value={asm?.totalDefects || 0} suffix="PCS" className={asm && asm.totalDefects > 0 ? styles.defectTotal : styles.goodTotal} /></Col>
                <Col xs={12} sm={4}><Statistic title={`最新欠数${asm?.backorderAsOf ? `（${asm.backorderAsOf}）` : ""}`} value={asm?.latestBackorder || 0} suffix="PCS" className={styles.backorderTotal} /></Col>
              </Row></Card>
              <ResponsiveTable<ProductionReportProduct> columns={assemblyColumns} dataSource={records.assembly?.records || []} rowKey="id" loading={recordsLoading && activeTab === "assembly"} pagination={{ current: records.assembly?.page || 1, pageSize: PAGE_SIZE, total: records.assembly?.total || 0, showSizeChanger: false, onChange: (page) => void fetchRecords("assembly", page) }} size="small" minWidth={1400} bordered />
            </Tabs.TabPane>
            <Tabs.TabPane tab={`注塑部（${inj?.machines || 0} 台机台 / ${inj?.machineShifts || 0} 个班次）`} key="injection">
              <Card size="small" className={styles.departmentSummary}><Row gutter={[16, 8]}>
                <Col xs={12} sm={6}><Statistic title="机台数" value={inj?.machines || 0} suffix="台" /></Col>
                <Col xs={12} sm={6}><Statistic title="总产量" value={inj?.totalQty || 0} suffix="PCS" className={styles.injectionTotal} /></Col>
                <Col xs={12} sm={6}><Statistic title="合格率" value={formatReportRate(inj?.avgQualifiedRate)} className={rateClass(inj?.avgQualifiedRate)} /></Col>
                <Col xs={12} sm={6}><Statistic title="不良数" value={inj?.totalDefects || 0} suffix="PCS" className={inj && inj.totalDefects > 0 ? styles.defectTotal : styles.goodTotal} /></Col>
              </Row></Card>
              <ResponsiveTable<ProductionReportProduct> columns={injectionColumns} dataSource={records.injection?.records || []} rowKey="id" loading={recordsLoading && activeTab === "injection"} pagination={{ current: records.injection?.page || 1, pageSize: PAGE_SIZE, total: records.injection?.total || 0, showSizeChanger: false, onChange: (page) => void fetchRecords("injection", page) }} size="small" minWidth={1350} bordered />
            </Tabs.TabPane>
          </Tabs>
        </> : <Card className={styles.emptyCard}><div className={styles.emptyText}>{loading ? "正在获取生产汇总数据..." : `${rangeLabel} 暂无生产数据`}</div>{!loading && <Button type="primary" icon={<ReloadOutlined />} onClick={refresh}>刷新数据</Button>}</Card>}
      </Spin>
    </div>
  );
}
