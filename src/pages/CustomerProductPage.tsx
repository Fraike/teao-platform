import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Input, Select, Typography, Spin, Card, Space, Tag, Button, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../lib/api";
import { getCache, setCache } from "../lib/kingdeeCache";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { createCustomerProductSearchCoordinator } from "../lib/customerProductSearch";

const { Title } = Typography;

interface OutsideMaterial {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_number: string;
  material_id: string;
  material_name: string;
  name: string;
  number: string;
  outside_model: string;
  outside_unit: string;
  outside_barcode: string;
  outside_pk_id: string;
  is_bind_relation: boolean;
  type: string; // "1"=供应商 "2"=客户
  type_name: string;
  unit_name: string;
}

const CACHE_KEY = "outside_materials_v2_default";
const PAGE_SIZE = 50;

export function CustomerProductPage() {
  const [data, setData] = useState<OutsideMaterial[]>(() => getCache<OutsideMaterial[]>(CACHE_KEY) || []);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>("2"); // 默认只看客户
  const [submitted, setSubmitted] = useState({ search: "", type: "2" as string | null });
  const coordinator = useMemo(() => createCustomerProductSearchCoordinator(), []);
  const displayedQuery = useRef("|2");

  const fetchData = useCallback(async () => {
    const request = coordinator.begin();
    const keyword = submitted.search.trim();
    const queryKey = `${keyword}|${submitted.type || ""}`;
    if (displayedQuery.current !== queryKey) {
      setData([]);
      displayedQuery.current = queryKey;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("search", keyword);
      if (submitted.type) params.set("type", submitted.type);
      const res = await api.get<{ ok: boolean; data: OutsideMaterial[] }>(
        `/api/kingdee/outside-materials?${params.toString()}`,
        { signal: request.signal },
      );
      if (!res.ok) throw new Error("客户商品查询失败");
      if (!coordinator.isCurrent(request)) return;
      setData(res.data);
      if (!keyword && submitted.type === "2") setCache(CACHE_KEY, res.data);
    } catch (error) {
      if (coordinator.isCurrent(request)) message.error(error instanceof Error ? error.message : "客户商品查询失败");
    } finally {
      if (coordinator.isCurrent(request)) setLoading(false);
    }
  }, [submitted, coordinator]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return fetchData(); });
    return () => { active = false; coordinator.cancel(); };
  }, [fetchData, coordinator]);

  const rows = useMemo(() => data.map((item) => ({ ...item, key: item.id })), [data]);
  const submitSearch = () => setSubmitted({ search: search.trim(), type: typeFilter });

  const columns: ColumnsType<OutsideMaterial> = [
    { title: "客户名称", dataIndex: "customer_name", key: "cn", width: 150, fixed: "left",
      render: (v: string) => <span style={{ fontWeight: 500 }}>{v || "-"}</span> },
    { title: "客户编码", dataIndex: "customer_number", key: "cnum", width: 100 },
    { title: "商品名称", dataIndex: "material_name", key: "mn", width: 200, ellipsis: true },
    { title: "规格型号", dataIndex: "outside_model", key: "om", width: 120, ellipsis: true },
    { title: "编码", dataIndex: "number", key: "num", width: 120 },
    { title: "单位", dataIndex: "outside_unit", key: "ou", width: 70, align: "center" as const },
    { title: "条形码", dataIndex: "outside_barcode", key: "ob", width: 120 },
    { title: "类型", dataIndex: "type_name", key: "tn", width: 80,
      render: (v: string) => <Tag color={v === "客户" ? "blue" : "orange"}>{v}</Tag> },
    { title: "外部唯一标识", dataIndex: "outside_pk_id", key: "pk", width: 120, ellipsis: true },
  ];

  return (
    <div style={{ padding: "16px 16px 16px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>客户商品资料</Title>
        <Space>
          <Select
            value={typeFilter}
            onChange={(value) => {
              setTypeFilter(value);
              setSubmitted({ search: search.trim(), type: value });
            }}
            allowClear
            placeholder="类型筛选"
            style={{ width: 120 }}
            options={[
              { value: "2", label: "客户" },
              { value: "1", label: "供应商" },
            ]}
          />
          <Input
            placeholder="搜索客户名称/商品名称/编码"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={submitSearch}
            allowClear
            style={{ width: 280 }}
            prefix={<SearchOutlined />}
          />
          <Button type="link" size="small" onClick={submitSearch}>搜索</Button>
          <Button type="link" size="small" onClick={() => { setSearch(""); setTypeFilter("2"); setSubmitted({ search: "", type: "2" }); }}>重置</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12, background: "#fafafa" }}>
        <Space size="large">
          <span>共 <b>{data.length}</b> 条记录</span>
          <span>筛选: {submitted.type === "2" ? "客户" : submitted.type === "1" ? "供应商" : "全部"} | 搜索: {submitted.search || "无"}</span>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <ResponsiveTable
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          size="small"
          minWidth={1200}
          bordered
          locale={{ emptyText: "暂无数据，点击搜索查询" }}
        />
      </Spin>
    </div>
  );
}
