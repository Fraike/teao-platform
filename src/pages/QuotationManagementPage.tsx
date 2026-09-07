import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Image,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PictureOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { api } from "../lib/api";
import type { ManagedQuotation, Product, QuotationProductPreview } from "../types/quotation";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { formatDomesticPrice } from "../lib/quotationCompatibility";

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface QuotationListResponse {
  ok: true;
  data: ManagedQuotation[];
  total: number;
  page: number;
  pageSize: number;
}

interface QuotationResponse {
  ok: true;
  data: ManagedQuotation;
}

export default function QuotationManagementPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [records, setRecords] = useState<ManagedQuotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [market, setMarket] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<ManagedQuotation | null>(null);
  const pageSize = 20;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (market) params.set("market", market);
      if (dateRange) {
        params.set("dateFrom", dateRange[0].format("YYYY-MM-DD"));
        params.set("dateTo", dateRange[1].format("YYYY-MM-DD"));
      }
      const result = await api.get<QuotationListResponse>(`/api/quotations?${params.toString()}`);
      setRecords(result.data);
      setTotal(result.total);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "报价查询失败");
    } finally {
      setLoading(false);
    }
  }, [dateRange, keyword, market, messageApi, page]);

  useEffect(() => {
    void Promise.resolve().then(loadRecords);
  }, [loadRecords]);

  const openDetail = async (id: string) => {
    try {
      const result = await api.get<QuotationResponse>(`/api/quotations/${encodeURIComponent(id)}`);
      setSelected(result.data);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "报价读取失败");
    }
  };

  const editQuotation = (record: ManagedQuotation) => {
    const route = record.market === "international" ? "/quotation-intl" : "/quotation";
    navigate(`${route}?id=${encodeURIComponent(record.id)}`);
  };

  const copyQuotation = (record: ManagedQuotation) => {
    const route = record.market === "international" ? "/quotation-intl" : "/quotation";
    navigate(`${route}?copyId=${encodeURIComponent(record.id)}`);
  };

  const deleteQuotation = async (id: string) => {
    try {
      await api.delete(`/api/quotations/${encodeURIComponent(id)}`);
      if (selected?.id === id) setSelected(null);
      messageApi.success("报价已删除");
      if (records.length === 1 && page > 1) setPage(page - 1);
      else await loadRecords();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "报价删除失败");
    }
  };

  const columns: ColumnsType<ManagedQuotation> = [
    {
      title: "报价类型",
      dataIndex: "market",
      width: 88,
      align: "left",
      render: (value: ManagedQuotation["market"]) => (
        <Tag color={value === "international" ? "blue" : "green"}>
          {value === "international" ? "国际" : "国内"}
        </Tag>
      ),
    },
    {
      title: "报价单号",
      dataIndex: "quoteNo",
      width: 148,
      align: "left",
      ellipsis: true,
      render: (value: string) => <Text code style={{ whiteSpace: "nowrap" }}>{value}</Text>,
    },
    { title: "报价日期", dataIndex: "quoteDate", width: 108, align: "left" },
    { title: "客户名称", dataIndex: "customerName", width: 170, align: "left", ellipsis: true },
    {
      title: "产品信息",
      key: "products",
      width: 390,
      align: "left",
      className: "quotation-products-cell",
      render: (_value, record) => <ProductList products={record.previewProducts || []} total={record.productCount} />,
    },
    { title: "产品数", dataIndex: "productCount", width: 76, align: "left" },
    {
      title: "金额",
      dataIndex: "totalAmount",
      width: 150,
      align: "left",
      render: (_value: number, record) => (
        <Text strong style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
          {record.currency} {record.totalAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    { title: "报价人", dataIndex: "salesName", width: 100, align: "left", ellipsis: true },
    { title: "实际报价人", dataIndex: "actualQuoterName", width: 110, align: "left", ellipsis: true, render: (value: string) => value || "-" },
    { title: "最后更新", dataIndex: "updatedAt", width: 148, align: "left", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
    {
      title: "操作",
      key: "actions",
      width: 142,
      align: "left",
      fixed: "right",
      render: (_value, record) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record.id)} title="查看报价" />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => editQuotation(record)} title="编辑报价" />
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyQuotation(record)} title="复制为新报价" />
          <Popconfirm title="删除后无法在报价管理中恢复，确定继续？" onConfirm={() => void deleteQuotation(record.id)} okText="删除" cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除报价" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "20px 24px", minHeight: "100%" }}>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>报价管理</Typography.Title>
          <Text type="secondary">集中查询、查看和维护已提交的国内及国际报价</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadRecords()} loading={loading}>刷新</Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          allowClear
          value={keyword}
          onChange={(event) => { setKeyword(event.target.value); setPage(1); }}
          onPressEnter={() => void loadRecords()}
          prefix={<SearchOutlined />}
          placeholder="报价单号、客户、报价人"
          style={{ width: 250 }}
        />
        <Select
          allowClear
          value={market}
          onChange={(value) => { setMarket(value); setPage(1); }}
          placeholder="全部报价类型"
          style={{ width: 150 }}
          options={[{ value: "domestic", label: "国内报价" }, { value: "international", label: "国际报价" }]}
        />
        <RangePicker
          value={dateRange}
          onChange={(value) => { setDateRange(value as [dayjs.Dayjs, dayjs.Dayjs] | null); setPage(1); }}
          placeholder={["报价开始日期", "报价结束日期"]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void loadRecords()}>查询</Button>
      </Space>

      <style>{`
        .quotation-management-table .ant-table-cell {
          text-align: left !important;
          vertical-align: top;
          white-space: nowrap;
        }
        .quotation-management-table .quotation-products-cell {
          white-space: normal;
        }
        .quotation-management-table .ant-table-thead > tr > th {
          color: #475569;
          font-weight: 600;
        }
      `}</style>
      <ResponsiveTable<ManagedQuotation>
        className="quotation-management-table"
        rowKey="id"
        columns={columns}
        dataSource={records}
        loading={loading}
        tableLayout="fixed"
        minWidth={1482}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 条报价`,
          onChange: (nextPage) => setPage(nextPage),
        }}
        locale={{ emptyText: "暂无已提交报价" }}
      />

      <QuotationDetailDrawer record={selected} onClose={() => setSelected(null)} onEdit={editQuotation} onCopy={copyQuotation} />
    </div>
  );
}

function QuotationDetailDrawer({ record, onClose, onEdit, onCopy }: { record: ManagedQuotation | null; onClose: () => void; onEdit: (record: ManagedQuotation) => void; onCopy: (record: ManagedQuotation) => void }) {
  const quotation = record?.quotation;
  const productColumns: ColumnsType<Product> = [
    {
      title: "图片",
      dataIndex: "image",
      width: 70,
      align: "left",
      render: (value: string | undefined, product) => <ProductThumbnail image={value} name={product.name} size={42} />,
    },
    { title: "产品名称", dataIndex: "name", width: 180, align: "left", ellipsis: true },
    { title: "产品型号", dataIndex: "partNo", width: 150, align: "left", ellipsis: true, render: (value: string) => value || "-" },
    { title: "规格", dataIndex: "spec", width: 150, align: "left", ellipsis: true, render: (value: string) => value || "-" },
    { title: "数量", dataIndex: "qty", width: 80, align: "left", render: (value: number, product) => product.tierPricingEnabled ? "-" : value ?? "-" },
    {
      title: "单价",
      dataIndex: "price",
      width: 220,
      align: "left",
      render: (value: number, product) => product.tierPricingEnabled ? (
        <Space direction="vertical" size={2}>
          <Tag color="blue">阶梯报价</Tag>
          {[...(product.tiers || [])].sort((left, right) => left.minQty - right.minQty).map((tier) => (
            <Text key={tier.id}>MOQ ≥ {tier.minQty.toLocaleString("zh-CN")} {product.unit || "PCS"}：{record?.currency || "CNY"} {record?.market === "international" ? tier.price.toFixed(3) : formatDomesticPrice(tier.price)}</Text>
          ))}
        </Space>
      ) : record?.market === "international"
        ? (value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
        : formatDomesticPrice(value ?? 0),
    },
    { title: "运费", dataIndex: "freight", width: 100, align: "left", render: (value: number) => value ? value.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-" },
    { title: "备注", dataIndex: "remark", align: "left", ellipsis: true, render: (value: string) => value || "-" },
  ];

  return (
    <Drawer
      title={record ? `${record.market === "international" ? "国际" : "国内"}报价详情` : "报价详情"}
      open={Boolean(record)}
      onClose={onClose}
      width={960}
      extra={record ? (
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => onCopy(record)}>复制报价</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => onEdit(record)}>编辑报价</Button>
        </Space>
      ) : undefined}
    >
      {record && quotation && (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Descriptions title="报价信息" bordered size="small" column={2}>
            <Descriptions.Item label="报价单号">{record.quoteNo}</Descriptions.Item>
            <Descriptions.Item label="报价日期">{record.quoteDate}</Descriptions.Item>
            <Descriptions.Item label="报价人">{record.salesName || "-"}</Descriptions.Item>
            <Descriptions.Item label="实际报价人">{record.actualQuoterName || "-"}</Descriptions.Item>
            <Descriptions.Item label="币种">{record.currency || "-"}</Descriptions.Item>
            <Descriptions.Item label="创建信息">{record.createdBy} / {dayjs(record.createdAt).format("YYYY-MM-DD HH:mm")}</Descriptions.Item>
            <Descriptions.Item label="更新信息">{record.updatedBy} / {dayjs(record.updatedAt).format("YYYY-MM-DD HH:mm")}</Descriptions.Item>
          </Descriptions>
          <Descriptions title="客户资料" bordered size="small" column={2}>
            <Descriptions.Item label="客户名称">{quotation.customer.name}</Descriptions.Item>
            <Descriptions.Item label="联系人">{quotation.customer.contact || "-"}</Descriptions.Item>
            <Descriptions.Item label="电话">{quotation.customer.tel || "-"}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{quotation.customer.email || "-"}</Descriptions.Item>
            <Descriptions.Item label="地址" span={2}>{quotation.customer.address || "-"}</Descriptions.Item>
          </Descriptions>
          <div>
            <Text strong>产品明细</Text>
            <Table<Product> rowKey="id" columns={productColumns} dataSource={quotation.products} size="small" pagination={false} tableLayout="fixed" scroll={{ x: 950 }} style={{ marginTop: 8 }} />
          </div>
          {quotation.molds.length > 0 && (
            <div>
              <Text strong>模具费用</Text>
              <Table rowKey="id" size="small" pagination={false} style={{ marginTop: 8 }} dataSource={quotation.molds} columns={[
                { title: "模具名称", dataIndex: "name", align: "left" },
                { title: "总费用", dataIndex: "totalCost", align: "left", render: (value: number) => value.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) },
                { title: "分摊数量", dataIndex: "amortizeQty", align: "left" },
              ]} />
            </div>
          )}
          {quotation.terms.length > 0 && (
            <div>
              <Text strong>报价条款</Text>
              <div style={{ marginTop: 8, whiteSpace: "pre-wrap", color: "#595959", lineHeight: 1.8 }}>{quotation.terms.join("\n")}</div>
            </div>
          )}
        </Space>
      )}
    </Drawer>
  );
}

function ProductList({ products, total }: { products: QuotationProductPreview[]; total: number }) {
  if (products.length === 0) return <Text type="secondary">未填写产品资料</Text>;
  const moreCount = Math.max(total - products.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {products.map((product, index) => {
        const model = product.partNo || product.spec || "未填写型号";
        return (
          <div key={`${product.id}_${index}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, height: 40 }}>
            <ProductThumbnail image={product.image} name={product.name} size={36} />
            <Tooltip title={`${product.name || "未命名产品"} / 型号：${model}`}>
              <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <Text strong style={{ whiteSpace: "nowrap" }}>{product.name || "未命名产品"}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12, whiteSpace: "nowrap" }}>型号：{model}</Text>
              </div>
            </Tooltip>
          </div>
        );
      })}
      {moreCount > 0 && <Tag style={{ marginInlineEnd: 0, width: "fit-content" }}>另有 {moreCount} 个产品，请查看详情</Tag>}
    </div>
  );
}

function ProductThumbnail({ image, name, size }: { image?: string; name: string; size: number }) {
  if (!image) {
    return (
      <div style={{ width: size, height: size, display: "grid", placeItems: "center", flex: "0 0 auto", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8" }}>
        <PictureOutlined />
      </div>
    );
  }
  return <Image src={image} alt={name} width={size} height={size} preview={{ mask: "预览" }} style={{ objectFit: "cover", border: "1px solid #e2e8f0" }} />;
}
