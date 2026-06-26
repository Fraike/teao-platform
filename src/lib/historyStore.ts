import { create } from "zustand";
import { api } from "./api";
import type { QuotationRecord } from "../types/quotation";

interface HistoryStore {
  records: QuotationRecord[];
  loading: boolean;
  loadRecords: () => Promise<void>;
  addRecord: (r: QuotationRecord) => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
}

export const useQuotationHistoryStore = create<HistoryStore>((set, get) => ({
  records: [],
  loading: false,

  loadRecords: async () => {
    set({ loading: true });
    try {
      const data = await api.get<QuotationRecord[]>("/api/history");
      set({ records: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addRecord: async (record) => {
    await api.post<{ ok: boolean; total: number }>("/api/history", { record });
    const records = [
      record,
      ...get().records.filter((r) => r.quoteNo !== record.quoteNo),
    ];
    set({ records });
  },

  removeRecord: async (id) => {
    try {
      await api.delete(`/api/history/${encodeURIComponent(id)}`);
      const records = get().records.filter((r) => r.id !== id);
      set({ records });
    } catch { /* ignore */ }
  },
}));
