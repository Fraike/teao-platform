import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { api } from "./api";
import type { ProductionHistoryCacheEntry } from "../types/productionScale";

const HISTORY_TTL = 5 * 60 * 1000;
const HISTORY_CAPACITY = 100;

export function useProductionHistory<T>(entriesUrl: string) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<number, ProductionHistoryCacheEntry<T>>());
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const activeId = useRef<number | null>(null);

  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const close = useCallback(() => {
    cancel(); activeId.current = null;
    setOpen(false); setLoading(false); setData([]);
  }, [cancel]);

  const invalidate = useCallback((id?: number) => {
    if (id === undefined) cache.current.clear();
    else cache.current.delete(id);
    if (id === undefined || activeId.current === id) {
      cancel(); setLoading(false); setData([]);
    }
  }, [cancel]);

  const show = useCallback(async (id: number) => {
    cancel(); activeId.current = id;
    const requestSequence = sequence.current;
    setOpen(true); setData([]); setLoading(false);
    const now = Date.now();
    for (const [key, entry] of cache.current) if (entry.expiresAt <= now) cache.current.delete(key);
    const cached = cache.current.get(id);
    if (cached) { setData(cached.data); return; }
    const requestController = new AbortController();
    controller.current = requestController;
    const isCurrent = () => sequence.current === requestSequence && !requestController.signal.aborted;
    setLoading(true);
    try {
      const response = await api.get<{ ok: boolean; data: T[] }>(`${entriesUrl}/${id}/history`, { signal: requestController.signal });
      if (!isCurrent()) return;
      if (!response.ok) throw new Error("加载失败");
      cache.current.set(id, { data: response.data, expiresAt: Date.now() + HISTORY_TTL });
      while (cache.current.size > HISTORY_CAPACITY) cache.current.delete(cache.current.keys().next().value!);
      setData(response.data);
    } catch {
      if (isCurrent()) message.error("加载失败");
    } finally {
      if (isCurrent()) { controller.current = null; setLoading(false); }
    }
  }, [cancel, entriesUrl]);

  return { open, data, loading, show, close, invalidate };
}
