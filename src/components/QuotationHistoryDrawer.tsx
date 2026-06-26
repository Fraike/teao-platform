import { useState, useMemo, useEffect } from "react";
import {
  Drawer,
  Table,
  Input,
  DatePicker,
  Space,
  Button,
  Popconfirm,
  Typography,
} from "antd";
import {
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useQuotationHistoryStore } from "../lib/historyStore";
import type { QuotationRecord, Product, MoldItem } from "../types/quotation";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function QuotationHistoryDrawer({ open, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  return (
    <HistoryPanel
      open={open}
      onClose={onClose}
      search={search}
      setSearch={setSearch}
      dateRange={dateRange}
      setDateRange={setDateRange}
    />
  );
}

function HistoryPanel({
  open,
  onClose,
  search,
  setSearch,
  dateRange,
  setDateRange,
}: {
  open: boolean;
  onClose: () => void;
  search: string;
  setSearch: (v: string) => void;
  dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null;
  setDateRange: (v: [dayjs.Dayjs, dayjs.Dayjs] | null) => void;
}) {
  const records = useQuotationHistoryStore((s) => s.records);
  const loading = useQuotationHistoryStore((s) => s.loading);
  const loadRecords = useQuotationHistoryStore((s) => s.loadRecords);
  const removeRecord = useQuotationHistoryStore((s) => s.removeRecord);

  useEffect(() => {
    if (open) loadRecords();
  }, [open, loadRecords]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const kw = search.trim().toLowerCase();
      if (kw) {
        const match =
          r.quoteNo.toLowerCase().includes(kw) ||
          r.customerName.toLowerCase().includes(kw) ||
          r.contact.toLowerCase().includes(kw);
        if (!match) return false;
      }
      if (dateRange) {
        const d = dayjs(r.createdAt);
        if (d.isBefore(dateRange[0], "day") || d.isAfter(dateRange[1], "day")) return false;
      }
      return true;
    });
  }, [records, search, dateRange]);

  const columns: ColumnsType<QuotationRecord> = [
    {
      title: "报价单号",
      dataIndex: "quoteNo",
      width: 140,
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "报价日期",
      dataIndex: "date",
      width: 100,
    },
    {
      title: "客户名称",
      dataIndex: "customerName",
      ellipsis: true,
    },
    {
      title: "产品数",
      dataIndex: "products",
      width: 70,
      render: (v: Product[]) => v.length,
    },
    {
      title: "总金额",
      dataIndex: "totalAmount",
      width: 120,
      render: (_v: number, r: QuotationRecord) => (
        <Text strong style={{ color: "#1677ff", fontFamily: "monospace" }}>
          {r.currency} {(r.totalAmount ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: "报价人",
      dataIndex: "salesName",
      width: 80,
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 110,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
    },
    {
      title: "操作",
      width: 50,
      render: (_v: unknown, r: QuotationRecord) => (
        <Popconfirm
          title="确定删除该记录？"
          onConfirm={() => removeRecord(r.id)}
          okText="删除"
          cancelText="取消"
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Drawer
      title="报价汇总"
      open={open}
      onClose={onClose}
      width={960}
      styles={{ body: { padding: "16px 24px" } }}
    >
      <Space style={{ marginBottom: 16, width: "100%" }} direction="vertical" size={12}>
        <Space wrap>
          <Input
            placeholder="搜索报价单号、客户名称"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            size="middle"
            placeholder={["开始日期", "结束日期"]}
          />
        </Space>
      </Space>

      <Table<QuotationRecord>
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        expandable={{
          expandedRowRender: (r) => <RecordDetail record={r} />,
          expandIcon: ({ expanded, onExpand, record }) => (
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined style={{ color: expanded ? "#1677ff" : "#999" }} />}
              onClick={(e) => onExpand(record, e)}
            />
          ),
        }}
        locale={{ emptyText: "暂无报价记录" }}
      />
    </Drawer>
  );
}

function RecordDetail({ record }: { record: QuotationRecord }) {
  return (
    <div style={{ padding: "12px 16px", background: "#fafafa", borderRadius: 6 }}>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
        产品明细
      </Text>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={td("#")}>#</th>
            <th style={td("left")}>产品名称</th>
            <th style={td("left")}>规格</th>
            <th style={td("left")}>单位</th>
            <th style={td("right")}>单价</th>
            <th style={td("left")}>备注</th>
          </tr>
        </thead>
        <tbody>
          {record.products.map((p: Product, i: number) => (
            <tr key={p.id}>
              <td style={td("#")}>{i + 1}</td>
              <td style={td("left")}>{p.name || "-"}</td>
              <td style={td("left")}>{p.spec || "-"}</td>
              <td style={td("left")}>{p.unit}</td>
              <td style={{ ...td("right"), fontFamily: "monospace" }}>
                {(p.price ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td style={td("left")}>{p.remark || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {record.molds.length > 0 && (
        <>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
            模具费用
          </Text>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={td("left")}>模具名称</th>
                <th style={td("right")}>总费用</th>
                <th style={td("right")}>分摊数量</th>
                <th style={td("right")}>单价</th>
              </tr>
            </thead>
            <tbody>
              {record.molds.map((m: MoldItem) => {
                const unitCost = m.amortizeQty > 0 ? m.totalCost / m.amortizeQty : 0;
                return (
                  <tr key={m.id}>
                    <td style={td("left")}>{m.name || "-"}</td>
                    <td style={{ ...td("right"), fontFamily: "monospace" }}>¥{m.totalCost.toFixed(2)}</td>
                    <td style={td("right")}>{m.amortizeQty.toLocaleString()} PCS</td>
                    <td style={{ ...td("right"), fontFamily: "monospace", color: "#1677ff" }}>¥{unitCost.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {record.terms.length > 0 && (
        <>
          <Text strong style={{ fontSize: 13, display: "block", marginBottom: 4 }}>
            条款
          </Text>
          {record.terms.map((t: string, i: number) => (
            <div key={i} style={{ fontSize: 12, color: "#666", lineHeight: 1.8 }}>{t}</div>
          ))}
        </>
      )}
    </div>
  );
}

function td(align: "left" | "right" | "#"): React.CSSProperties {
  return {
    padding: "6px 10px",
    textAlign: align === "#" ? "center" : align,
    borderBottom: "1px solid #e8e8e8",
    fontSize: 12,
    color: align === "#" ? "#999" : undefined,
    whiteSpace: "nowrap",
  };
}
