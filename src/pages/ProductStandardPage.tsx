import {useTabPageSession,useTabState,useTabPageAdapter,useTabBusy,useTabInitialEffect} from "../lib/tabPageContext";
import {openStandardPageSession,initialStandardPageView,standardPageRequestQuery} from '../lib/standardPageSession';
import {useStandardPageMemory} from '../lib/useStandardPageMemory';
import {StandardDrawingBadge} from "../components/standard/StandardDrawingBadge";
import {useStandardDrawingStatus} from '../lib/useStandardDrawingStatus';
import { groupStandardFields, activeStandardFields } from "../lib/standardFieldGroups";
import { SeasonalTestStandard } from "../components/standard/SeasonalTestStandard";
import { GearSpecification } from "../components/standard/GearSpecification";
import { StandardUsageGuide } from "../components/standard/StandardUsageGuide";
import { StandardDraftActionButton } from "../components/standard/StandardDraftActionButton";
import { getStandardDraftAction } from "../lib/standardDraftActions";
import { StandardRemindButton } from "../components/standard/StandardRemindButton";
import { createRef, lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Button, Select, Tag, Typography, Empty, message, Space, Tooltip, Modal } from "antd";
import type { InputRef } from "antd";
import { StandardCategoryTabs } from "../components/standard/StandardCategoryTabs";
import { StandardPendingOverview } from "../components/standard/StandardPendingOverview";
import { StandardPendingReviewDrawer } from "../components/standard/StandardPendingReviewDrawer";
import { usePendingReviewOverview } from "../lib/standardPendingReviews";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PlusOutlined, SearchOutlined, ReloadOutlined, ClearOutlined, HistoryOutlined, EyeOutlined, CopyOutlined, EditOutlined, PrinterOutlined, StopOutlined } from "@ant-design/icons";
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
import { StandardPendingActionModal } from "../components/standard/StandardPendingActionModal";
import { StandardRetireModal } from "../components/standard/StandardRetireModal";
import { StandardFormModal } from "../components/standard/StandardFormModal";
import { StandardRowSelectionProvider, StandardSelectableRow,StandardVirtualRow } from "../components/standard/StandardSelectableRow";
import { CustomerName } from "../components/standard/CustomerName";
import type {
  StandardPendingActionTarget,
  StandardPendingReviewItem,
  StandardRetireTarget,
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

const { Title } = Typography;

function createColumnFilterControl() {
  const inputRef = createRef<InputRef>();
  let frame: number | undefined;
  const cancelFocus = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  return { inputRef, cancelFocus, dropdownProps: { onOpenChange: (open: boolean) => {
    cancelFocus();
    if (open) frame = requestAnimationFrame(() => {
      frame = undefined;
      inputRef.current?.focus({ preventScroll: true, cursor: "end" });
    });
  } } };
}

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
  { value: "formal", label: "常规" },
  { value: "temporary", label: "临时" },
  { value: "new_pending", label: "新增待定" },
];

const tableComponents = { body: { row: StandardSelectableRow } };
const virtualTableComponents = { body: { row: StandardVirtualRow } };
const StandardPrintModal = lazy(() => import("../components/standard/StandardPrintModal").then(module => ({ default: module.StandardPrintModal })));

function ProductStandardPageContent() {
  const tab=useTabPageSession();
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id;
  const authScope = `${user?.id ?? ""}:${user?.role ?? ""}:${user?.permissions?.join(",") ?? ""}`;
  const location=useLocation();
  const [searchParams]=useSearchParams();
  const [initial]=useTabState("standard:initial",()=>{
    const session=tab.managed?{scope:authScope,generation:0,snapshot:null}:openStandardPageSession(authScope);
    const view=initialStandardPageView(session.snapshot,searchParams,location.key);
    const cached=session.snapshot?.cache;
    const cache=cached?.query===standardPageRequestQuery(view,user?.role==='admin')?cached:null;
    return {session,view,cache,resume:view===session.snapshot?.view,entryKey:location.key};
  });
  const { data: pendingData, loading: pendingLoading, error: pendingError, refresh: refreshPending } = usePendingReviewOverview(authScope);
  const [pendingDrawer, setPendingDrawer] = useTabState<{ scope: string; category: string } | null>("standard:pendingDrawer",null);
  const [access, setAccess] = useTabState<{ scope: string; canEdit: boolean; canReview: boolean; canRetire?: boolean } | null>("standard:access",()=>initial.cache&&typeof initial.cache.response.canEdit==='boolean'&&typeof initial.cache.response.canReview==='boolean'?{scope:authScope,canEdit:initial.cache.response.canEdit,canReview:initial.cache.response.canReview,canRetire:initial.cache.response.canRetire}:null);
  const canEdit = access?.scope === authScope ? access.canEdit : user?.role === "admin" || Boolean(user?.permissions?.includes("engineering_submit"));
  const canReview = access?.scope === authScope ? access.canReview : user?.role === "admin" || Boolean(user?.permissions?.includes("engineering_review"));

  const canDirectPublish = user?.role === "admin";
  const canRetire = access?.scope === authScope && typeof access.canRetire === "boolean" ? access.canRetire : user?.role === "admin" || Boolean(user?.permissions?.includes("engineering_retire"));

  const [categories, setCategories] = useTabState<StandardCategory[]>("standard:categories",initial.session.snapshot?.cache?.categories||[]);
  const [standardsScope, setStandardsScope] = useTabState("standard:standardsScope",initial.cache?authScope:"");
  const [total, setTotal] = useTabState("standard:total",initial.cache?.response.total??initial.cache?.response.data.length??0);
  const [overallTotal, setOverallTotal] = useTabState<number | null>("standard:overallTotal",initial.cache?.response.overallTotal??null);
  const [lastUpdatedAt, setLastUpdatedAt] = useTabState("standard:lastUpdatedAt",initial.cache?.response.updatedAt||"");
  const [standards, setStandards] = useTabState<StandardListItem[]>("standard:standards",initial.cache?.response.data||[]);
  const [preparing,setPreparing]=useTabState("standard:preparing",false);
  const [loading, setLoading] = useTabState("standard:loading",false);
  const [refreshedAt, setRefreshedAt] = useTabState("standard:refreshedAt",initial.cache?.refreshedAt||"");
  useStandardDrawingStatus(standards.map(s=>({number:s.serialNo,standardId:s.id})),refreshedAt);

  const [activeCategory, setActiveCategory] = useTabState<string>("standard:activeCategory",initial.view.category);
  const [activeStatus, setActiveStatus] = useTabState<StandardStatus | "all">("standard:activeStatus",initial.view.status);
  const visibleStatus = activeStatus === "deleted" && !canDirectPublish ? "all" : activeStatus;
  const [activeType, setActiveType] = useTabState<StandardType | "all">("standard:activeType",initial.view.standardType);
  const [filters, setFilters] = useTabState("standard:filters",initial.view.filters);
  const [resetVersion, setResetVersion] = useTabState("standard:resetVersion",0);
  const filterControls = useMemo(() => ({ serialNo: createColumnFilterControl(), customer: createColumnFilterControl(), model: createColumnFilterControl(),
    customerPartNo: createColumnFilterControl(), vehicleModel: createColumnFilterControl() }), []);
  useEffect(() => () => Object.values(filterControls).forEach(control => control.cancelFocus()), [filterControls]);
  const applyFilters = useMemo(() => {
    const apply = (key: keyof typeof filters) => (value: string) => {
      setFilters((current) => current[key] === value ? current : { ...current, [key]: value });
    };
    return { search: apply("search"), serialNo: apply("serialNo"), customer: apply("customer"), model: apply("model"),
      customerPartNo: apply("customerPartNo"), vehicleModel: apply("vehicleModel") };
  }, [setFilters]);
  // 普通输入及防抖提交不会改变下拉渲染函数，避免 rc-table 重挂载输入框。
  const filterDropdowns = useMemo(() => {
    const dropdown = (key: keyof typeof filterControls, placeholder: string) =>
      ({ selectedKeys }: FilterDropdownProps) => (
        <div className={styles.filterDropdown}>
          <StandardFilterInput size="small" allowClear inputRef={filterControls[key].inputRef} placeholder={placeholder}
            initialValue={String(selectedKeys[0] ?? "")} resetVersion={resetVersion} onApply={applyFilters[key]} />
        </div>
      );
    return { serialNo: dropdown("serialNo", "筛选内部料号"), customer: dropdown("customer", "筛选客户名"), model: dropdown("model", "筛选型号"),
      customerPartNo: dropdown("customerPartNo", "筛选客户料号"), vehicleModel: dropdown("vehicleModel", "筛选项目代号") };
  }, [applyFilters, resetVersion, filterControls]);

  const [detailId, setDetailId] = useTabState<string | null>("standard:detailId",null);
  const [detailOpen, setDetailOpen] = useTabState("standard:detailOpen",false);
  const [historyId, setHistoryId] = useTabState<string | null>("standard:historyId",null);
  const [historyOpen, setHistoryOpen] = useTabState("standard:historyOpen",false);
  const [formOpen, setFormOpen] = useTabState("standard:formOpen",false);
  const [pendingAction, setPendingAction] = useTabState<StandardPendingActionTarget | null>("standard:pendingAction",null);
  const [retireTarget, setRetireTarget] = useTabState<StandardRetireTarget | null>("standard:retireTarget",null);
  const [printOpen, setPrintOpen] = useTabState("standard:printOpen",false);
  const [formInitial, setFormInitial] = useTabState<StandardDetail | null>("standard:formInitial",null);
  const [copySource, setCopySource] = useTabState<StandardDetail | null>("standard:copySource",null);

  const view=useMemo(()=>({category:activeCategory,status:activeStatus,standardType:activeType,filters}),[activeCategory,activeStatus,activeType,filters]);
  const requestQuery=useMemo(()=>standardPageRequestQuery(view,canDirectPublish),[view,canDirectPublish]);
  const completionQuery=JSON.stringify([requestQuery,authScope]);
  const [completedQuery,setCompletedQuery]=useTabState<string|null>("standard:completedQuery",null);
  const memory=useStandardPageMemory({scope:authScope,initial:initial.session,initialCache:initial.cache,view,
    entryKey:location.key,query:requestQuery,rows:standards,loading,resume:initial.resume});
  const {root:pageRoot,readCache,writeCache,rememberRow,queueRestore,capturePosition}=memory;
  useTabPageAdapter(true,{effectMode:'managed'});
  // Nested dialogs retain their mounted form and expansion state while open.
  useTabBusy(loading || preparing || printOpen);
  const restoringHistoryEntry=initial.resume&&initial.session.snapshot?.entryKey===initial.entryKey&&location.key===initial.entryKey;

  const fetchVersion = useRef(0);
  const invalidateFetch = useCallback(() => { ++fetchVersion.current; }, []);
  const requestController = useRef<AbortController | null>(null);
  const checkController = useRef<AbortController | null>(null);
  const successfulAt = useRef(initial.cache?.fetchedAt||0);
  const collectionVersion = useRef(initial.cache?.response.version||"");
  const fetchData = useCallback(async (force = true) => {
    const version = ++fetchVersion.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(force||readCache()?.query!==requestQuery);
    try {
      const [categoryData, response] = await Promise.all([
        loadStandardCategories(force),
        api.get<StandardPageResponse>(`/api/standards?${requestQuery}`, { signal: controller.signal }),
      ]);
      if (version !== fetchVersion.current || controller.signal.aborted) return;
      const position=readCache()?.query===requestQuery?capturePosition():null;
      if(position)queueRestore(position,requestQuery);
      writeCache({query:requestQuery,response,categories:categoryData,fetchedAt:Date.now(),refreshedAt:new Date().toISOString()});
      setCategories(categoryData);
      setStandards(response.data);
      setStandardsScope(authScope);
      setCompletedQuery(completionQuery);
      void refreshPending(response.version ?? "", force);
      if (typeof response.canEdit === "boolean" && typeof response.canReview === "boolean") {
        setAccess({ scope: authScope, canEdit: response.canEdit, canReview: response.canReview, canRetire: response.canRetire });
      }
      setTotal(response.total ?? response.data.length);
      setOverallTotal(response.overallTotal ?? null);
      setLastUpdatedAt(response.updatedAt ?? response.data.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, ""));
      collectionVersion.current = response.version ?? "";
      successfulAt.current = Date.now();
      setRefreshedAt(new Date().toISOString());
    } catch (err) {
      if (version === fetchVersion.current && !controller.signal.aborted) {
        message.error((err as Error).message || "获取产品标准失败");
        void refreshPending();
      }
    } finally {
      if (version === fetchVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, [requestQuery, authScope, refreshPending,capturePosition,queueRestore,readCache,writeCache,setAccess,setCategories,setLastUpdatedAt,setLoading,setOverallTotal,setRefreshedAt,setStandards,setStandardsScope,setTotal,completionQuery,setCompletedQuery]);

  useTabInitialEffect("standard:load", () => {
    setCompletedQuery(null);
    const initialTimer = setTimeout(() => {
      const cached=readCache();
      if(cached?.query===requestQuery){setCompletedQuery(completionQuery);if(tab.managed)return;void refreshPending(cached.response.version||'',false);refreshWhenVisible();}
      else void fetchData(false);
    }, 0);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshWhenVisible = () => {
      if (tab.managed || document.visibilityState !== "visible" || Date.now() - successfulAt.current < 30_000) return;
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
          else { successfulAt.current = Date.now(); const now=new Date().toISOString();setRefreshedAt(now);
            const cached=readCache();if(cached?.query===requestQuery)writeCache({...cached,fetchedAt:successfulAt.current,refreshedAt:now}); }
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
  }, [requestQuery,authScope], completedQuery===completionQuery);

  useEffect(()=>{
    if(location.key===initial.entryKey||!['category','status','standardId'].some(key=>searchParams.has(key)))return;
    let cancelled=false;
    queueMicrotask(()=>{if(!cancelled){setFilters({search:'',serialNo:'',customer:'',model:'',customerPartNo:'',vehicleModel:''});setActiveStatus('all');setActiveType('all');setResetVersion(value=>value+1);}});
    return ()=>{cancelled=true;};
  },[location.key,initial.entryKey,searchParams,setActiveStatus,setActiveType,setFilters,setResetVersion]);

  const urlStandardId = searchParams.get("standardId");
  useEffect(() => {
    if (!urlStandardId||restoringHistoryEntry) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setDetailId(urlStandardId); setDetailOpen(true); } });
    return () => { cancelled = true; };
  }, [urlStandardId,restoringHistoryEntry,location.key,setDetailId,setDetailOpen]);

  // 从 URL 参数初始化状态筛选（消息提醒「去审核」跳转）
  const urlStatus = searchParams.get("status");
  useEffect(() => {
    if(restoringHistoryEntry)return;
    if (urlStatus !== "draft" && urlStatus !== "pending_review" && urlStatus !== "published" && urlStatus !== "obsolete" && !(urlStatus === "deleted" && canDirectPublish)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) { setActiveStatus((current) => current === urlStatus ? current : urlStatus); }
    });
    return () => { cancelled = true; };
  }, [urlStatus, canDirectPublish,restoringHistoryEntry,location.key,setActiveStatus]);

  // 从 URL 参数初始化分类（通知「去处理」跳转到对应分类）
  const urlCategory = searchParams.get("category");
  const appliedCategoryParam = useRef<string | null>(null);
  useEffect(() => {
    if(restoringHistoryEntry)return;
    if (!urlCategory) { appliedCategoryParam.current = null; return; }
    if (appliedCategoryParam.current === `${location.key}:${urlCategory}` || !categories.some((category) => category.key === urlCategory)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) { appliedCategoryParam.current = `${location.key}:${urlCategory}`; setActiveCategory((current) => current === urlCategory ? current : urlCategory); }
    });
    return () => { cancelled = true; };
  }, [urlCategory, categories,restoringHistoryEntry,location.key,setActiveCategory]);

  // 超过 1 小时无操作提示刷新，避免使用旧数据（仅本页面生效）
  useEffect(() => {
    if(tab.managed)return;
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
  }, [tab.managed]);

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
  const [virtualized,setVirtualized]=useTabState('standard:virtualized',false);
  const virtualTable=virtualized||filtered.length>=100||(overallTotal??0)>=100;
  useEffect(()=>{if(virtualTable&&!virtualized)setVirtualized(true)},[virtualTable,virtualized,setVirtualized]);
  const visibleTotal = standardsScope === authScope ? total : 0;

  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, [setDetailId,setDetailOpen]);

  const openHistory = useCallback((id: string) => {
    setHistoryId(id);
    setHistoryOpen(true);
  }, [setHistoryId,setHistoryOpen]);

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
    setPreparing(true);
    try {
      const res = await api.get<{ ok: boolean; data: StandardDetail }>(`/api/standards/${id}?summary=true`);
      setDetailOpen(false);
      setFormInitial(null);
      setCopySource(res.data);
      setFormOpen(true);
    } catch (err) {
      message.error((err as Error).message || "加载失败");
    } finally {setPreparing(false);}
  }, [setCopySource,setDetailOpen,setFormInitial,setFormOpen,setPreparing]);

  const editStandard = useCallback(async (id: string) => {
    setPreparing(true);
    try {
      const res = await api.get<{ ok: boolean; data: StandardDetail }>(`/api/standards/${id}?summary=true`);
      setDetailOpen(false);
      setFormInitial(res.data);
      setCopySource(null);
      setFormOpen(true);
    } catch (err) {
      message.error((err as Error).message || "加载失败");
    } finally {setPreparing(false);}
  }, [setCopySource,setDetailOpen,setFormInitial,setFormOpen,setPreparing]);

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
        title: "内部料号",
        dataIndex: "serialNo",
        filterDropdown: filterDropdowns.serialNo,
        filterDropdownProps: filterControls.serialNo.dropdownProps,
        filterIcon: (filtered: boolean) => <SearchOutlined className={filtered ? styles.filterIconActive : styles.filterIcon} />,
        filteredValue: filters.serialNo ? [filters.serialNo] : null,
        width: 110,
        fixed: "left",
        render: (value: string, record: StandardListItem) => (
          <div className={styles.productDrawingLink}><Link className={styles.serialValue} title={`查看商品 ${value}`} onClick={()=>rememberRow(record.id)} to={`/materials/number?${new URLSearchParams({number:value,standardId:record.id,returnTo:'/product-standards'})}`}>{value}</Link><StandardDrawingBadge id={`${record.id}:${value}`} /></div>
        ),
      },
      {
        title: "客户名",
        dataIndex: "customer",
        width: 160,
        filterDropdown: filterDropdowns.customer,
        filterDropdownProps: filterControls.customer.dropdownProps,
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
        filterDropdownProps: filterControls.vehicleModel.dropdownProps,
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
        filterDropdownProps: filterControls.model.dropdownProps,
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
        filterDropdownProps: filterControls.customerPartNo.dropdownProps,
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
            {!(record.standardType === "formal" && record.status !== "published") && <Tag color={STANDARD_TYPE_COLORS[record.standardType]}>
              {STANDARD_TYPE_LABELS[record.standardType]}
            </Tag>}
            <Tag color={statusColor(record.status)}>{STANDARD_STATUS_LABELS[record.status]}</Tag>
            {record.hasPending && <Tag color="orange">有草稿</Tag>}
            {record.retirementRequest && <Tag color="orange">停用待审</Tag>}
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
        key: `action-${canEdit}-${canReview}-${canRetire}-${canDirectPublish}-${currentUserId}`,
        width: 180,
        fixed: "right",
        render: (_: unknown, record: StandardListItem) => (
          <div className={styles.rowActions}>
            <div className={styles.actionIcons} aria-label="常规操作">
              <Tooltip title={record.status === "deleted" ? "查看删除归档" : "查看详情"}>
                <Button type="text" size="small" aria-label={`查看标准 ${record.serialNo}`} icon={<EyeOutlined />} onClick={() => record.status === "deleted" ? openHistory(record.id) : openDetail(record.id)} />
              </Tooltip>
              {canEdit && (record.status !== "pending_review" || canDirectPublish) && record.status !== "obsolete" && record.status !== "deleted" && (
                <Tooltip title="编辑">
                  <Button type="text" size="small" aria-label={`编辑标准 ${record.serialNo}`} icon={<EditOutlined />} onClick={() => editStandard(record.id)} />
                </Tooltip>
              )}
              {canEdit && record.status !== "deleted" && (
              <Tooltip title="复制新增">
                <Button type="text" size="small" aria-label={`复制标准 ${record.serialNo}`} icon={<CopyOutlined />} onClick={() => copyStandard(record.id)} />
              </Tooltip>
              )}
              <Tooltip title="变更历史">
                <Button type="text" size="small" aria-label={`变更历史 ${record.serialNo}`} icon={<HistoryOutlined />} onClick={() => openHistory(record.id)} />
              </Tooltip>
              {(canRetire || canEdit) && (record.status === "published" || record.hasPending) && <Tooltip title={record.status !== "published" || record.hasPending ? "请先处理修订稿" : !canRetire && record.retirementRequest ? "已有停用申请待审核" : canRetire ? "直接停用" : "申请停用"}>
                <span><Button type="text" danger size="small" icon={<StopOutlined />} aria-label={`${canRetire ? "停用标准" : "申请停用"} ${record.serialNo}`}
                  disabled={record.status !== "published" || record.hasPending || (!canRetire && Boolean(record.retirementRequest))} onClick={() => setRetireTarget(record)} /></span>
              </Tooltip>}
            </div>
            {record.retirementRequest && (user?.role === "admin" || (canRetire && record.retirementRequest.reviewerId === currentUserId)) && <div className={styles.reviewActions}>
              <Button type="primary" size="small" onClick={() => openDetail(record.id)}>停用审核</Button>
            </div>}
            {record.status === "draft" && getStandardDraftAction(record, user) && <div className={styles.reviewActions} aria-label="草稿操作">
              <StandardDraftActionButton target={record} action="discard-draft" hasPublished={record.hasPending} onCompleted={() => void fetchData()} />
            </div>}
            {(isMyReview(record) || (record.status === "pending_review" && (canDirectPublish || Boolean(currentUserId && record.submittedById === currentUserId)))) && <div className={styles.reviewActions} aria-label="待审操作">
              {getStandardDraftAction(record, user) === "withdraw" && <StandardDraftActionButton
                target={record} action="withdraw" hasPublished={record.hasPending} onCompleted={() => void fetchData()} />}
              {isMyReview(record) && <Button type="primary" size="small" aria-label={`审核标准 ${record.serialNo}`} onClick={() => openDetail(record.id)}>审核</Button>}
              {canDirectPublish && record.status === "pending_review" && <>
                <Button size="small" danger aria-label={`管理员驳回 ${record.serialNo}`} onClick={() => setPendingAction({ ...record, action: "reject" })}>驳回</Button>
                <Button size="small" danger aria-label={`管理员删除待审 ${record.serialNo}`} onClick={() => setPendingAction({ ...record, action: "delete" })}>删除</Button>
              </>}
              {record.status === "pending_review" && (canDirectPublish || Boolean(currentUserId && record.submittedById === currentUserId)) && <StandardRemindButton key={`${record.versionNo}:${record.updatedAt}`} standardId={record.id} versionNo={record.versionNo} serialNo={record.serialNo} />}
            </div>}
          </div>
        ),
      },
    ];
    return result.filter(column => activeCategoryObj?.key !== "sanitary_damper" || !("dataIndex" in column && (column.dataIndex === "vehicleModel" || column.dataIndex === "customerPartNo")))
      .map((column) => ({ ...column, shouldCellUpdate: (record, previous) => record !== previous }));
  }, [rememberRow,filters.serialNo, activeCategoryObj, filterDropdowns, filterControls, filters.customer, filters.vehicleModel, filters.model,
    filters.customerPartNo, canEdit, canReview, canRetire, canDirectPublish, currentUserId, user, fetchData, openDetail, openHistory, copyStandard, editStandard,setPendingAction,setRetireTarget]);

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
    setFilters({ search: "", serialNo: "", customer: "", model: "", customerPartNo: "", vehicleModel: "" });
    setResetVersion((version) => version + 1);
  };

  const openPendingProduct = (item: StandardPendingReviewItem) => {
    resetFilters();
    setActiveCategory(item.categoryKey);
    setPendingDrawer(null);
    openDetail(item.id);
  };

  return (
    <div ref={pageRoot} className={styles.container}>
      <div className={styles.header}>
        <Title level={4} className={styles.title}>产品标准</Title>
        <StandardUsageGuide />
        <div className={styles.notes}>
          <span>审核后发布</span>
          <span>文件编码：TA-WI-ZP-10</span>
          <span className={styles.timeBadge}>数据更新时间：<strong>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</strong></span>
          <span className={styles.timeBadge}>上次刷新：<strong>{refreshedAt ? new Date(refreshedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "—"}</strong></span>
          {STANDARD_CATEGORY_NOTES[activeCategory] && <span>{STANDARD_CATEGORY_NOTES[activeCategory]}</span>}
        </div>
      </div>


      {pendingDrawer?.scope === authScope && <StandardPendingReviewDrawer key={`${authScope}:${pendingDrawer.category}`}
        open category={pendingDrawer.category} scope={authScope} version={pendingData?.version ?? ""} admin={canDirectPublish}
        onClose={() => setPendingDrawer(null)} onOpen={openPendingProduct} />}

      <StandardCategoryTabs
        categories={categories}
        activeKey={activeCategory}
        onChange={setActiveCategory}
        pendingCounts={Object.fromEntries((pendingError ? [] : pendingData?.categories ?? []).map(category => [category.categoryKey, category.total]))}
        extra={pendingError || pendingData?.overallTotal ? <StandardPendingOverview data={pendingData} loading={pendingLoading} error={pendingError} admin={canDirectPublish}
          onRetry={() => void refreshPending("", true)} onOpen={openPendingProduct}
          onViewAll={(category = "") => setPendingDrawer({ scope: authScope, category })} /> : undefined}
      />

      <div className={styles.toolbar}>
        <div className={styles.headerActions}>
          {canEdit && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增标准</Button>}
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => fetchData()}>刷新</Button>
          <Tooltip title={visibleStatus === "deleted" ? "删除归档仅供追溯，请通过变更历史查看完整参数" : undefined}>
            <span><Button size="small" icon={<PrinterOutlined />} disabled={loading || !categories.length || visibleStatus === "deleted"} onClick={() => setPrintOpen(true)}>导出 / 打印</Button></span>
          </Tooltip>
        </div>
        <Select
          size="small"
          className={styles.filterSelect}
          value={visibleStatus}
          onChange={(value) => { setActiveStatus(value); }}
          options={canDirectPublish ? [...STATUS_OPTIONS, { value: "deleted", label: "已删除（归档）" }] : STATUS_OPTIONS}
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
          placeholder={activeCategory === "sanitary_damper" ? "搜索内部料号、客户、产品型号、客户型号" : "搜索内部料号、客户、型号、客户料号"}
          prefix={<SearchOutlined />}
          allowClear
          initialValue={filters.search}
          resetVersion={resetVersion}
          onApply={applyFilters.search}
        />
        <Button size="small" onClick={resetFilters} icon={<ClearOutlined />}>
          重置筛选
        </Button>
        <div className={styles.standardCount}>标准总数：{standardsScope === authScope && overallTotal !== null ? overallTotal : "—"} 条 · 当前筛选：{visibleTotal} 条</div>
      </div>

      <div className={styles.tableWrap} data-table-height-boundary>
        <StandardRowSelectionProvider selectionKey={requestQuery}>
        <ResponsiveTable
          columns={columns}
          loading={loading}
          fitViewport
          bottomScrollbar={false}
          virtual={virtualTable}
          listItemHeight={64}
          components={virtualTable?virtualTableComponents:tableComponents}
          locale={{ emptyText: <Empty description="没有匹配的标准" /> }}
          dataSource={filtered}
          rowKey="id"
          size="small"
          minWidth={1100}
          pagination={false}
        />
        </StandardRowSelectionProvider>
      </div>

      {canDirectPublish && pendingAction && <StandardPendingActionModal key={`${authScope}:${pendingAction.id}:${pendingAction.action}`}
        target={pendingAction} onClose={() => setPendingAction(null)} onCompleted={handleChanged} />}
      {(canRetire || canEdit) && retireTarget && <StandardRetireModal key={`${authScope}:${canRetire}:${retireTarget.id}:${retireTarget.versionNo}`} direct={canRetire} target={retireTarget}
        onClose={() => setRetireTarget(null)} onRetired={handleChanged} />}
      {printOpen && <Suspense fallback={null}><StandardPrintModal key={authScope} categories={categories} currentCategory={activeCategory} currentRows={filtered} onClose={() => setPrintOpen(false)} /></Suspense>}

      <StandardDetailDrawer key={`detail:${authScope}:${canEdit}:${canReview}`}
        open={detailOpen}
        standardId={detailId}
        categories={categories}
        canEdit={canEdit}
        allowDirectEdit={canDirectPublish}
        canReview={canReview}
        canRetire={canRetire}
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
        directPublish={canDirectPublish}
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
