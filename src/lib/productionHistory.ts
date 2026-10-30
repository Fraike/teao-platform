import { useTabState, useTabBusy, useTabDispose } from "./tabPageContext";
import { useCallback, useRef } from "react";
import { message } from "antd";
import { api } from "./api";
import type { ProductionHistoryCacheEntry } from "../types/productionScale";

const HISTORY_TTL = 5 * 60 * 1000;
const HISTORY_CAPACITY = 100;

export function useProductionHistory<T>(entriesUrl: string) {
  const [open, setOpen] = useTabState(`history:${entriesUrl}:open`, false);
  const [data, setData] = useTabState<T[]>(`history:${entriesUrl}:data`, []);
  const [loading, setLoading] = useTabState(`history:${entriesUrl}:loading`, false);
  const [cacheRef] = useTabState(`history:${entriesUrl}:cache`, () => ({ current: new Map<number, ProductionHistoryCacheEntry<T>>() }));
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [activeIdRef] = useTabState(`history:${entriesUrl}:activeIdRef`, () => ({ current: null as number | null }));

  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
  }, []);
  useTabBusy(loading);
  useTabDispose(cancel,'production-history:cancel');

  const close = useCallback(() => {
    cancel(); activeIdRef.current = null;
    setOpen(false); setLoading(false); setData([]);
  }, [cancel, activeIdRef, setData, setLoading, setOpen]);

  const invalidate = useCallback((id?: number) => {
    if (id === undefined) cacheRef.current.clear();
    else cacheRef.current.delete(id);
    if (id === undefined || activeIdRef.current === id) {
      cancel(); setLoading(false); setData([]);
    }
  }, [cancel, activeIdRef, cacheRef, setData, setLoading]);

  const show = useCallback(async (id: number) => {
    cancel(); activeIdRef.current = id;
    const requestSequence = sequence.current;
    setOpen(true); setData([]); setLoading(false);
    const now = Date.now();
    for (const [key, entry] of cacheRef.current) if (entry.expiresAt <= now) cacheRef.current.delete(key);
    const cached = cacheRef.current.get(id);
    if (cached) { setData(cached.data); return; }
    const requestController = new AbortController();
    controller.current = requestController;
    const isCurrent = () => sequence.current === requestSequence && !requestController.signal.aborted;
    setLoading(true);
    try {
      const response = await api.get<{ ok: boolean; data: T[] }>(`${entriesUrl}/${id}/history`, { signal: requestController.signal });
      if (!isCurrent()) return;
      if (!response.ok) throw new Error("加载失败");
      cacheRef.current.set(id, { data: response.data, expiresAt: Date.now() + HISTORY_TTL });
      while (cacheRef.current.size > HISTORY_CAPACITY) cacheRef.current.delete(cacheRef.current.keys().next().value!);
      setData(response.data);
    } catch {
      if (isCurrent()) message.error("加载失败");
    } finally {
      if (isCurrent()) { controller.current = null; setLoading(false); }
    }
  }, [cancel, entriesUrl, activeIdRef, cacheRef, setData, setLoading, setOpen]);

  return { open, data, loading, show, close, invalidate };
}
