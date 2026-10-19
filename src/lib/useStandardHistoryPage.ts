import { useEffect, useState } from "react";
import { api } from "./api";
import type { StandardHistoryPage } from "../types/standard";

export function useStandardHistoryPage<T>(standardId: string, section: string, pageSize: number, enabled = true) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<StandardHistoryPage<T>>({ data: [], total: 0, page: 1, pageSize });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(""); } });
    api.get<StandardHistoryPage<T>>(`/api/standards/${standardId}/history?section=${section}&page=${page}&pageSize=${pageSize}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult(response); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "加载历史失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [standardId, section, page, pageSize, enabled]);
  return { ...result, page, setPage, loading, error };
}
