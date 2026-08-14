import { create } from "zustand";
import type { Quotation, Product, MoldItem, CustomerInfo } from "../types/quotation";
import { sampleQuotation } from "./sample";
import { sampleIntlQuotation } from "./sample-intl";
import { DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS, DEFAULT_AMORTIZE_QTY, DEFAULT_TERMS, DEFAULT_TERMS_EN } from "./constants";

// ---- helpers ----

export function quoteNoForDate(no: string, date: string): string {
  const suffix = date && date.length >= 10 ? `${date.slice(5, 7)}${date.slice(8, 10)}` : "";
  if (!suffix) return no;
  const revision = no.match(/-R\d+$/i)?.[0] ?? "";
  const base = revision ? no.slice(0, -revision.length) : no;
  if (/\d{4}$/.test(base)) return `${base.replace(/\d{4}$/, suffix)}${revision}`;
  return base ? `${base}-${suffix}${revision}` : `Q-${date.slice(0, 4)}-${suffix}${revision}`;
}

export function prepareQuotationCopy(quotation: Quotation, date = new Date().toISOString().slice(0, 10)): Quotation {
  const copy = structuredClone(quotation);
  const datedQuoteNo = quoteNoForDate(copy.quoteMeta.no, date);
  const revisionMatch = datedQuoteNo.match(/-R(\d+)$/i);
  const nextQuoteNo = revisionMatch
    ? datedQuoteNo.replace(/-R\d+$/i, `-R${Number(revisionMatch[1]) + 1}`)
    : `${datedQuoteNo}-R1`;

  copy.quoteMeta = {
    ...copy.quoteMeta,
    no: nextQuoteNo,
    date,
  };
  return copy;
}

let idCounter = Date.now();
function genId(): string {
  return "item_" + (++idCounter).toString(36);
}

// ---- store factory ----

export interface QuotationStoreOptions {
  storageKey: string;
  sampleData: Quotation;
  enableLegacyTierPricing?: boolean;
  defaults: {
    salesName: string;
    salesTel: string;
    tradeTerm?: string;
    paymentTerm?: string;
    taxNote?: string;
    defaultTerms: string[];
    customerDefaults?: Partial<CustomerInfo>;
    productDefaults?: Partial<Product>;
  };
}

function normalizeQuotation(data: Quotation, opts: QuotationStoreOptions): Quotation {
  const d = opts.defaults;
  const quoteMeta = {
    ...data.quoteMeta,
    salesName: data.quoteMeta.salesName || d.salesName,
    salesTel: data.quoteMeta.salesTel || d.salesTel,
    tradeTerm: data.quoteMeta.tradeTerm ?? d.tradeTerm,
    paymentTerm: data.quoteMeta.paymentTerm ?? d.paymentTerm,
    taxNote: data.quoteMeta.taxNote ?? d.taxNote,
  };

  return {
    ...data,
    customer: { ...d.customerDefaults, ...data.customer },
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
      ...d.productDefaults,
      ...product,
      tierPricingEnabled: product.tierPricingEnabled ?? (opts.enableLegacyTierPricing === true && Boolean(product.tiers?.length)),
      partNo: product.partNo || "",
      unit: !product.unit || product.unit === "个" ? "PCS" : product.unit,
    })),
    molds: data.molds || [],
  };
}

function load(key: string, opts: QuotationStoreOptions): Quotation {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return normalizeQuotation(JSON.parse(raw) as Quotation, opts);
  } catch { /* ignore */ }
  return normalizeQuotation(structuredClone(opts.sampleData), opts);
}

function save(key: string, state: Quotation) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch { /* ignore */ }
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
  replaceQuotation: (quotation: Quotation) => void;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

export function createQuotationStore(opts: QuotationStoreOptions) {
  return create<QuotationStore>((set, get) => ({
    quotation: load(opts.storageKey, opts),

    setCustomer: (fn) =>
      set((s) => {
        const next = { ...s.quotation, customer: fn(s.quotation.customer) };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    setQuoteMeta: (fn) =>
      set((s) => {
        const quoteMeta = fn(s.quotation.quoteMeta);
        const next = normalizeQuotation({ ...s.quotation, quoteMeta }, opts);
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    setProducts: (products) =>
      set((s) => {
        const next = { ...s.quotation, products };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    addProduct: () =>
      set((s) => {
        const products = [
          ...s.quotation.products,
          { id: genId(), name: "", partNo: "", spec: "", unit: "PCS", price: 0 },
        ];
        const next = { ...s.quotation, products };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    removeProduct: (id) =>
      set((s) => {
        const products = s.quotation.products.filter((p) => p.id !== id);
        const next = { ...s.quotation, products };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    duplicateProduct: (id) =>
      set((s) => {
        const target = s.quotation.products.find((p) => p.id === id);
        if (!target) return s;
        const products = [...s.quotation.products, { ...target, id: genId() }];
        const next = { ...s.quotation, products };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    updateProduct: (id, fn) =>
      set((s) => {
        const products = s.quotation.products.map((p) =>
          p.id === id ? fn(p) : p
        );
        const next = { ...s.quotation, products };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    setTerms: (terms) =>
      set((s) => {
        const next = { ...s.quotation, terms };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    addMold: () =>
      set((s) => {
        const molds = [
          ...s.quotation.molds,
          { id: genId(), name: "", totalCost: 0, amortizeQty: DEFAULT_AMORTIZE_QTY },
        ];
        const next = { ...s.quotation, molds };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    removeMold: (id) =>
      set((s) => {
        const molds = s.quotation.molds.filter((m) => m.id !== id);
        const next = { ...s.quotation, molds };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    updateMold: (id, fn) =>
      set((s) => {
        const molds = s.quotation.molds.map((m) =>
          m.id === id ? fn(m) : m
        );
        const next = { ...s.quotation, molds };
        save(opts.storageKey, next);
        return { quotation: next };
      }),

    resetToSample: () => {
      const next = structuredClone(opts.sampleData);
      next.quoteMeta.no = quoteNoForDate(next.quoteMeta.no, next.quoteMeta.date);
      save(opts.storageKey, next);
      set({ quotation: next });
    },

    resetTerms: () => {
      set((s) => {
        const next = { ...s.quotation, terms: [...opts.defaults.defaultTerms] };
        save(opts.storageKey, next);
        return { quotation: next };
      });
    },

    replaceQuotation: (quotation) => {
      const next = normalizeQuotation(quotation, opts);
      save(opts.storageKey, next);
      set({ quotation: next });
    },

    exportJSON: () => JSON.stringify(get().quotation, null, 2),

    importJSON: (json: string) => {
      try {
        const data = JSON.parse(json);
        if (data.customer && data.products) {
          const next = normalizeQuotation(data, opts);
          save(opts.storageKey, next);
          set({ quotation: next });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  }));
}

// ---- pre-built store instances ----

export const useQuotationStore = createQuotationStore({
  storageKey: "quotation-data-v2",
  sampleData: sampleQuotation,
  defaults: {
    salesName: "王文涛",
    salesTel: "18617094202",
    defaultTerms: DEFAULT_TERMS,
  },
});

export const useIntlQuotationStore = createQuotationStore({
  storageKey: "quotation-intl-data-v1",
  sampleData: sampleIntlQuotation,
  enableLegacyTierPricing: true,
  defaults: {
    salesName: "Mark",
    salesTel: "+86 18813935128",
    tradeTerm: "EXW",
    paymentTerm: "50% deposit, 50% balance before shipment",
    taxNote: "EXW",
    defaultTerms: DEFAULT_TERMS_EN,
    customerDefaults: { email: "", postalCode: "", country: "" },
    productDefaults: { packaging: "" },
  },
});
