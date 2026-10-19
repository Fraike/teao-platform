import { groupStandardFields, activeStandardFields } from "../lib/standardFieldGroups";
import { SeasonalTestStandard } from "../components/standard/SeasonalTestStandard";
import { GearSpecification } from "../components/standard/GearSpecification";
import { StandardUsageGuide } from "../components/standard/StandardUsageGuide";
import { StandardRemindButton } from "../components/standard/StandardRemindButton";
import { lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Tag, Typography, Empty, message, Tabs, Space, Tooltip, Modal } from "antd";
import { useSearchParams } from "react-router-dom";
import { PlusOutlined, SearchOutlined, ReloadOutlined, ClearOutlined, HistoryOutlined, EyeOutlined, CopyOutlined, EditOutlined, ImportOutlined, PrinterOutlined } from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { loadStandardCategories } from "../lib/standardQueryCache";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/authStore";
import { StandardFilterInput } from "../components/standard/StandardFilterInput";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { standardStatusColor as statusColor, getStandardPublicationNotice, STANDARD_CATEGORY_NOTES } from "../lib/standardFormat";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { StandardDetailDrawer } from "../components/standard/StandardDetailDrawer";
import { StandardHistoryDrawer } from "../components/standard/StandardHistoryDrawer";
import { StandardImportModal } from "../components/standard/StandardImportModal";
import { StandardFormModal } from "../components/standard/StandardFormModal";
import { StandardRowSelectionProvider, StandardSelectableRow } from "../components/standard/StandardSelectableRow";
import { CustomerName } from "../components/standard/CustomerName";
import type {
  StandardPageResponse,
  StandardCategory,
  StandardDetail,
  StandardListItem,
  StandardStatus,
  StandardType,
} from "../types/standard";
import {
  STANDARD_STATUS_LABELS,
  STANDARD_TYPE_LABELS,
  STANDARD_TYPE_COLORS,
} from "../types/standard";
import styles from "./ProductStandardPage.module.css";

const { Title, Text } = Typography;

const FIELD_COLUMN_WIDTHS: Record<string, number> = {
  torque_standard: 104, test_standard: 108,
  lock_direction: 84, torque_direction: 84, rib_return: 100,
  spring: 110, clip: 100, seat: 100, axis_core: 100, pull_cord: 110,
  gear_spec: 220, marking: 160, remark: 180, import_note: 160,
};

const STATUS_OPTIONS: { value: StandardStatus | "all"; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待审核" },
  { value: "published", label: "已发布" },
  { value: "obsolete", label: "已停用" },
];

const TYPE_OPTIONS: { value: StandardType | "all"; label: string }[] = [
  { value: "all", label: "全部性质" },
  { value: "formal", label: "正式标准" },
  { value: "temporary", label: "临时标准" },
  { value: "new_pending", label: "新增待定" },
];

const tableComponents = { body: { row: StandardSelectableRow } };
const StandardPrintModal = lazy(() => import("../components/standard/StandardPrintModal").then(module => ({ default: module.StandardPrintModal })));

function ProductStandardPageContent() {
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id;
  const authScope = `${user?.id ?? ""}:${user?.role ?? ""}:${user?.permissions?.join(",") ?? ""}`;
  const [access, setAccess] = useState<{ scope: string; canEdit: boolean; canReview: boolean; canImport: boolean } | null>(null);
  const canEdit = access?.scope === authScope ? access.canEdit : user?.role === "admin" || Boolean(user?.permissions?.includes("engineering_submit"));
  const canReview = access?.scope === authScope ? access.canReview : user?.role === "admin" || Boolean(user?.permissions?.includes("engineering_review"));

  const canInitialize = access?.scope === authScope ? access.canImport : user?.role === "admin";

  const [categories, setCategories] = useState<StandardCategory[]>([]);
  const [standardsScope, setStandardsScope] = useState("");
  const [total, setTotal] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [standards, setStandards] = useState<StandardListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState("");

  const [activeCategory, setActiveCategory] = useState<string>("gear_damper");
  const [activeStatus, setActiveStatus] = useState<StandardStatus | "all">("all");
  const [activeType, setActiveType] = useState<StandardType | "all">("all");
  const [filters, setFilters] = useState({ search: "", customer: "", model: "", customerPartNo: "", vehicleModel: "" });
  const [resetVersion, setResetVersion] = useState(0);
  const applyFilters = useMemo(() => {
    const apply = (key: keyof typeof filters) => (value: string) => {
      setFilters((current) => current[key] === value ? current : { ...current, [key]: value });
    };
    return { search: apply("search"), customer: apply("customer"), model: apply("model"),
      customerPartNo: apply("customerPartNo"), vehicleModel: apply("vehicleModel") };
  }, []);
  // 普通输入及防抖提交不会改变下拉渲染函数，避免 rc-table 重挂载输入框。
  const filterDropdowns = useMemo(() => {
    const dropdown = (key: keyof typeof applyFilters, placeholder: string) =>
      ({ selectedKeys }: FilterDropdownProps) => (
        <div className={styles.filterDropdown}>
          <StandardFilterInput size="small" allowClear autoFocus placeholder={placeholder}
            initialValue={String(selectedKeys[0] ?? "")} resetVersion={resetVersion} onApply={applyFilters[key]} />
        </div>
      );
    return { customer: dropdown("customer", "筛选客户名"), model: dropdown("model", "筛选型号"),
      customerPartNo: dropdown("customerPartNo", "筛选客户料号"), vehicleModel: dropdown("vehicleModel", "筛选项目代号") };
  }, [applyFilters, resetVersion]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<StandardDetail | null>(null);
  const [copySource, setCopySource] = useState<StandardDetail | null>(null);
  const [searchParams] = useSearchParams();

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams({ category: activeCategory, all: "true", includeObsolete: "true" });
    if (activeStatus !== "all") params.set("status", activeStatus); else params.set("excludeObsolete", "true");
    if (activeType !== "all") params.set("standardType", activeType);
    for (const [key, value] of Object.entries(filters)) {
      if (activeCategory === "sanitary_damper" && (key === "vehicleModel" || key === "customerPartNo")) continue;
      if (value.trim()) params.set(key, value.trim());
    }
    return params.toString();
  }, [activeCategory, activeStatus, activeType, filters]);

  const fetchVersion = useRef(0);
  const invalidateFetch = useCallback(() => { ++fetchVersion.current; }, []);
  const requestController = useRef<AbortController | null>(null);
  const checkController = useRef<AbortController | null>(null);
  const successfulAt = useRef(0);
  const collectionVersion = useRef("");
  const fetchData = useCallback(async (force = true) => {
    const version = ++fetchVersion.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    try {
      const [categoryData, response] = await Promise.all([
        loadStandardCategories(force),
        api.get<StandardPageResponse>(`/api/standards?${requestQuery}`, { signal: controller.signal }),
      ]);
      if (version !== fetchVersion.current || controller.signal.aborted) return;
      setCategories(categoryData);
      setStandards(response.data);
      setStandardsScope(authScope);
      if (typeof response.canEdit === "boolean" && typeof response.canReview === "boolean") {
        setAccess({ scope: authScope, canEdit: response.canEdit, canReview: response.canReview, canImport: response.canImport === true });
      }
      setTotal(response.total ?? response.data.length);
      setLastUpdatedAt(response.updatedAt ?? response.data.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, ""));
      collectionVersion.current = response.version ?? "";
      successfulAt.current = Date.now();
      setRefreshedAt(new Date().toISOString());
    } catch (err) {
      if (version === fetchVersion.current && !controller.signal.aborted) message.error((err as Error).message || "获取产品标准失败");
    } finally {
      if (version === fetchVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, [requestQuery, authScope]);

  useEffect(() => {
    const initialTimer = setTimeout(() => { void fetchData(false); }, 0);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - successfulAt.current < 30_000) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        if (document.visibilityState !== "visible") return;
        const version = fetchVersion.current;
        checkController.current?.abort();
        const controller = new AbortController();
        checkController.current = controller;
        try {
          const response = await api.get<{ version: string }>("/api/standards/version", { signal: controller.signal });
          if (controller.signal.aborted || version !== fetchVersion.current) return;
          if (response.version !== collectionVersion.current) await fetchData(false);
          else { successfulAt.current = Date.now(); setRefreshedAt(new Date().toISOString()); }
        } catch { if (!controller.signal.aborted && version === fetchVersion.current) void fetchData(false); }
      }, 50);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      invalidateFetch();
      requestController.current?.abort(); checkController.current?.abort();
      clearTimeout(initialTimer); clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [fetchData, invalidateFetch]);

  // 从 URL 参数初始化状态筛选（消息提醒「去审核」跳转）
  const urlStatus = searchParams.get("status");
  useEffect(() => {
    if (urlStatus !== "draft" && urlStatus !== "pending_review" && urlStatus !== "published" && urlStatus !== "obsolete") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) { setActiveStatus((current) => current === urlStatus ? current : urlStatus); }
    });
    return () => { cancelled = true; };
  }, [urlStatus]);

  // 从 URL 参数初始化分类（通知「去处理」跳转到对应分类）
  const urlCategory = searchParams.get("category");
  const appliedCategoryParam = useRef<string | null>(null);
  useEffect(() => {
    if (!urlCategory) { appliedCategoryParam.current = null; return; }
    if (appliedCategoryParam.current === urlCategory || !categories.some((category) => category.key === urlCategory)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) { appliedCategoryParam.current = urlCategory; setActiveCategory((current) => current === urlCategory ? current : urlCategory); }
    });
    return () => { cancelled = true; };
  }, [urlCategory, categories]);

  // 超过 1 小时无操作提示刷新，避免使用旧数据（仅本页面生效）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const showStaleWarning = () => {
      Modal.confirm({
        title: "页面已超过 1 小时未操作",
        content: "数据可能已过期，建议刷新页面获取最新数据。",
        okText: "立即刷新",
        cancelText: "暂不刷新",
        onOk: () => window.location.reload(),
      });
    };
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(showStaleWarning, 60 * 60 * 1000);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, []);

  const activeCategoryObj = useMemo(
    () => categories.find((c) => c.key === activeCategory),
    [categories, activeCategory]
  );

  const filtered = useMemo(() => {
    if (standardsScope !== authScope) return [];
    const rank = (record: StandardListItem) => record.fields.part_type === "盖" ? 0 : record.fields.part_type === "座" ? 1 : 2;
    return [...standards].sort((a, b) => {
      const reviewOrder = Number(b.status === "pending_review") - Number(a.status === "pending_review");
      if (reviewOrder || activeCategory !== "sanitary_damper") return reviewOrder;
      return rank(a) - rank(b) || a.serialNo.localeCompare(b.serialNo, "zh-CN", { numeric: true }) || a.id.localeCompare(b.id);
    });
  }, [standardsScope, authScope, standards, activeCategory]);
  const visibleTotal = standardsScope === authScope ? total : 0;

  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const openHistory = useCallback((id: string) => {
    setHistoryId(id);
    setHistoryOpen(true);
  }, []);

  const openCreate = () => {
    setFormInitial(null);
    setCopySource(null);
    setFormOpen(true);
  };

  const openEdit = (detail: StandardDetail) => {
    setDetailOpen(false);
    setFormInitial(detail);
    setCopySource(null);
    setFormOpen(true);
  };

  const copyStandard = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ ok: boolean; data: StandardDetail }>(`/api/standards/${id}?summary=true`);
      setDetailOpen(false);
      setFormInitial(null);
      setCopySource(res.data);
      setFormOpen(true);
    } catch (err) {
      message.error((err as Error).message || "加载失败");
    }
  }, []);

  const editStandard = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ ok: boolean; data: StandardDetail }>(`/api/standards/${id}?summary=true`);
      setDetailOpen(false);
      setFormInitial(res.data);
      setCopySource(null);
      setFormOpen(true);
    } catch (err) {
      message.error((err as Error).message || "加载失败");
    }
  }, []);

  const columns = useMemo<TableColumnsType<StandardListItem>>(() => {
    const isMyReview = (record: StandardListItem) => record.status === "pending_review" && Boolean(currentUserId && record.submittedById && record.submittedById !== currentUserId)
      && (record.assignedReviewerId ? record.assignedReviewerId === currentUserId : canReview);
    const fields = activeStandardFields(activeCategoryObj).filter(field => field.key !== "winter_test_standard");
    const toFieldColumn = (field: (typeof fields)[number]) => ({
      title: field.key === "test_standard" ? "测试标准" : field.label,
      key: field.key,
      width: FIELD_COLUMN_WIDTHS[field.key] ?? (field.key.endsWith("_torque") ? 108 : 136),
      render: (_: unknown, record: StandardListItem) => field.key === "test_standard"
        ? <SeasonalTestStandard summer={record.fields.test_standard} winter={record.fields.winter_test_standard} />
        : field.key === "gear_spec"
        ? <GearSpecification value={record.fields[field.key] || ""} />
        : <span className={styles.parameterValue}>{record.fields[field.key] || (field.key === "part_type" && (record.fields.lid_standard || record.fields.seat_standard) ? "旧版盖＋座" : "—")}</span>,
    });
    const fieldColumns: TableColumnsType<StandardListItem> = groupStandardFields(fields).flatMap<TableColumnsType<StandardListItem>[number]>(group => group.name
      ? [{ title: group.name, key: group.name, children: group.fields.map(toFieldColumn) }]
      : group.fields.map(toFieldColumn));

    const result: TableColumnsType<StandardListItem> = [
      {
        title: "序号",
        dataIndex: "serialNo",
        width: 110,
        fixed: "left",
        render: (value: string, record: StandardListItem) => (
          <a className={styles.serialValue} title={value} onClick={() => openDetail(record.id)}>{value}</a>
        ),
      },
      {
        title: "客户名",
        dataIndex: "customer",
        width: 160,
        filterDropdown: filterDropdowns.customer,
        filterIcon: (filtered: boolean) => (
          <SearchOutlined className={filtered ? styles.filterIconActive : styles.filterIcon} />
        ),
        filteredValue: filters.customer ? [filters.customer] : null,
        render: (_: unknown, record: StandardListItem) => {
          const notice = getStandardPublicationNotice(record);
          return <div className={styles.customerCell}>
            <CustomerName value={record.customer} />
            {notice && <Tag color={notice === "new" ? "green" : "gold"}>{notice === "new" ? "新标准" : "有变更"}</Tag>}
          </div>;
        },
      },
      {
        title: "项目代号",
        dataIndex: "vehicleModel",
        width: 100,
        filterDropdown: filterDropdowns.vehicleModel,
        filterIcon: (filtered: boolean) => (
          <SearchOutlined className={filtered ? styles.filterIconActive : styles.filterIcon} />
        ),
        filteredValue: filters.vehicleModel ? [filters.vehicleModel] : null,
        render: (value: string) => value || "-",
      },
      {
        title: "产品型号",
        dataIndex: "model",
        width: 120,
        render: (value: string) => <span className={value ? styles.modelValue : styles.parameterValue}>{value || "—"}</span>,
        filterDropdown: filterDropdowns.model,
        filterIcon: (filtered: boolean) => (
          <SearchOutlined className={filtered ? styles.filterIconActive : styles.filterIcon} />
        ),
        filteredValue: filters.model ? [filters.model] : null,
      },
      {
        title: "客户料号",
        dataIndex: "customerPartNo",
        width: 130,
        filterDropdown: filterDropdowns.customerPartNo,
        filterIcon: (filtered: boolean) => (
          <SearchOutlined className={filtered ? styles.filterIconActive : styles.filterIcon} />
        ),
        filteredValue: filters.customerPartNo ? [filters.customerPartNo] : null,
      },
      ...fieldColumns,
      {
        title: "性质/状态",
        key: "typeStatus",
        width: 150,
        render: (_: unknown, record: StandardListItem) => (
          <Space size={4} wrap>
            <Tag color={STANDARD_TYPE_COLORS[record.standardType]}>
              {STANDARD_TYPE_LABELS[record.standardType]}
            </Tag>
            <Tag color={statusColor(record.status)}>{STANDARD_STATUS_LABELS[record.status]}</Tag>
            {record.hasPending && <Tag color="orange">有草稿</Tag>}
          </Space>
        ),
      },
      {
        title: "更新时间",
        dataIndex: "updatedAt",
        width: 150,
        render: (value: string) =>
          value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-",
      },
      {
        title: "操作",
        key: `action-${canEdit}-${canReview}-${currentUserId}`,
        width: 146,
        fixed: "right",
        render: (_: unknown, record: StandardListItem) => (
          <div className={styles.rowActions}>
            <div className={styles.actionIcons} aria-label="常规操作">
              <Tooltip title="查看详情">
                <Button type="text" size="small" aria-label={`查看标准 ${record.serialNo}`} icon={<EyeOutlined />} onClick={() => openDetail(record.id)} />
              </Tooltip>
              {canEdit && (record.status !== "pending_review" || canInitialize) && record.status !== "obsolete" && (
                <Tooltip title="编辑">
                  <Button type="text" size="small" aria-label={`编辑标准 ${record.serialNo}`} icon={<EditOutlined />} onClick={() => editStandard(record.id)} />
                </Tooltip>
              )}
              {canEdit && (
              <Tooltip title="复制新增">
                <Button type="text" size="small" aria-label={`复制标准 ${record.serialNo}`} icon={<CopyOutlined />} onClick={() => copyStandard(record.id)} />
              </Tooltip>
              )}
              <Tooltip title="查看历史">
                <Button type="text" size="small" aria-label={`标准历史 ${record.serialNo}`} icon={<HistoryOutlined />} onClick={() => openHistory(record.id)} />
              </Tooltip>
            </div>
            {(isMyReview(record) || (record.status === "pending_review" && (canInitialize || Boolean(currentUserId && record.submittedById === currentUserId)))) && <div className={styles.reviewActions} aria-label="待审操作">
              {isMyReview(record) && <Button type="primary" size="small" aria-label={`审核标准 ${record.serialNo}`} onClick={() => openDetail(record.id)}>审核</Button>}
              {record.status === "pending_review" && (canInitialize || Boolean(currentUserId && record.submittedById === currentUserId)) && <StandardRemindButton key={`${record.versionNo}:${record.updatedAt}`} standardId={record.id} versionNo={record.versionNo} serialNo={record.serialNo} />}
            </div>}
          </div>
        ),
      },
    ];
    return result.filter(column => activeCategoryObj?.key !== "sanitary_damper" || !("dataIndex" in column && (column.dataIndex === "vehicleModel" || column.dataIndex === "customerPartNo")))
      .map((column) => ({ ...column, shouldCellUpdate: (record, previous) => record !== previous }));
  }, [activeCategoryObj, filterDropdowns, filters.customer, filters.vehicleModel, filters.model,
    filters.customerPartNo, canEdit, canReview, canInitialize, currentUserId, openDetail, openHistory, copyStandard, editStandard]);

  const handleSaved = (detail: StandardDetail) => {
    setFormOpen(false);
    void fetchData();
    if (detail) {
      setDetailId(detail.id);
      setDetailOpen(true);
    }
  };

  const handleChanged = () => {
    void fetchData();
  };

  const resetFilters = () => {
    setActiveStatus("all");
    setActiveType("all");
    setFilters({ search: "", customer: "", model: "", customerPartNo: "", vehicleModel: "" });
    setResetVersion((version) => version + 1);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={4} className={styles.title}>产品标准</Title>
        <StandardUsageGuide />
        <div className={styles.notes}>
          <span>管理员保存即生效；其他人员审核后发布</span>
          <span>文件编码：TA-WI-ZP-10</span>
          <span className={styles.timeBadge}>数据更新时间：<strong>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</strong></span>
          <span className={styles.timeBadge}>上次刷新：<strong>{refreshedAt ? new Date(refreshedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "—"}</strong></span>
          {STANDARD_CATEGORY_NOTES[activeCategory] && <span>{STANDARD_CATEGORY_NOTES[activeCategory]}</span>}
        </div>
        {canInitialize && <Button className={styles.importButton} size="small" icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>初始化导入</Button>}
      </div>

      <Tabs
        className={styles.tabs}
        size="small"
        activeKey={activeCategory}
        onChange={(value) => { setActiveCategory(value); }}
        items={categories.map((c) => ({ key: c.key, label: c.name }))}
      />

      <div className={styles.toolbar}>
        <div className={styles.headerActions}>
          {canEdit && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增标准</Button>}
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => fetchData()}>刷新</Button>
          <Button size="small" icon={<PrinterOutlined />} disabled={loading || !categories.length} onClick={() => setPrintOpen(true)}>导出 / 打印</Button>
        </div>
        <Select
          size="small"
          className={styles.filterSelect}
          value={activeStatus}
          onChange={(value) => { setActiveStatus(value); }}
          options={STATUS_OPTIONS}
        />
        <Select
          size="small"
          className={styles.filterSelect}
          value={activeType}
          onChange={(value) => { setActiveType(value); }}
          options={TYPE_OPTIONS}
        />
        <StandardFilterInput
          size="small"
          className={styles.searchInput}
          placeholder={activeCategory === "sanitary_damper" ? "搜索序号、客户、产品型号、客户型号" : "搜索序号、客户、型号、客户料号"}
          prefix={<SearchOutlined />}
          allowClear
          initialValue={filters.search}
          resetVersion={resetVersion}
          onApply={applyFilters.search}
        />
        <Button size="small" onClick={resetFilters} icon={<ClearOutlined />}>
          重置筛选
        </Button>
        <Text type="secondary">共 {visibleTotal} 条</Text>
      </div>

      <div className={styles.tableWrap}>
        <StandardRowSelectionProvider>
        <ResponsiveTable
          columns={columns}
          loading={loading}
          fitViewport
          bottomScrollbar={false}
          components={tableComponents}
          locale={{ emptyText: <Empty description="没有匹配的标准" /> }}
          dataSource={filtered}
          rowKey="id"
          size="small"
          minWidth={1100}
          pagination={false}
        />
        </StandardRowSelectionProvider>
      </div>

      {canInitialize && (
        <StandardImportModal categories={categories} open={importOpen} onClose={() => setImportOpen(false)} onImported={() => { void fetchData(); }} />
      )}
      {printOpen && <Suspense fallback={null}><StandardPrintModal key={authScope} categories={categories} currentCategory={activeCategory} currentRows={filtered} onClose={() => setPrintOpen(false)} /></Suspense>}

      <StandardDetailDrawer key={`detail:${authScope}:${canEdit}:${canReview}`}
        open={detailOpen}
        standardId={detailId}
        categories={categories}
        canEdit={canEdit}
        allowDirectEdit={canInitialize}
        canReview={canReview}
        onClose={() => setDetailOpen(false)}
        onChanged={handleChanged}
        onEdit={openEdit}
      />
      <StandardHistoryDrawer key={`history:${authScope}:${canEdit}:${canReview}`}
        open={historyOpen}
        standardId={historyId}
        onClose={() => setHistoryOpen(false)}
      />
      {canEdit && <StandardFormModal
        directPublish={canInitialize}
        open={formOpen}
        categories={categories}
        initial={formInitial}
        copySource={copySource}
        defaultCategoryKey={activeCategory}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />}
    </div>
  );
}

export const ProductStandardPage = memo(ProductStandardPageContent);
