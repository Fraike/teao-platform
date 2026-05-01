import type { QuoteFormState } from "../types/costQuote";

export const defaultBasicInfo = {
  productCategory: "齿轮阻尼器",
  applicableVehicle: "",
  productName: "RD-T022",
  productPartNo: "",
  netWeightGram: 1.07,
  unit: "个",
  supplierName: "东莞市特澳电子科技有限公司",
  supplierContact: "",
  quoteDate: new Date().toISOString().slice(0, 10),
  taxRate: 0.13,
};

export const exampleQuote: QuoteFormState = {
  basicInfo: defaultBasicInfo,

  // A 原材料
  materials: [
    {
      id: "m1",
      materialName: "PC原料",
      supplierName: "帝人",
      specification: "L-1250Y",
      netWeightKg: 0.0025,
      lossRate: 0.1,
      unitPrice: 20.5,
      scrapUnitPrice: 9.9,
    },
    {
      id: "m2",
      materialName: "POM原料",
      supplierName: "宝理",
      specification: "M90-44",
      netWeightKg: 0.004,
      lossRate: 0.1,
      unitPrice: 17.8,
      scrapUnitPrice: 9.9,
    },
  ],

  // B 外购件
  purchasedParts: [
    { id: "p1", partName: "硅油", supplierName: "优宝", quantity: 1, unitPrice: 0.19 },
    { id: "p2", partName: "胶圈", supplierName: "本优", quantity: 1, unitPrice: 0.05 },
  ],

  // C 制造工序
  processes: [
    {
      id: "c1",
      processName: "下座",
      toolingName: "注塑",
      equipmentName: "注塑机",
      equipmentPowerKw: 22.75,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c2",
      processName: "上盖",
      toolingName: "注塑",
      equipmentName: "注塑机",
      equipmentPowerKw: 22.75,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c3",
      processName: "轴芯",
      toolingName: "注塑",
      equipmentName: "注塑机",
      equipmentPowerKw: 22.75,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c4",
      processName: "齿轮",
      toolingName: "注塑",
      equipmentName: "注塑机",
      equipmentPowerKw: 22.75,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c5",
      processName: "下座注油",
      toolingName: "装配",
      equipmentPowerKw: 0,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c6",
      processName: "下座装轴芯",
      toolingName: "装配",
      equipmentPowerKw: 0,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c7",
      processName: "下座装上盖",
      toolingName: "装配",
      equipmentPowerKw: 0,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
    {
      id: "c8",
      processName: "产品测试",
      toolingName: "装配",
      equipmentPowerKw: 0,
      operatorCount: 1,
      processTimeMinute: 0.1,
      wagePerHour: 19,
      electricityPricePerKwh: 1.2,
      depreciationCost: 0,
    },
  ],

  // D 专项分摊
  amortizedCosts: [],

  // E 包装费
  packagingItems: [
    {
      id: "e1",
      packagingName: "纸箱",
      specification: "390*310*260",
      unit: "个",
      unitPrice: 6,
      materialUsage: 1,
      partsPerPackage: 10000,
    },
    {
      id: "e2",
      packagingName: "PE袋",
      specification: "/",
      unit: "个",
      unitPrice: 0.1,
      materialUsage: 1,
      partsPerPackage: 500,
    },
  ],

  // F 运输费
  transportItems: [],

  // G 加成费用
  markupCosts: {
    managementCost: 0.05,
    financeCost: 0.05,
    salesCost: 0,
    profit: 0.1,
    otherCost: 0,
  },
};
