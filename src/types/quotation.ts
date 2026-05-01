export interface Product {
  id: string;
  name: string;
  spec?: string;
  unit: string;
  price: number;
  qty?: number;
  amount?: number;
  torque?: string;
  image?: string;
  remark?: string;
}

export interface CustomerInfo {
  name: string;
  contact?: string;
  tel?: string;
  address?: string;
}

export interface QuoteMeta {
  no: string;
  date: string;
  currency: string;
  taxNote: string;
  showStamp: boolean;
  showAmount: boolean;
}

export interface Quotation {
  customer: CustomerInfo;
  quoteMeta: QuoteMeta;
  products: Product[];
  terms: string[];
}
