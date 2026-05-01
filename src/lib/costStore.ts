import { create } from "zustand";
import type {
  QuoteFormState,
  QuoteBasicInfo,
  MaterialItem,
  PurchasedPartItem,
  ManufacturingProcessItem,
  AmortizedCostItem,
  PackagingItem,
  TransportItem,
  MarkupCosts,
} from "../types/costQuote";
import { calcCostSummary } from "./costCalculations";
import { exampleQuote } from "../data/exampleCostQuote";
import { saveToStorage, loadFromStorage } from "./costStorage";

interface QuoteStore {
  quote: QuoteFormState;
  updateBasicInfo: (info: Partial<QuoteBasicInfo>) => void;
  setMaterials: (materials: MaterialItem[]) => void;
  setPurchasedParts: (parts: PurchasedPartItem[]) => void;
  setProcesses: (processes: ManufacturingProcessItem[]) => void;
  setAmortizedCosts: (costs: AmortizedCostItem[]) => void;
  setPackagingItems: (items: PackagingItem[]) => void;
  setTransportItems: (items: TransportItem[]) => void;
  setMarkupCosts: (costs: MarkupCosts) => void;
  resetToExample: () => void;
  saveQuote: () => void;
  loadQuote: () => boolean;
  importJSON: (json: string) => boolean;
  exportJSON: () => string;
}

const initialQuote = (): QuoteFormState => {
  const saved = loadFromStorage();
  return saved ?? structuredClone(exampleQuote);
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useQuoteStore = create<QuoteStore>((set, get) => ({
  quote: initialQuote(),

  updateBasicInfo: (info) =>
    set((s) => {
      const next = {
        ...s.quote,
        basicInfo: { ...s.quote.basicInfo, ...info },
      };
      saveToStorage(next);
      return { quote: next };
    }),

  setMaterials: (materials) =>
    set((s) => {
      const next = { ...s.quote, materials };
      saveToStorage(next);
      return { quote: next };
    }),

  setPurchasedParts: (parts) =>
    set((s) => {
      const next = { ...s.quote, purchasedParts: parts };
      saveToStorage(next);
      return { quote: next };
    }),

  setProcesses: (processes) =>
    set((s) => {
      const next = { ...s.quote, processes };
      saveToStorage(next);
      return { quote: next };
    }),

  setAmortizedCosts: (costs) =>
    set((s) => {
      const next = { ...s.quote, amortizedCosts: costs };
      saveToStorage(next);
      return { quote: next };
    }),

  setPackagingItems: (items) =>
    set((s) => {
      const next = { ...s.quote, packagingItems: items };
      saveToStorage(next);
      return { quote: next };
    }),

  setTransportItems: (items) =>
    set((s) => {
      const next = { ...s.quote, transportItems: items };
      saveToStorage(next);
      return { quote: next };
    }),

  setMarkupCosts: (costs) =>
    set((s) => {
      const next = { ...s.quote, markupCosts: costs };
      saveToStorage(next);
      return { quote: next };
    }),

  resetToExample: () => {
    const next = structuredClone(exampleQuote);
    saveToStorage(next);
    set({ quote: next });
  },

  saveQuote: () => {
    saveToStorage(get().quote);
  },

  loadQuote: () => {
    const saved = loadFromStorage();
    if (saved) {
      set({ quote: saved });
      return true;
    }
    return false;
  },

  importJSON: (json: string) => {
    try {
      const data = JSON.parse(json) as QuoteFormState;
      if (data.basicInfo && Array.isArray(data.materials)) {
        saveToStorage(data);
        set({ quote: data });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  exportJSON: () => {
    return JSON.stringify(get().quote, null, 2);
  },
}));

export function useCostSummary() {
  return calcCostSummary(useQuoteStore((s) => s.quote));
}

export { generateId };
