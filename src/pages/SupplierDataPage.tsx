import { useEffect, useState, useCallback, useMemo } from "react";
import { Input, Typography, Spin, Empty, message } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { api } from "../lib/api";
import { getCache, setCache } from "../lib/kingdeeCache";
import type { KingdeeSupplier } from "../types/kingdee";
import styles from "./DataTablePage.module.css";
import { ResponsiveTable } from "../components/ResponsiveTable";

const { Title, Text } = Typography;

const CACHE_KEY = "suppliers";

export function SupplierDataPage() {
  const [suppliers, setSuppliers] = useState<KingdeeSupplier[]>(() => getCache<KingdeeSupplier[]>(CACHE_KEY) || []);
  const [loading, setLoading] = useState(() => !getCache<KingdeeSupplier[]>(CACHE_KEY));
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; data: KingdeeSupplier[] }>("/api/kingdee/suppliers");
      setSuppliers(res.data);
      setCache(CACHE_KEY, res.data);
    } catch (err) {
      message.error((err as Error).message || "获取供应商数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData(!getCache<KingdeeSupplier[]>(CACHE_KEY)));
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const kw = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        s.number.toLowerCase().includes(kw) ||
        s.name.toLowerCase().includes(kw) ||
        s.group_name?.toLowerCase().includes(kw)
    );
  }, [suppliers, search]);

  const columns: TableColumnsType<KingdeeSupplier> = [
    {
      title: "编码",
      dataIndex: "number",
      width: 120,
      fixed: "left",
    },
    {
      title: "名称",
      dataIndex: "name",
      width: 280,
      ellipsis: true,
    },
    {
      title: "分组",
      dataIndex: "group_name",
      width: 120,
      ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "税率",
      dataIndex: "rate",
      width: 70,
      render: (v) => (v && v !== "0" ? `${v}%` : "-"),
    },
    {
      title: "纳税人号",
      dataIndex: "taxpayer_no",
      width: 160,
      ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 200,
      ellipsis: true,
      render: (v) => v || "-",
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Title level={4} style={{ margin: 0 }}>
            供应商资料
          </Title>
          <Text type="secondary">共 {suppliers.length} 个供应商</Text>
        </div>
        <ReloadOutlined
          onClick={() => fetchData(true)}
          style={{ cursor: "pointer", fontSize: 16, color: "#1677ff" }}
          spin={loading}
        />
      </div>

      <div className={styles.content}>
        <div className={styles.searchBar}>
          <Input
            placeholder="搜索编码、名称、分组..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 320 }}
          />
          <Text type="secondary">筛选结果：{filtered.length} 条</Text>
        </div>

        {loading ? (
          <div className={styles.loadingWrap}>
            <Spin size="large" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty description="没有匹配的供应商" />
        ) : (
          <ResponsiveTable
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            size="small"
            minWidth={1000}
            scroll={{ y: "calc(100vh - 340px)" }}
            pagination={{
              defaultPageSize: 50,
              showSizeChanger: true,
              pageSizeOptions: ["20", "50", "100"],
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        )}
      </div>
    </div>
  );
}
