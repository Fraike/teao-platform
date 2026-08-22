import { useEffect, useState, useCallback } from "react";
import { Input, Select, Typography, Spin, Card, Space, Tag, Button } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../lib/api";
import { getCache, setCache } from "../lib/kingdeeCache";
import { ResponsiveTable } from "../components/ResponsiveTable";

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

const CACHE_KEY = "outside_materials";
const PAGE_SIZE = 50;

export function CustomerProductPage() {
  const [data, setData] = useState<OutsideMaterial[]>(() => getCache<OutsideMaterial[]>(CACHE_KEY) || []);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>("2"); // 默认只看客户

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      const res = await api.get<{ ok: boolean; data: OutsideMaterial[] }>(
        `/api/kingdee/outside-materials?${params.toString()}`
      );
      if (res.ok) {
        setData(res.data);
        setCache(CACHE_KEY, res.data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, typeFilter]);

  useEffect(() => { void Promise.resolve().then(fetchData); }, [fetchData]);

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
            onChange={setTypeFilter}
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
            onPressEnter={fetchData}
            allowClear
            style={{ width: 280 }}
            prefix={<SearchOutlined />}
          />
          <Button type="link" size="small" onClick={fetchData}>搜索</Button>
          <Button type="link" size="small" onClick={() => { setSearch(""); setTypeFilter("2"); }}>重置</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12, background: "#fafafa" }}>
        <Space size="large">
          <span>共 <b>{data.length}</b> 条记录</span>
          <span>筛选: {typeFilter === "2" ? "客户" : typeFilter === "1" ? "供应商" : "全部"} | 搜索: {search || "无"}</span>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <ResponsiveTable
          columns={columns}
          dataSource={data.map((r) => ({ ...r, key: r.id }))}
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
