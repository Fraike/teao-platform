import { create } from "zustand";
import type { QuotationRecord } from "../types/quotation";

const API_BASE = "/api/history";
const HISTORY_PASSWORD = "teao123";

function apiHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Auth-Password": HISTORY_PASSWORD,
  };
}

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
      const res = await fetch(API_BASE, { headers: apiHeaders() });
      if (res.ok) {
        const data = (await res.json()) as QuotationRecord[];
        set({ records: data, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  addRecord: async (record) => {
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ record }),
      });
      if (res.ok) {
        const records = [
          record,
          ...get().records.filter((r) => r.quoteNo !== record.quoteNo),
        ];
        set({ records });
      }
    } catch { /* ignore */ }
  },

  removeRecord: async (id) => {
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: apiHeaders(),
      });
      if (res.ok) {
        const records = get().records.filter((r) => r.id !== id);
        set({ records });
      }
    } catch { /* ignore */ }
  },
}));

export function historyPassword(): string {
  return HISTORY_PASSWORD;
}
