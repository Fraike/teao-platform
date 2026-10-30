import {useTabBusy,useTabState,useTabInitialEffect} from "../../lib/tabPageContext";
import { Alert, Collapse, Empty, Table } from "antd";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import type { StandardChange, StandardHistoryPage, StandardSourceComment } from "../../types/standard";
import styles from "./StandardDetailDrawer.module.css";

function useTestHistoryPage<T>(standardId: string, section: "changes" | "comments", enabled: boolean, pageSize: number) {
  const [page, setPage] = useTabState(`standard:StandardTestHistory:${standardId}:${section}:page`,1);
  const [result, setResult] = useTabState<StandardHistoryPage<T>>(`standard:StandardTestHistory:${standardId}:${section}:result`,{ data: [], page: 1, pageSize, total: 0 });
  const [loading, setLoading] = useTabState(`standard:StandardTestHistory:${standardId}:${section}:loading`,false);
  const [error, setError] = useTabState(`standard:StandardTestHistory:${standardId}:${section}:error`,"");
  const completionQuery = JSON.stringify([standardId, section, enabled, page, pageSize]);
  const [completedQuery,setCompletedQuery] = useTabState<string|null>(`standard:StandardTestHistory:${standardId}:${section}:completion`,null);
  useTabBusy(loading);
  useTabInitialEffect(`StandardTestHistory:load:${standardId}:${section}`, () => {
    setCompletedQuery(null);
    if (!enabled) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(""); } });
    const query = new URLSearchParams({ section, fieldKey: "test_standard", page: String(page), pageSize: String(pageSize) });
    api.get<StandardHistoryPage<T>>(`/api/standards/${encodeURIComponent(standardId)}/history?${query}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult(response); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载测试标准历史失败"); })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setCompletedQuery(completionQuery); } });
    return () => controller.abort();
  }, [standardId, section, enabled, page, pageSize], enabled&&completedQuery===completionQuery);
  return { ...result, page, setPage, loading, error };
}

export function StandardTestHistory({ standardId }: { standardId: string }) {
  const scope = useAuthStore(state => `${state.user?.id}:${state.user?.role}:${state.user?.permissions?.join(",")}`);
  return <TestHistoryContent key={`${standardId}:${scope}`} standardId={standardId} />;
}

function TestHistoryContent({ standardId }: { standardId: string }) {
  const [open, setOpen] = useTabState<string[]>(`standard:StandardTestHistory:${standardId}:open`,[]);
  const changes = useTestHistoryPage<StandardChange>(standardId, "changes", open.includes("changes"), 20);
  const comments = useTestHistoryPage<StandardSourceComment>(standardId, "comments", open.includes("comments"), 10);
  const text = (value: string) => <span className={styles.historyText}>{value || "—"}</span>;
  return <Collapse className={styles.testHistory} activeKey={open} onChange={keys => setOpen(typeof keys === "string" ? [keys] : keys)} items={[
    { key: "changes", label: "测试标准变更", children: changes.error ? <Alert type="error" showIcon message={changes.error} /> : <Table<StandardChange>
      size="small" rowKey="id" loading={changes.loading} dataSource={changes.data}
      locale={{ emptyText: <Empty description="无测试标准变更" /> }}
      pagination={{ current: changes.page, total: changes.total, pageSize: 20, showSizeChanger: false, onChange: changes.setPage }}
      columns={[{ title: "变更日期", dataIndex: "changedAt", render: (value: string) => value || "无日期" },
        { title: "字段", dataIndex: "fieldLabel" }, { title: "变更内容", dataIndex: "description", render: text }, { title: "修改人", dataIndex: "author", render: text }]} /> },
    { key: "comments", label: "测试标准原始批注", children: comments.error ? <Alert type="error" showIcon message={comments.error} /> : <Table<StandardSourceComment>
      size="small" rowKey="id" loading={comments.loading} dataSource={comments.data}
      locale={{ emptyText: <Empty description="无测试标准原始批注" /> }}
      pagination={{ current: comments.page, total: comments.total, pageSize: 10, showSizeChanger: false, onChange: comments.setPage }}
      columns={[{ title: "原表单元格", dataIndex: "sourceCell", render: text }, { title: "字段", dataIndex: "fieldLabel" },
        { title: "作者", dataIndex: "author", render: text }, { title: "原始批注", dataIndex: "text", render: text }]} /> },
  ]} />;
}
