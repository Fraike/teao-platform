import { create } from "zustand";
import type { Quotation, Product } from "../types/quotation";
import { sampleQuotation } from "./sample";
import { DEFAULT_TERMS } from "./constants";

const STORAGE_KEY = "quotation-data-v2";

function load(): Quotation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Quotation;
  } catch { /* ignore */ }
  return structuredClone(sampleQuotation);
}

function save(state: Quotation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

let idCounter = Date.now();
function genId(): string {
  return "item_" + (++idCounter).toString(36);
}

interface QuotationStore {
  quotation: Quotation;
  setCustomer: (fn: (prev: Quotation["customer"]) => Quotation["customer"]) => void;
  setQuoteMeta: (fn: (prev: Quotation["quoteMeta"]) => Quotation["quoteMeta"]) => void;
  setProducts: (products: Product[]) => void;
  addProduct: () => void;
  removeProduct: (id: string) => void;
  duplicateProduct: (id: string) => void;
  updateProduct: (id: string, fn: (prev: Product) => Product) => void;
  setTerms: (terms: string[]) => void;
  resetToSample: () => void;
  resetTerms: () => void;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

export const useQuotationStore = create<QuotationStore>((set, get) => ({
  quotation: load(),

  setCustomer: (fn) =>
    set((s) => {
      const next = { ...s.quotation, customer: fn(s.quotation.customer) };
      save(next);
      return { quotation: next };
    }),

  setQuoteMeta: (fn) =>
    set((s) => {
      const next = { ...s.quotation, quoteMeta: fn(s.quotation.quoteMeta) };
      save(next);
      return { quotation: next };
    }),

  setProducts: (products) =>
    set((s) => {
      const next = { ...s.quotation, products };
      save(next);
      return { quotation: next };
    }),

  addProduct: () =>
    set((s) => {
      const products = [
        ...s.quotation.products,
        { id: genId(), name: "", spec: "", unit: "个", price: 0, qty: 1 },
      ];
      const next = { ...s.quotation, products };
      save(next);
      return { quotation: next };
    }),

  removeProduct: (id) =>
    set((s) => {
      const products = s.quotation.products.filter((p) => p.id !== id);
      const next = { ...s.quotation, products };
      save(next);
      return { quotation: next };
    }),

  duplicateProduct: (id) =>
    set((s) => {
      const target = s.quotation.products.find((p) => p.id === id);
      if (!target) return s;
      const products = [...s.quotation.products, { ...target, id: genId() }];
      const next = { ...s.quotation, products };
      save(next);
      return { quotation: next };
    }),

  updateProduct: (id, fn) =>
    set((s) => {
      const products = s.quotation.products.map((p) =>
        p.id === id ? fn(p) : p
      );
      const next = { ...s.quotation, products };
      save(next);
      return { quotation: next };
    }),

  setTerms: (terms) =>
    set((s) => {
      const next = { ...s.quotation, terms };
      save(next);
      return { quotation: next };
    }),

  resetToSample: () => {
    const next = structuredClone(sampleQuotation);
    save(next);
    set({ quotation: next });
  },

  resetTerms: () => {
    set((s) => {
      const next = { ...s.quotation, terms: [...DEFAULT_TERMS] };
      save(next);
      return { quotation: next };
    });
  },

  exportJSON: () => JSON.stringify(get().quotation, null, 2),

  importJSON: (json: string) => {
    try {
      const data = JSON.parse(json);
      if (data.customer && data.products) {
        save(data);
        set({ quotation: data });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
