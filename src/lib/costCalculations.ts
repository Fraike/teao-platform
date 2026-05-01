import type {
  MaterialItem,
  MaterialItemResult,
  PurchasedPartItem,
  ManufacturingProcessItem,
  ManufacturingProcessResult,
  AmortizedCostItem,
  PackagingItem,
  TransportItem,
  MarkupCosts,
  QuoteFormState,
  CostSummary,
} from "../types/costQuote";

// ========================
// A 原材料分析
// ========================
export function calcMaterialItem(item: MaterialItem): MaterialItemResult {
  const totalWeight = item.netWeightKg * (1 + item.lossRate);
  const amount = totalWeight * item.unitPrice;
  const scrapQty = totalWeight - item.netWeightKg;
  const scrapAmount = scrapQty * item.scrapUnitPrice;
  const materialCost = amount - scrapAmount;

  return { totalWeight, amount, scrapQty, scrapAmount, materialCost };
}

export function calcMaterialTotal(items: MaterialItem[]): number {
  return items.reduce((sum, item) => sum + calcMaterialItem(item).materialCost, 0);
}

// ========================
// B 外购件分析
// ========================
export function calcPurchasedPartItem(item: PurchasedPartItem): number {
  return item.quantity * item.unitPrice;
}

export function calcPurchasedPartTotal(items: PurchasedPartItem[]): number {
  return items.reduce((sum, item) => sum + calcPurchasedPartItem(item), 0);
}

// ========================
// C 制造费用分析
// ========================
export function calcManufacturingProcessItem(
  item: ManufacturingProcessItem
): ManufacturingProcessResult {
  const laborCost =
    (item.operatorCount * item.processTimeMinute) / 60 * item.wagePerHour;
  const powerCost =
    (item.equipmentPowerKw * item.processTimeMinute) / 60 *
    item.electricityPricePerKwh;
  const depreciationCost = item.depreciationCost;
  const manufacturingCost = laborCost + powerCost + depreciationCost;

  return { laborCost, powerCost, depreciationCost, manufacturingCost };
}

export function calcManufacturingTotal(items: ManufacturingProcessItem[]): number {
  return items.reduce(
    (sum, item) => sum + calcManufacturingProcessItem(item).manufacturingCost,
    0
  );
}

// ========================
// D 专项分摊分析
// ========================
export function calcAmortizedItem(item: AmortizedCostItem): number {
  if (!item.amortizationQuantity) return 0;
  return item.totalAmount / item.amortizationQuantity;
}

export function calcAmortizedTotal(items: AmortizedCostItem[]): number {
  return items.reduce((sum, item) => sum + calcAmortizedItem(item), 0);
}

// ========================
// E 包装费分析
// ========================
export function calcPackagingItem(item: PackagingItem): number {
  if (!item.partsPerPackage) return 0;
  return (item.unitPrice * item.materialUsage) / item.partsPerPackage;
}

export function calcPackagingTotal(items: PackagingItem[]): number {
  return items.reduce((sum, item) => sum + calcPackagingItem(item), 0);
}

// ========================
// F 运输费分析
// ========================
export function calcTransportItem(item: TransportItem): number {
  if (!item.partsPerShipment) return 0;
  const totalShipmentCost = item.freightCost + item.managementCost;
  return totalShipmentCost / item.partsPerShipment;
}

export function calcTransportTotal(items: TransportItem[]): number {
  return items.reduce((sum, item) => sum + calcTransportItem(item), 0);
}

// ========================
// G 加成费用分析
// ========================
export function calcMarkupTotal(markup: MarkupCosts): number {
  return (
    markup.managementCost +
    markup.financeCost +
    markup.salesCost +
    markup.profit +
    markup.otherCost
  );
}

// ========================
// 总价计算
// ========================
export function calcCostSummary(state: QuoteFormState): CostSummary {
  const materialCost = calcMaterialTotal(state.materials);
  const purchasedPartCost = calcPurchasedPartTotal(state.purchasedParts);
  const manufacturingCost = calcManufacturingTotal(state.processes);
  const amortizedCost = calcAmortizedTotal(state.amortizedCosts);
  const packagingCost = calcPackagingTotal(state.packagingItems);
  const transportCost = calcTransportTotal(state.transportItems);
  const markupCost = calcMarkupTotal(state.markupCosts);

  const subtotalWithoutTax =
    materialCost +
    purchasedPartCost +
    manufacturingCost +
    amortizedCost +
    packagingCost +
    transportCost +
    markupCost;

  const taxAmount = subtotalWithoutTax * state.basicInfo.taxRate;
  const totalWithTax = subtotalWithoutTax + taxAmount;

  return {
    materialCost,
    purchasedPartCost,
    manufacturingCost,
    amortizedCost,
    packagingCost,
    transportCost,
    markupCost,
    subtotalWithoutTax,
    taxAmount,
    totalWithTax,
  };
}
