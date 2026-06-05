export interface Tier {
  id: string;      // 唯一标识
  minQty: number;  // 阶梯起始数量，如 100, 500, 1000
  price: number;   // 该阶梯对应单价
}

export interface Product {
  id: string;
  name: string;
  partNo?: string;
  spec?: string;
  unit: string;
  price: number;
  tiers?: Tier[];
  qty?: number;
  amount?: number;
  torque?: string;
  image?: string;
  remark?: string;
  packaging?: string;
}

export interface CustomerInfo {
  name: string;
  contact?: string;
  tel?: string;
  address?: string;
  email?: string;
  postalCode?: string;
  country?: string;
}

export interface QuoteMeta {
  no: string;
  date: string;
  salesName: string;
  salesTel: string;
  currency: string;
  taxNote: string;
  showStamp: boolean;
  showMold: boolean;
  showAmount: boolean;
  tableColumnWidths: ProductTableColumnWidths;
  tradeTerm?: string;
  paymentTerm?: string;
  bankInfo?: string;
}

export interface MoldItem {
  id: string;
  name: string;
  totalCost: number;
  amortizeQty: number;
}

export interface Quotation {
  customer: CustomerInfo;
  quoteMeta: QuoteMeta;
  products: Product[];
  terms: string[];
  molds: MoldItem[];
}

export interface QuotationRecord {
  id: string;
  createdAt: string;
  quoteNo: string;
  date: string;
  customerName: string;
  contact: string;
  currency: string;
  products: Product[];
  molds: MoldItem[];
  terms: string[];
  salesName: string;
  totalAmount: number;
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
  packaging: number;
  remark: number;
}
