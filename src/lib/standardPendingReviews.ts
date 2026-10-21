import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { StandardPendingReviewPage } from "../types/standard";

export function usePendingReviewOverview(scope: string) {
  const [snapshot, setSnapshot] = useState<{ scope: string; data?: StandardPendingReviewPage; loading: boolean; error: string }>({ scope, loading: true, error: "" });
  const request = useRef<AbortController | null>(null);
  const knownVersion = useRef({ scope: "", version: "" });
  useEffect(() => () => {
    request.current?.abort();
    knownVersion.current = { scope: "", version: "" };
  }, [scope]);
  const refresh = useCallback(async (version = "", force = false) => {
    if (!force && version && knownVersion.current.scope === scope && knownVersion.current.version === version) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSnapshot(previous => ({ scope, data: previous.scope === scope ? previous.data : undefined, loading: true, error: "" }));
    try {
      const data = await api.get<StandardPendingReviewPage>("/api/standards/pending-reviews?pageSize=3", { signal: controller.signal });
      if (controller.signal.aborted || request.current !== controller) return;
      knownVersion.current = { scope, version: data.version || version };
      setSnapshot({ scope, data, loading: false, error: "" });
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) setSnapshot(previous => ({ ...previous, scope, loading: false,
        error: error instanceof Error ? error.message : "待审概览加载失败" }));
    }
  }, [scope]);
  return { ...(snapshot.scope === scope ? snapshot : { data: undefined, loading: true, error: "" }), refresh };
}
