import { create } from "zustand";
import type { Quotation, Product, MoldItem } from "../types/quotation";
import { sampleIntlQuotation } from "./sample-intl";
import { DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS, DEFAULT_AMORTIZE_QTY, DEFAULT_TERMS_EN } from "./constants";

const STORAGE_KEY = "quotation-intl-data-v1";

export function quoteNoForDate(no: string, date: string): string {
  const suffix = date && date.length >= 10 ? `${date.slice(5, 7)}${date.slice(8, 10)}` : "";
  if (!suffix) return no;
  if (/\d{4}$/.test(no)) return no.replace(/\d{4}$/, suffix);
  return no ? `${no}-${suffix}` : `Q-${date.slice(0, 4)}-${suffix}`;
}

function normalizeQuotation(data: Quotation): Quotation {
  const quoteMeta = {
    ...data.quoteMeta,
    salesName: data.quoteMeta.salesName || "Mark",
    salesTel: data.quoteMeta.salesTel || "+86 18813935128",
    tradeTerm: data.quoteMeta.tradeTerm || "EXW",
    paymentTerm: data.quoteMeta.paymentTerm || "50% deposit, 50% balance before shipment",
    taxNote: data.quoteMeta.taxNote || "EXW",
  };

  return {
    ...data,
    customer: {
      ...data.customer,
      email: data.customer.email || "",
      postalCode: data.customer.postalCode || "",
      country: data.customer.country || "",
    },
    quoteMeta: {
      ...quoteMeta,
      no: quoteNoForDate(quoteMeta.no, quoteMeta.date),
      showAmount: false,
      showMold: quoteMeta.showMold ?? false,
      tableColumnWidths: {
        ...DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS,
        ...(quoteMeta.tableColumnWidths || {}),
      },
    },
    products: data.products.map((product) => ({
      ...product,
      partNo: product.partNo || "",
      packaging: product.packaging || "",
      unit: !product.unit || product.unit === "个" ? "PCS" : product.unit,
    })),
    molds: data.molds || [],
  };
}

function load(): Quotation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeQuotation(JSON.parse(raw) as Quotation);
  } catch { /* ignore */ }
  return normalizeQuotation(structuredClone(sampleIntlQuotation));
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
  addMold: () => void;
  removeMold: (id: string) => void;
  updateMold: (id: string, fn: (prev: MoldItem) => MoldItem) => void;
  resetToSample: () => void;
  resetTerms: () => void;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

export const useIntlQuotationStore = create<QuotationStore>((set, get) => ({
  quotation: load(),

  setCustomer: (fn) =>
    set((s) => {
      const next = { ...s.quotation, customer: fn(s.quotation.customer) };
      save(next);
      return { quotation: next };
    }),

  setQuoteMeta: (fn) =>
    set((s) => {
      const quoteMeta = fn(s.quotation.quoteMeta);
      const next = normalizeQuotation({ ...s.quotation, quoteMeta });
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
        { id: genId(), name: "", partNo: "", spec: "", unit: "PCS", price: 0 },
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

  addMold: () =>
    set((s) => {
      const molds = [
        ...s.quotation.molds,
        { id: genId(), name: "", totalCost: 0, amortizeQty: DEFAULT_AMORTIZE_QTY },
      ];
      const next = { ...s.quotation, molds };
      save(next);
      return { quotation: next };
    }),

  removeMold: (id) =>
    set((s) => {
      const molds = s.quotation.molds.filter((m) => m.id !== id);
      const next = { ...s.quotation, molds };
      save(next);
      return { quotation: next };
    }),

  updateMold: (id, fn) =>
    set((s) => {
      const molds = s.quotation.molds.map((m) =>
        m.id === id ? fn(m) : m
      );
      const next = { ...s.quotation, molds };
      save(next);
      return { quotation: next };
    }),

  resetToSample: () => {
    const next = structuredClone(sampleIntlQuotation);
    next.quoteMeta.no = quoteNoForDate(next.quoteMeta.no, next.quoteMeta.date);
    save(next);
    set({ quotation: next });
  },

  resetTerms: () => {
    set((s) => {
      const next = { ...s.quotation, terms: [...DEFAULT_TERMS_EN] };
      save(next);
      return { quotation: next };
    });
  },

  exportJSON: () => JSON.stringify(get().quotation, null, 2),

  importJSON: (json: string) => {
    try {
      const data = JSON.parse(json);
      if (data.customer && data.products) {
        const next = normalizeQuotation(data);
        save(next);
        set({ quotation: next });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
