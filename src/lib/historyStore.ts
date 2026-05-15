import { create } from "zustand";
import type { QuotationRecord } from "../types/quotation";

const STORAGE_KEY = "quotation-history";
const PASSWORD_KEY = "quotation-history-pwd";

function loadRecords(): QuotationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as QuotationRecord[];
  } catch { /* ignore */ }
  return [];
}

function saveRecords(records: QuotationRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch { /* ignore */ }
}

function loadPassword(): string | null {
  return localStorage.getItem(PASSWORD_KEY);
}

interface HistoryStore {
  records: QuotationRecord[];
  addRecord: (r: QuotationRecord) => void;
  removeRecord: (id: string) => void;
}

export const useQuotationHistoryStore = create<HistoryStore>((set, get) => ({
  records: loadRecords(),

  addRecord: (record) => {
    const records = [
      record,
      ...get().records.filter((r) => r.quoteNo !== record.quoteNo),
    ];
    saveRecords(records);
    set({ records });
  },

  removeRecord: (id) => {
    const records = get().records.filter((r) => r.id !== id);
    saveRecords(records);
    set({ records });
  },
}));

export function historyPassword(): string | null {
  return loadPassword();
}

export function setHistoryPassword(pw: string): void {
  localStorage.setItem(PASSWORD_KEY, pw);
}
