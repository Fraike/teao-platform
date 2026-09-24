import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Row, Col, Typography, DatePicker, Tabs, Button,
  Statistic, Spin, message, Tag, Space, Modal, Alert,
} from "antd";
import {
  ReloadOutlined, SendOutlined, WarningOutlined, EyeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useIsMobile } from "../lib/useIsMobile";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/authStore";
import {
  createProductionReportCoordinator, formatReportRate, getConfirmedSendRequest,
  getConfirmedSourceRequest, getSourceSwitchAction, productionSourceLabel,
  requiresRepeatConfirmation,
} from "../lib/productionReportUi";
import type {
  ProductionReportConfig, ProductionReportData, ProductionReportPreview,
  ProductionReportTicket, ProductionPreviewView,
} from "../types/productionReport";
import { ResponsiveTable } from "../components/ResponsiveTable";
import styles from "./ProductionReportPage.module.css";

const { Title } = Typography;

export function ProductionReportPage() {
  const isMobile = useIsMobile();
  const role = useAuthStore((state) => state.user?.role);
  const [date, setDate] = useState(() => dayjs().subtract(1, "day"));
  const [report, setReport] = useState<ProductionReportData | null>(null);
  const [config, setConfig] = useState<ProductionReportConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configRevision, setConfigRevision] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<"send" | "source" | null>(null);
  const operationRef = useRef<ProductionReportTicket | null>(null);
  const [preview, setPreview] = useState<ProductionPreviewView | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequestRef = useRef<ProductionReportTicket | null>(null);
  const [repeatConfirmation, setRepeatConfirmation] = useState<ProductionReportTicket | null>(null);
  const [sourceConfirmation, setSourceConfirmation] = useState<ProductionReportTicket | null>(null);
  const [activeTab, setActiveTab] = useState("assembly");
  const dateStr = date.format("YYYY-MM-DD");
  const [coordinator] = useState(() => createProductionReportCoordinator(dateStr, null));
  const source = config?.dataSource ?? null;
  const sourceAction = getSourceSwitchAction(role, source);
  const busy = configLoading || loading || previewLoading || operation !== null;

  const fetchReport = useCallback(async () => {
    const ticket = coordinator.begin("report");
    setLoading(true);
    setReportError(null);
    try {
      const data = await api.get<ProductionReportData>(`/api/production/report?date=${ticket.date}`);
      if (!coordinator.isCurrent(ticket)) return;
      if (ticket.source !== null && data.dataSource !== ticket.source) {
        setReportError("数据来源已在其它页面变更，请刷新配置后重试");
        return;
      }
      setReport(data.exists ? data : null);
    } catch (e) {
      if (coordinator.isCurrent(ticket)) setReportError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (coordinator.isCurrent(ticket)) setLoading(false);
    }
  }, [coordinator]);

  const fetchConfig = useCallback(async () => {
    const ticket = coordinator.begin("config");
    let accepted = false;
    setConfigLoading(true);
    setConfigError(null);
    try {
      const data = await api.get<ProductionReportConfig>("/api/production/config");
      if (!coordinator.isCurrent(ticket)) return;
      if (data.dataSource !== "vika" && data.dataSource !== "internal") throw new Error("配置返回了无效的数据来源");
      accepted = true;
      coordinator.setContext(ticket.date, data.dataSource);
      if (ticket.source !== data.dataSource) setReport(null);
      setConfig(data);
      setConfigRevision((revision) => revision + 1);
      setPreview(null);
      setRepeatConfirmation(null);
      setSourceConfirmation(null);
    } catch (e) {
      if (!coordinator.isCurrent(ticket)) return;
      accepted = true;
      coordinator.setContext(ticket.date, null);
      setConfig(null);
      setConfigError(e instanceof Error ? e.message : "获取配置失败");
    } finally {
      // A successful config changes the context, invalidating its own ticket.
      if (accepted || coordinator.isCurrent(ticket)) {
        setConfigLoading(false);
        setConfigLoaded(true);
      }
    }
  }, [coordinator]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConfig();
    return () => coordinator.invalidateAll();
  }, [coordinator, fetchConfig]);

  useEffect(() => {
    if (!configLoaded || source === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchReport();
  }, [dateStr, source, configLoaded, configRevision, fetchReport]);

  const changeDate = (nextDate: dayjs.Dayjs | null) => {
    const next = nextDate || dayjs();
    if (next.format("YYYY-MM-DD") === dateStr) return;
    coordinator.setContext(next.format("YYYY-MM-DD"), source);
    setDate(next);
    setReport(null);
    setReportError(null);
    setPreview(null);
    setRepeatConfirmation(null);
    setSourceConfirmation(null);
  };

  const closePreview = () => {
    coordinator.invalidate("preview");
    setPreview(null);
  };

  const handlePreview = async () => {
    if (busy || previewRequestRef.current || operationRef.current || source === null) return;
    const ticket = coordinator.begin("preview");
    previewRequestRef.current = ticket;
    setPreview({ ticket, data: null, error: null });
    setPreviewLoading(true);
    try {
      const data = await api.post<ProductionReportPreview>(`/api/production/preview?date=${ticket.date}`, {});
      if (!coordinator.isCurrent(ticket)) return;
      if (data.dataSource !== ticket.source) throw new Error("数据来源已变更，请刷新配置后重试");
      setPreview({ ticket, data, error: null });
    } catch (e) {
      if (coordinator.isCurrent(ticket)) setPreview({ ticket, data: null, error: e instanceof Error ? e.message : "预览失败" });
    } finally {
      if (previewRequestRef.current === ticket) { previewRequestRef.current = null; setPreviewLoading(false); }
    }
  };

  const handleRefresh = () => { if (!busy) void fetchReport(); };

  const handleSend = async (confirmation?: ProductionReportTicket) => {
    if (operationRef.current || loading || configLoading || previewLoading || source === null) return;
    const confirmed = confirmation ? getConfirmedSendRequest(coordinator, confirmation) : null;
    if (confirmation && !confirmed) { setRepeatConfirmation(null); return; }
    const ticket = coordinator.begin("send");
    operationRef.current = ticket;
    setOperation("send");
    setRepeatConfirmation(null);
    try {
      const data = await api.post<{ status: "sent"; message: string }>(
        confirmed?.url ?? `/api/production/send?date=${ticket.date}`, confirmed?.body ?? {},
      );
      if (coordinator.isCurrent(ticket)) message.success(data.message || "已推送到企业微信群");
    } catch (e) {
      if (!coordinator.isCurrent(ticket)) return;
      if (requiresRepeatConfirmation(e)) setRepeatConfirmation(ticket);
      else message.error(e instanceof Error ? e.message : "推送失败");
    } finally {
      if (operationRef.current === ticket) { operationRef.current = null; setOperation(null); }
    }
  };

  const handleSourceSwitch = async () => {
    if (!sourceConfirmation || busy || operationRef.current) return;
    const request = getConfirmedSourceRequest(coordinator, sourceConfirmation, role);
    if (!request) { setSourceConfirmation(null); return; }
    const ticket = coordinator.begin("source");
    operationRef.current = ticket;
    setOperation("source");
    try {
      const data = await api.post<{ ok: true; dataSource: ProductionReportConfig["dataSource"] }>(request.url, request.body);
      if (!coordinator.isCurrent(ticket)) return;
      coordinator.setContext(ticket.date, data.dataSource);
      setConfig((previous) => previous ? { ...previous, dataSource: data.dataSource } : previous);
      setReport(null);
      setPreview(null);
      setPreviewLoading(false);
      setRepeatConfirmation(null);
      setSourceConfirmation(null);
      message.success(`已切换到${productionSourceLabel(data.dataSource)}`);
    } catch (e) {
      if (coordinator.isCurrent(ticket)) message.error(e instanceof Error ? e.message : "切换失败");
    } finally {
      if (operationRef.current === ticket) { operationRef.current = null; setOperation(null); }
    }
  };

  const rateColor = (rate: number | null, threshold = 0.95) => {
    if (rate === null) return "default";
    return rate >= threshold ? "success" : "error";
  };

  const rateClass = (rate: number | null | undefined) =>
    rate == null ? styles.rateUnknown : rate >= 0.95 ? styles.rateGood : styles.rateBad;

  // ===================== Assembly table =====================
  const assemblyColumns = [
    { title: "日期", dataIndex: "date", key: "date", width: 90 },
    { title: "产线", dataIndex: "line", key: "line", width: 90 },
    { title: "品名", dataIndex: "name", key: "name", width: 120 },
    { title: "规格", dataIndex: "spec", key: "spec", width: 90 },
    { title: "客户", dataIndex: "customer", key: "customer", width: 100 },
    { title: "生产批号", dataIndex: "batchNo", key: "batchNo", width: 120 },
    {
      title: "计划数量", dataIndex: "planQty", key: "planQty", width: 85,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "实际数量", dataIndex: "actualQty", key: "actualQty", width: 85,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "达成率", dataIndex: "achievementRate", key: "achievementRate", width: 75,
      render: (v: number | null) =>
        v != null ? (
          <Tag color={rateColor(v)}>{formatReportRate(v, 0)}</Tag>
        ) : "—",
    },
    {
      title: "不良数", dataIndex: "defects", key: "defects", width: 65,
      render: (v: number) => (v > 0 ? <span style={{ color: "#ff4d4f" }}>{v}</span> : "0"),
    },
    {
      title: "合格率", dataIndex: "qualifiedRate", key: "qualifiedRate", width: 75,
      render: (v: number | null) =>
        v != null ? (
          <Tag color={rateColor(v)}>{formatReportRate(v)}</Tag>
        ) : "—",
    },
    {
      title: "欠数", dataIndex: "backorder", key: "backorder", width: 75,
      render: (v: number) =>
        v > 0 ? <span style={{ color: "#faad14" }}>{v.toLocaleString()}</span> : "-",
    },
    {
      title: "备注", dataIndex: "remark", key: "remark", width: 150,
      render: (v: string) => v || "",
    },
  ];

  // Flatten assembly records for table
  const assemblyDataSource = report?.assembly.records.flatMap((line) =>
    line.products.map((p, idx) => ({
      ...p,
      line: line.line,
      key: `${line.line}-${idx}`,
    }))
  ) || [];

  // ===================== Injection table =====================
  const injectionColumns = [
    { title: "日期", dataIndex: "date", key: "date", width: 90 },
    { title: "机台", dataIndex: "machine", key: "machine", width: 65 },
    { title: "班次", dataIndex: "shift", key: "shift", width: 55,
      render: (v: string) => (
        <Tag color={v === "白班" ? "blue" : "purple"}>{v}</Tag>
      ),
    },
    { title: "品名", dataIndex: "name", key: "name", width: 110 },
    { title: "原材料", dataIndex: "material", key: "material", width: 70 },
    { title: "批号", dataIndex: "batchNo", key: "batchNo", width: 120 },
    { title: "操作人", dataIndex: "operator", key: "operator", width: 70 },
    {
      title: "订单数量", dataIndex: "planQty", key: "planQty", width: 85,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "当天产量", dataIndex: "actualQty", key: "actualQty", width: 85,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "不良数", dataIndex: "defects", key: "defects", width: 65,
      render: (v: number) => (v > 0 ? <span style={{ color: "#ff4d4f" }}>{v}</span> : "0"),
    },
    {
      title: "合格率", dataIndex: "qualifiedRate", key: "qualifiedRate", width: 75,
      render: (v: number | null) =>
        v != null ? (
          <Tag color={rateColor(v)}>{formatReportRate(v)}</Tag>
        ) : "—",
    },
    {
      title: "欠数", dataIndex: "backorder", key: "backorder", width: 75,
      render: (v: number) =>
        v > 0 ? <span style={{ color: "#faad14" }}>{v.toLocaleString()}</span> : "-",
    },
    {
      title: "备注", dataIndex: "remark", key: "remark", width: 150,
      render: (v: string) => v || "",
    },
  ];

  const injectionDataSource = report?.injection.records.flatMap((m) =>
    m.products.map((p, idx) => ({
      ...p,
      machine: m.machine,
      shift: m.shift,
      key: `${m.machine}-${m.shift}-${idx}`,
    }))
  ) || [];

  // ===================== Summary Cards =====================
  const asm = report?.assembly.summary;
  const inj = report?.injection.summary;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <Title level={isMobile ? 4 : 3} className={styles.title}>
            生产日报汇总
          </Title>
          <Tag className={styles.sourceTag} color={source === "internal" ? "blue" : undefined}>
            当前数据来源：{configLoading ? "获取中" : productionSourceLabel(source)}
          </Tag>
          <DatePicker
            value={date}
            onChange={changeDate}
            allowClear={false}
            size="large"
            className={styles.datePicker}
            disabled={configLoading || operation === "source"}
            format="YYYY年M月D日"
            inputReadOnly
          />
        </div>
        <Space className={styles.actions} wrap>
          {sourceAction && (
            <Button onClick={() => { if (!busy) setSourceConfirmation(coordinator.begin("sourceConfirmation")); }} disabled={busy}>
              {sourceAction.label}
            </Button>
          )}
          {role === "admin" && source === null && (
            <Button disabled>切换数据来源</Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading} disabled={busy}>
            刷新数据
          </Button>
          <Button icon={<EyeOutlined />} onClick={() => void handlePreview()} loading={previewLoading} disabled={busy || source === null}>
            消息预览
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => void handleSend()}
            loading={operation === "send"}
            disabled={busy || !report || source === null || !config?.hasWebhook}
          >
            推送到企微
          </Button>
        </Space>
      </div>

      {configError && (
        <Alert className={styles.notice} type="error" showIcon message={`获取数据来源失败：${configError}`}
          action={<Button size="small" onClick={() => void fetchConfig()} loading={configLoading} disabled={busy}>刷新配置重试</Button>} />
      )}
      {reportError && <Alert className={styles.notice} type="error" showIcon message={reportError}
        action={<Button size="small" onClick={() => void fetchConfig()} disabled={busy}>刷新配置重试</Button>} />}
      {report && report.assembly.rawCount === 0 && report.injection.rawCount === 0 && (
        <Alert className={styles.notice} type="info" showIcon message={`${dateStr} 暂无生产记录`} />
      )}
      {report && report.missingDepartments.length > 0 && (
        <Alert className={styles.notice} type="warning" showIcon
          message={`暂无记录：${report.missingDepartments.map((department) => department === "assembly" ? "装配部" : "注塑部").join("、")}`} />
      )}

      <Modal open={sourceConfirmation !== null} title="切换生产日报数据来源" okText="确认切换" cancelText="取消"
        onOk={() => void handleSourceSwitch()} onCancel={() => { if (operation !== "source") setSourceConfirmation(null); }}
        confirmLoading={operation === "source"} okButtonProps={{ disabled: busy && operation !== "source" }}
        cancelButtonProps={{ disabled: operation === "source" }} closable={operation !== "source"} maskClosable={false}>
        <p>确认从{productionSourceLabel(sourceConfirmation?.source ?? null)}切换到{productionSourceLabel(getSourceSwitchAction(role, sourceConfirmation?.source ?? null)?.target ?? null)}？</p>
        <p>统一影响页面汇总、消息预览、手动及定时推送。</p>
        <p>不迁移、删除或覆盖任何记录，不会自动发送消息。</p>
      </Modal>

      <Modal open={preview !== null} title="生产日报消息预览" onCancel={closePreview}
        footer={<Button onClick={closePreview}>关闭</Button>} width={760}>
        {preview && (
          <>
            <p>日期：{preview.ticket.date} · 数据来源：{productionSourceLabel(preview.data?.dataSource ?? preview.ticket.source)}</p>
            {preview.error && <Alert type="error" showIcon message={preview.error} />}
            {previewLoading && <Spin />}
            {preview.data && !preview.data.hasData && <Alert type="info" showIcon message="该日期暂无生产记录" />}
            {preview.data && <pre className={styles.previewContent}>{preview.data.content}</pre>}
          </>
        )}
      </Modal>

      <Modal open={repeatConfirmation !== null} title="确认重复推送" okText="确认重发" cancelText="取消"
        onOk={() => { if (repeatConfirmation) void handleSend(repeatConfirmation); }} onCancel={() => setRepeatConfirmation(null)}
        okButtonProps={{ disabled: busy }} maskClosable={false}>
        <p>{repeatConfirmation?.date} · {productionSourceLabel(repeatConfirmation?.source ?? null)}的日报可能已经发送，请先核查企业微信群，再确认是否重发。</p>
      </Modal>

      <Spin spinning={loading}>
        {report ? (
          <>
            {/* Summary Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic title="装配产线" value={asm?.lines || 0} suffix="条" />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="装配总产量"
                    value={asm?.totalActualQty || 0}
                    suffix="PCS"
                    valueStyle={{ color: "#1677ff" }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="注塑总产量"
                    value={inj?.totalQty || 0}
                    suffix="PCS"
                    valueStyle={{ color: "#722ed1" }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="不良总数"
                    value={(asm?.totalDefects || 0) + (inj?.totalDefects || 0)}
                    suffix="PCS"
                    valueStyle={{
                      color: (asm?.totalDefects || 0) + (inj?.totalDefects || 0) > 0 ? "#ff4d4f" : "#52c41a",
                    }}
                  />
                </Card>
              </Col>
            </Row>

            {/* Backorder alerts */}
            {(asm && asm.totalBackorder > 0) || (inj && inj.totalBackorder > 0) ? (
              <Card size="small" style={{ marginBottom: 16, background: "#fffbe6", border: "1px solid #ffe58f" }}>
                <Space>
                  <WarningOutlined style={{ color: "#faad14" }} />
                  <span>
                    订单积压预警：
                    {asm && asm.totalBackorder > 0 && `装配部 ${asm.totalBackorder.toLocaleString()} PCS`}
                    {asm && asm.totalBackorder > 0 && inj && inj.totalBackorder > 0 && "，"}
                    {inj && inj.totalBackorder > 0 && `注塑部 ${inj.totalBackorder.toLocaleString()} PCS`}
                  </span>
                </Space>
              </Card>
            ) : null}

            {/* Department Tabs */}
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <Tabs.TabPane tab={`装配部（${asm?.lines || 0} 条产线）`} key="assembly">
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Row gutter={[16, 8]}>
                    <Col xs={12} sm={4}>
                      <Statistic title="计划总量" value={asm?.totalPlanQty || 0} suffix="PCS" />
                    </Col>
                    <Col xs={12} sm={4}>
                      <Statistic title="实际产量" value={asm?.totalActualQty || 0} suffix="PCS" valueStyle={{ color: "#1677ff" }} />
                    </Col>
                    <Col xs={12} sm={4}>
                      <Statistic
                        title="达成率"
                        value={formatReportRate(asm?.avgAchievementRate, 0)}
                        className={rateClass(asm?.avgAchievementRate)}
                      />
                    </Col>
                    <Col xs={12} sm={4}>
                      <Statistic
                        title="合格率"
                        value={formatReportRate(asm?.avgQualifiedRate)}
                        className={rateClass(asm?.avgQualifiedRate)}
                      />
                    </Col>
                    <Col xs={12} sm={4}>
                      <Statistic title="不良数" value={asm?.totalDefects || 0} suffix="PCS" valueStyle={{ color: asm && asm.totalDefects > 0 ? "#ff4d4f" : "#52c41a" }} />
                    </Col>
                    <Col xs={12} sm={4}>
                      <Statistic title="累计欠数" value={asm?.totalBackorder || 0} suffix="PCS" valueStyle={{ color: asm && asm.totalBackorder > 0 ? "#faad14" : undefined }} />
                    </Col>
                  </Row>
                </Card>
                <ResponsiveTable
                  columns={assemblyColumns}
                  dataSource={assemblyDataSource}
                  pagination={false}
                  size="small"
                  minWidth={1300}
                  bordered
                />
              </Tabs.TabPane>

              <Tabs.TabPane tab={`注塑部（${inj?.machines || 0} 个班次）`} key="injection">
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Row gutter={[16, 8]}>
                    <Col xs={12} sm={6}>
                      <Statistic title="机台班次" value={inj?.machines || 0} suffix="个" />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic title="总产量" value={inj?.totalQty || 0} suffix="PCS" valueStyle={{ color: "#722ed1" }} />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="合格率"
                        value={formatReportRate(inj?.avgQualifiedRate)}
                        className={rateClass(inj?.avgQualifiedRate)}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic title="不良数" value={inj?.totalDefects || 0} suffix="PCS" valueStyle={{ color: inj && inj.totalDefects > 0 ? "#ff4d4f" : "#52c41a" }} />
                    </Col>
                  </Row>
                </Card>
                <ResponsiveTable
                  columns={injectionColumns}
                  dataSource={injectionDataSource}
                  pagination={false}
                  size="small"
                  minWidth={1200}
                  bordered
                />
              </Tabs.TabPane>
            </Tabs>
          </>
        ) : (
          <Card style={{ textAlign: "center", padding: 60 }}>
            <div style={{ color: "#999", marginBottom: 16, fontSize: 16 }}>
              {loading ? "正在获取生产汇总数据..." : `${dateStr} 暂无生产数据`}
            </div>
            {!loading && (
              <Button type="primary" icon={<ReloadOutlined />} onClick={handleRefresh} disabled={busy}>
                刷新数据
              </Button>
            )}
          </Card>
        )}
      </Spin>
    </div>
  );
}
