import { useTabState, useTabPageAdapter, useTabBusy, useTabInitialEffect, useTabDispose } from "../lib/tabPageContext";
import { useCallback, useMemo, useRef, useState } from "react";
import { Input, Select, Typography, Spin, Card, Space, Tag, Button, Modal, message } from "antd";
import {useNavigate} from 'react-router-dom';
import {findCustomerProductStandards} from '../lib/customerProductStandards';
import type {StandardListItem} from '../types/standard';
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../lib/api";
import { getCache, setCache } from "../lib/kingdeeCache";
import { ResponsiveTable } from "../components/ResponsiveTable";
import styles from "./DataTablePage.module.css";
import { createCustomerProductSearchCoordinator } from "../lib/customerProductSearch";

const { Title } = Typography;

import type { OutsideMaterial } from "../types/customerProduct";

const CACHE_KEY = "outside_materials_v3_default";
const PAGE_SIZE = 50;

export function CustomerProductPage() {
  const navigate = useNavigate();
  const standardRequest = useRef<AbortController | null>(null);
  const [openingStandard, setOpeningStandard] = useState('');
  const [standardChoices, setStandardChoices] = useState<StandardListItem[]>([]);
  useTabDispose(() => standardRequest.current?.abort(), 'customer-products:standard-link');
  const openStandard = async (row: OutsideMaterial) => {
    standardRequest.current?.abort();
    const request = new AbortController(); standardRequest.current = request;
    setOpeningStandard(row.id); setStandardChoices([]);
    try {
      const matches = await findCustomerProductStandards(row.material_number || '', request.signal);
      if (request.signal.aborted) return;
      if (matches.length === 1) navigate(`/product-standards?standardId=${encodeURIComponent(matches[0].id)}`);
      else if (matches.length) setStandardChoices(matches);
      else message.info('未找到该内部料号对应的可查看产品标准');
    } catch (error) {
      if (!request.signal.aborted) message.error(error instanceof Error ? error.message : '产品标准查询失败');
    } finally {
      if (!request.signal.aborted) setOpeningStandard('');
    }
  };
  const [data, setData] = useTabState<OutsideMaterial[]>("CustomerProductPage.data", () => getCache<OutsideMaterial[]>(CACHE_KEY) || []);
  const [loaded, setLoaded] = useTabState("CustomerProductPage.loaded", false);
  useTabPageAdapter(loaded);
  const [loading, setLoading] = useTabState("CustomerProductPage.loading", false);
  const [search, setSearch] = useTabState("CustomerProductPage.search", "");
  const [typeFilter, setTypeFilter] = useTabState<string | null>("CustomerProductPage.typeFilter", "2"); // 默认只看客户
  const [submitted, setSubmitted] = useTabState("CustomerProductPage.submitted", { search: "", type: "2" as string | null });
  const [loadedSubmission, setLoadedSubmission] = useTabState<typeof submitted | null>("CustomerProductPage.loadedSubmission", null);
  const coordinator = useMemo(() => createCustomerProductSearchCoordinator(), []);
  const displayedQuery = useRef("|2");

  useTabBusy(loading);

  const fetchData = useCallback(async () => {
    const request = coordinator.begin();
    setLoadedSubmission(null);
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
      setLoadedSubmission(submitted);
      setLoaded(true);
      if (!keyword && submitted.type === "2") setCache(CACHE_KEY, res.data);
    } catch (error) {
      if (coordinator.isCurrent(request)) message.error(error instanceof Error ? error.message : "客户商品查询失败");
    } finally {
      if (coordinator.isCurrent(request)) { setLoaded(true); setLoading(false); }
    }
  }, [submitted, coordinator, setData, setLoaded, setLoading, setLoadedSubmission]);

  useTabDispose(() => coordinator.cancel(),'customer-products:cancel');
  useTabInitialEffect("CustomerProductPage.initial", () => {
    void fetchData();
  }, [submitted], loadedSubmission === submitted);

  const rows = useMemo(() => data.map((item) => ({ ...item, key: item.id })), [data]);
  const submitSearch = () => setSubmitted({ search: search.trim(), type: typeFilter });

  const allColumns: ColumnsType<OutsideMaterial> = [
    { title: "客户名称", dataIndex: "customer_name", key: "cn", width: 150, fixed: "left",
      render: (v: string) => <Typography.Text strong>{v || "—"}</Typography.Text> },
    { title: "客户编码", dataIndex: "customer_number", key: "cnum", width: 100 },
    { title: submitted.type === "1" ? "供应商商品编码" : submitted.type === "2" ? "客户商品编码" : "外部商品编码", dataIndex: "number", key: "num", width: 150, ellipsis: true },
    { title: "内部料号", dataIndex: "material_number", key: "material_number", width: 150,
      render: (value: string, row) => value ? <Button type="link" size="small" loading={openingStandard === row.id} onClick={() => void openStandard(row)}>{value}</Button> : '未匹配' },
    { title: "内部商品名称", dataIndex: "material_name", key: "mn", width: 200, ellipsis: true },
    { title: "规格型号", dataIndex: "outside_model", key: "om", width: 120, ellipsis: true },
    { title: "单位", dataIndex: "outside_unit", key: "ou", width: 70, align: "center" as const },
    { title: "条形码", dataIndex: "outside_barcode", key: "ob", width: 120 },
    { title: "类型", dataIndex: "type_name", key: "tn", width: 80,
      render: (v: string) => <Tag color={v === "客户" ? "blue" : "orange"}>{v}</Tag> },
    { title: "外部唯一标识", dataIndex: "outside_pk_id", key: "pk", width: 120, ellipsis: true },
  ];
  const optionalFields = new Map([["ou", "outside_unit"], ["ob", "outside_barcode"], ["pk", "outside_pk_id"]] as const);
  const columns = allColumns.filter(column => {
    const field = optionalFields.get(column.key as "ou" | "ob" | "pk");
    return !field || data.some(row => String(row[field] ?? "").trim() !== "");
  });
  const tableWidth = columns.reduce((width, column) => width + Number(column.width || 0), 0);

  return (
    <div className={styles.customerProductContainer}>
      <Modal title="选择对应的产品标准" open={standardChoices.length > 0} footer={null} onCancel={() => setStandardChoices([])}>
        <Space direction="vertical">
          {standardChoices.map(standard => <Button key={standard.id} type="link" onClick={() => { setStandardChoices([]); navigate(`/product-standards?standardId=${encodeURIComponent(standard.id)}`); }}>
            {standard.serialNo} · {standard.customer || '未填写客户'} · {standard.categoryName} · V{standard.versionNo}
          </Button>)}
        </Space>
      </Modal>
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
          fitViewport
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          size="small"
          minWidth={tableWidth}
          bordered
          locale={{ emptyText: "暂无数据，点击搜索查询" }}
        />
      </Spin>
    </div>
  );
}
