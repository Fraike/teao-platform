import {useTabBusy,useTabState,useTabInitialEffect} from "./tabPageContext";
import { api } from "./api";
import type { StandardHistoryPage } from "../types/standard";

export function useStandardHistoryPage<T>(standardId: string, section: string, pageSize: number, enabled = true) {
  const [page, setPage] = useTabState(`standard:history:${standardId}:${section}:page`,1);
  const [result, setResult] = useTabState<StandardHistoryPage<T>>(`standard:history:${standardId}:${section}:result`,{ data: [], total: 0, page: 1, pageSize });
  const [loading, setLoading] = useTabState(`standard:history:${standardId}:${section}:loading`,enabled);
  const [error, setError] = useTabState(`standard:history:${standardId}:${section}:error`,"");
  const completionQuery = JSON.stringify([standardId, section, page, pageSize, enabled]);
  const [completedQuery,setCompletedQuery] = useTabState<string|null>(`standard:history:${standardId}:${section}:completion`,null);
  useTabBusy(loading);
  useTabInitialEffect(`standard:history:${standardId}:${section}`, () => {
    setCompletedQuery(null);
    if (!enabled) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(""); } });
    api.get<StandardHistoryPage<T>>(`/api/standards/${standardId}/history?section=${section}&page=${page}&pageSize=${pageSize}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult(response); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "加载历史失败"); })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setCompletedQuery(completionQuery); } });
    return () => controller.abort();
  }, [standardId, section, page, pageSize, enabled], completedQuery===completionQuery);
  return { ...result, page, setPage, loading, error };
}
