// ========================
// 基础信息
// ========================
export interface QuoteBasicInfo {
  productCategory: string;
  applicableVehicle: string;
  productName: string;
  productPartNo: string;
  netWeightGram: number;
  unit: string;
  supplierName: string;
  supplierContact: string;
  quoteDate: string;
  taxRate: number;
}

// ========================
// A 原材料分析
// ========================
export interface MaterialItem {
  id: string;
  materialName: string;
  supplierName: string;
  specification: string;
  netWeightKg: number;
  lossRate: number;
  unitPrice: number;
  scrapUnitPrice: number;
}

export interface MaterialItemResult {
  totalWeight: number;
  amount: number;
  scrapQty: number;
  scrapAmount: number;
  materialCost: number;
}

// ========================
// B 外购件分析
// ========================
export interface PurchasedPartItem {
  id: string;
  partName: string;
  supplierName: string;
  location?: string;
  quantity: number;
  unitPrice: number;
}

// ========================
// C 制造费用分析
// ========================
export interface ManufacturingProcessItem {
  id: string;
  processName: string;
  toolingName?: string;
  equipmentName?: string;
  equipmentPowerKw: number;
  operatorCount: number;
  processTimeMinute: number;
  wagePerHour: number;
  electricityPricePerKwh: number;
  depreciationCost: number;
}

export interface ManufacturingProcessResult {
  laborCost: number;
  powerCost: number;
  depreciationCost: number;
  manufacturingCost: number;
}

// ========================
// D 专项分摊分析
// ========================
export type AmortizedCategory = "mold" | "fixture" | "test";

export interface AmortizedCostItem {
  id: string;
  category: AmortizedCategory;
  name: string;
  totalAmount: number;
  amortizationQuantity: number;
}

// ========================
// E 包装费分析
// ========================
export interface PackagingItem {
  id: string;
  packagingName: string;
  specification: string;
  unit: string;
  unitPrice: number;
  materialUsage: number;
  partsPerPackage: number;
}

// ========================
// F 运输费分析
// ========================
export interface TransportItem {
  id: string;
  route: string;
  distanceKm?: number;
  partsPerShipment: number;
  freightCost: number;
  managementCost: number;
}

// ========================
// G 加成费用分析
// ========================
export interface MarkupCosts {
  managementCost: number;
  financeCost: number;
  salesCost: number;
  profit: number;
  otherCost: number;
}

// ========================
// 完整报价表单状态
// ========================
export interface QuoteFormState {
  basicInfo: QuoteBasicInfo;
  materials: MaterialItem[];
  purchasedParts: PurchasedPartItem[];
  processes: ManufacturingProcessItem[];
  amortizedCosts: AmortizedCostItem[];
  packagingItems: PackagingItem[];
  transportItems: TransportItem[];
  markupCosts: MarkupCosts;
}

// ========================
// 总价计算结果
// ========================
export interface CostSummary {
  materialCost: number;
  purchasedPartCost: number;
  manufacturingCost: number;
  amortizedCost: number;
  packagingCost: number;
  transportCost: number;
  markupCost: number;
  subtotalWithoutTax: number;
  taxAmount: number;
  totalWithTax: number;
}
