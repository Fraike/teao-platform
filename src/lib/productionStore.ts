import { create } from "zustand";

interface ProductionFilterState {
  dateFrom: string;
  dateTo: string;
  line: string | null;
  product: string;
  customer: string | null;
  search: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setLine: (v: string | null) => void;
  setProduct: (v: string) => void;
  setCustomer: (v: string | null) => void;
  setSearch: (v: string) => void;
  resetFilters: () => void;
}

function getDefaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 9);
  return d.toISOString().slice(0, 10);
}

function getDefaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useProductionStore = create<ProductionFilterState>((set) => ({
  dateFrom: getDefaultDateFrom(),
  dateTo: getDefaultDateTo(),
  line: null,
  product: "",
  customer: null,
  search: "",

  setDateFrom: (v) => set({ dateFrom: v }),
  setDateTo: (v) => set({ dateTo: v }),
  setLine: (v) => set({ line: v }),
  setProduct: (v) => set({ product: v }),
  setCustomer: (v) => set({ customer: v }),
  setSearch: (v) => set({ search: v }),
  resetFilters: () =>
    set({
      dateFrom: getDefaultDateFrom(),
      dateTo: getDefaultDateTo(),
      line: null,
      product: "",
      customer: null,
      search: "",
    }),
}));
