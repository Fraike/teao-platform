import type { Quotation } from "../types/quotation";
import { DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS, DEFAULT_TERMS } from "./constants";

const today = new Date().toISOString().slice(0, 10);
const quoteNoForDate = (date: string) => `Q-${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}`;

export const sampleQuotation: Quotation = {
  customer: {
    name: "XX汽车零部件有限公司",
    contact: "李工",
    tel: "138-0000-0000",
    address: "",
  },
  quoteMeta: {
    no: quoteNoForDate(today),
    date: today,
    salesName: "王文涛",
    salesTel: "18617094202",
    currency: "CNY",
    taxNote: "不含税",
    showStamp: true,
    showAmount: false,
    tableColumnWidths: { ...DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS },
  },
  products: [
    {
      id: "p1",
      name: "齿轮阻尼器",
      partNo: "",
      spec: "RD-T022",
      unit: "PCS",
      price: 1.35,
      torque: "2.0±0.5 N·m",
      remark: "符合RoHS标准",
    },
    {
      id: "p2",
      name: "阻尼齿轮A型",
      partNo: "",
      spec: "DZ-A012",
      unit: "PCS",
      price: 0.98,
      torque: "1.5±0.3 N·m",
      remark: "",
    },
    {
      id: "p3",
      name: "硅油阻尼器",
      partNo: "",
      spec: "GY-RD005",
      unit: "PCS",
      price: 2.15,
      remark: "耐高温-40~120°C",
    },
  ],
  terms: [...DEFAULT_TERMS],
};
