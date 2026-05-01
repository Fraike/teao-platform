import type { Quotation } from "../types/quotation";
import { DEFAULT_TERMS } from "./constants";

export const sampleQuotation: Quotation = {
  customer: {
    name: "XX汽车零部件有限公司",
    contact: "李工",
    tel: "138-0000-0000",
    address: "",
  },
  quoteMeta: {
    no: "Q-2026-0501",
    date: new Date().toISOString().slice(0, 10),
    currency: "CNY",
    taxNote: "不含税",
    showStamp: true,
    showAmount: true,
  },
  products: [
    {
      id: "p1",
      name: "齿轮阻尼器",
      spec: "RD-T022",
      unit: "个",
      price: 1.35,
      qty: 10000,
      amount: 13500,
      torque: "2.0±0.5 N·m",
      remark: "符合RoHS标准",
    },
    {
      id: "p2",
      name: "阻尼齿轮A型",
      spec: "DZ-A012",
      unit: "个",
      price: 0.98,
      qty: 20000,
      amount: 19600,
      torque: "1.5±0.3 N·m",
      remark: "",
    },
    {
      id: "p3",
      name: "硅油阻尼器",
      spec: "GY-RD005",
      unit: "个",
      price: 2.15,
      qty: 5000,
      amount: 10750,
      remark: "耐高温-40~120°C",
    },
  ],
  terms: [...DEFAULT_TERMS],
};
