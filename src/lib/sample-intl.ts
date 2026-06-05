import type { Quotation } from "../types/quotation";
import { DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS, DEFAULT_TERMS_EN } from "./constants";

const today = new Date().toISOString().slice(0, 10);
const quoteNoForDate = (date: string) => `Q-${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}`;

export const sampleIntlQuotation: Quotation = {
  customer: {
    name: "Jotor GmbH & Co. KG",
    contact: "Tobias Hielscher",
    email: "th@jotor.de",
    tel: "+49 (0)2226 909-3012",
    address: "Wolbersacker 10",
    postalCode: "53359",
    country: "Germany",
  },
  quoteMeta: {
    no: quoteNoForDate(today),
    date: today,
    salesName: "Mark",
    salesTel: "+86 18813935128",
    currency: "USD",
    taxNote: "EXW",
    showStamp: true,
    showMold: false,
    showAmount: false,
    tradeTerm: "EXW",
    paymentTerm: "50% deposit, 50% balance before shipment",
    tableColumnWidths: { ...DEFAULT_PRODUCT_TABLE_COLUMN_WIDTHS },
  },
  products: [
    {
      id: "p1",
      name: "RD-02 Latches",
      partNo: "",
      spec: "RD-02",
      unit: "PCS",
      price: 0,
      tiers: [
        { minQty: 1000, price: 0.12 },
        { minQty: 500, price: 0.14 },
        { minQty: 100, price: 0.15 },
      ],
      torque: "",
      packaging: "1g/pcs, 500 pcs / opp bag packing\nCTN: 32*38*26.5 CM",
      remark: "Freight Cost: $230",
    },
    {
      id: "p2",
      name: "RD-T028 Rotary Damper",
      partNo: "",
      spec: "RD-T028",
      unit: "PCS",
      price: 0.23,
      torque: "200gf.cm",
      packaging: "2.5g/pcs, 200 pcs / opp bag packing\nCTN: 32*38*26.5 CM",
      remark: "",
    },
  ],
  terms: [...DEFAULT_TERMS_EN],
  molds: [],
};
