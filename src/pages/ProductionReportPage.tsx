import { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Typography, DatePicker, Tabs, Table, Button,
  Statistic, Spin, message, Tag, Space,
} from "antd";
import {
  ReloadOutlined, SendOutlined, WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useIsMobile } from "../lib/useIsMobile";
import { api } from "../lib/api";

const { Title } = Typography;

interface LineSummary {
  line: string;
  products: ProductRecord[];
  totalPlan: number;
  totalActual: number;
  totalDefects: number;
  totalBackorder: number;
  recordCount: number;
}

interface ProductRecord {
  date?: string;
  name: string;
  spec?: string;
  customer?: string;
  material?: string;
  planQty: number;
  actualQty: number;
  achievementRate: number | null;
  defects: number;
  qualifiedRate: number | null;
  backorder: number;
  batchNo: string;
  operator?: string;
  remark?: string;
}

interface MachineSummary {
  machine: string;
  shift: string;
  products: ProductRecord[];
  totalQty: number;
  totalDefects: number;
  totalBackorder: number;
  recordCount: number;
}

interface ReportData {
  date: string;
  assembly: {
    records: LineSummary[];
    summary: {
      lines: number;
      totalPlanQty: number;
      totalActualQty: number;
      totalDefects: number;
      totalBackorder: number;
      avgAchievementRate: number;
      avgQualifiedRate: number;
    };
  };
  injection: {
    records: MachineSummary[];
    summary: {
      machines: number;
      totalQty: number;
      totalDefects: number;
      totalBackorder: number;
      avgQualifiedRate: number;
    };
  };
}

export function ProductionReportPage() {
  const isMobile = useIsMobile();
  const [date, setDate] = useState(() => dayjs().subtract(1, "day"));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("assembly");

  const dateStr = date.format("YYYY-MM-DD");

  const fetchReport = useCallback(async (d: string, force = false) => {
    setLoading(true);
    try {
      if (force) {
        await api.post<{
          ok: boolean;
          date: string;
          assembly: { summary: unknown; rawCount: number };
          injection: { summary: unknown; rawCount: number };
        }>(`/api/production/fetch?date=${d}`);
      }
      const data = await api.get<ReportData & { exists: boolean }>(`/api/production/report?date=${d}`);
      if (data.exists) {
        setReport(data as ReportData);
      } else {
        setReport(null);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReport(dateStr, true);
  }, [dateStr, fetchReport]);

  const handleRefresh = () => fetchReport(dateStr, true);

  const handleSend = async () => {
    setSending(true);
    try {
      await api.post<{ ok: boolean; date: string; message: string }>(`/api/production/send?date=${dateStr}`);
      message.success("已推送到企业微信群");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "推送失败");
    } finally {
      setSending(false);
    }
  };

  const rateColor = (rate: number | null, threshold = 0.95) => {
    if (rate === null) return "default";
    return rate >= threshold ? "success" : "error";
  };

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
          <Tag color={rateColor(v)}>{(v * 100).toFixed(0)}%</Tag>
        ) : "-",
    },
    {
      title: "不良数", dataIndex: "defects", key: "defects", width: 65,
      render: (v: number) => (v > 0 ? <span style={{ color: "#ff4d4f" }}>{v}</span> : "0"),
    },
    {
      title: "合格率", dataIndex: "qualifiedRate", key: "qualifiedRate", width: 75,
      render: (v: number | null) =>
        v != null ? (
          <Tag color={rateColor(v)}>{(v * 100).toFixed(1)}%</Tag>
        ) : "-",
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
          <Tag color={rateColor(v)}>{(v * 100).toFixed(1)}%</Tag>
        ) : "-",
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
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "16px" : "24px" }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 20, flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
            生产日报
          </Title>
          <DatePicker
            value={date}
            onChange={(d) => setDate(d || dayjs())}
            allowClear={false}
            size="large"
            className="production-date-picker"
            style={{ marginTop: 8, minWidth: 260 }}
            format="YYYY年M月D日"
            inputReadOnly
          />
          <style>{`
            .production-date-picker.ant-picker-large input {
              font-size: 22px !important;
              font-weight: 600 !important;
            }
            .production-date-picker.ant-picker-large {
              height: 48px !important;
            }
          `}</style>
        </div>
        <Space style={{ marginTop: isMobile ? 0 : 8 }}>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
            刷新数据
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={sending}
            disabled={!report}
          >
            推送到企微
          </Button>
        </Space>
      </div>

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
                        value={asm ? (asm.avgAchievementRate * 100).toFixed(0) : 0}
                        suffix="%"
                        valueStyle={{
                          color: asm && asm.avgAchievementRate >= 0.95 ? "#52c41a" : "#ff4d4f",
                        }}
                      />
                    </Col>
                    <Col xs={12} sm={4}>
                      <Statistic
                        title="合格率"
                        value={asm ? (asm.avgQualifiedRate * 100).toFixed(1) : 0}
                        suffix="%"
                        valueStyle={{
                          color: asm && asm.avgQualifiedRate >= 0.95 ? "#52c41a" : "#ff4d4f",
                        }}
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
                <Table
                  columns={assemblyColumns}
                  dataSource={assemblyDataSource}
                  pagination={false}
                  size="small"
                  scroll={{ x: 1300 }}
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
                        value={inj ? (inj.avgQualifiedRate * 100).toFixed(1) : 0}
                        suffix="%"
                        valueStyle={{
                          color: inj && inj.avgQualifiedRate >= 0.95 ? "#52c41a" : "#ff4d4f",
                        }}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic title="不良数" value={inj?.totalDefects || 0} suffix="PCS" valueStyle={{ color: inj && inj.totalDefects > 0 ? "#ff4d4f" : "#52c41a" }} />
                    </Col>
                  </Row>
                </Card>
                <Table
                  columns={injectionColumns}
                  dataSource={injectionDataSource}
                  pagination={false}
                  size="small"
                  scroll={{ x: 1200 }}
                  bordered
                />
              </Tabs.TabPane>
            </Tabs>
          </>
        ) : (
          <Card style={{ textAlign: "center", padding: 60 }}>
            <div style={{ color: "#999", marginBottom: 16, fontSize: 16 }}>
              {loading ? "正在从维格表获取数据..." : `${dateStr} 暂无生产数据`}
            </div>
            {!loading && (
              <Button type="primary" icon={<ReloadOutlined />} onClick={handleRefresh}>
                从维格表获取数据
              </Button>
            )}
          </Card>
        )}
      </Spin>
    </div>
  );
}
