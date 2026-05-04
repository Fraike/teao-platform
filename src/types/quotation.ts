export interface Product {
  id: string;
  name: string;
  partNo?: string;
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
  salesName: string;
  salesTel: string;
  currency: string;
  taxNote: string;
  showStamp: boolean;
  showAmount: boolean;
  tableColumnWidths: ProductTableColumnWidths;
}

export interface Quotation {
  customer: CustomerInfo;
  quoteMeta: QuoteMeta;
  products: Product[];
  terms: string[];
}

export interface ProductTableColumnWidths {
  index: number;
  image: number;
  name: number;
  partNo: number;
  spec: number;
  unit: number;
  price: number;
  torque: number;
  remark: number;
}
