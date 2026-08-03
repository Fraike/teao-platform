export interface ProductionRecord {
  id: number;
  date: string; // YYYY-MM-DD
  line: string;
  customer: string;
  spec: string;
  productName: string;
  materialBatch: string;
  workHours: number;
  productionBatch: string;
  orderQty: number;
  dailyQty: number;
  planQty: number;
  cumulativeQty: number;
  defects: number;
  oilInjection: string;
  rubberRing: string;
  capping: string;
  shaftCore: string;
  ultrasonic: string;
  testing: string;
  gear: string;
  filler: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  // 计算字段
  achievementRate: number | null;
  qualifiedRate: number | null;
  ppm: number | null;
  backorder: number;
}

export interface DailyGroup {
  date: string;
  records: ProductionRecord[];
  summary: DailySummary;
}

export interface DailySummary {
  lines: number;
  totalOrderQty: number;
  totalPlanQty: number;
  totalDailyQty: number;
  totalCumulativeQty: number;
  totalDefects: number;
  achievementRate: number | null;
  qualifiedRate: number | null;
  totalBackorder: number;
}

export interface ProductionQueryResponse {
  ok: boolean;
  data: {
    groups: DailyGroup[];
    total: number;
    hasMore: boolean;
  };
}

export interface ProductionEntryInput {
  date: string;
  line: string;
  customer: string;
  spec?: string;
  productName: string;
  materialBatch?: string;
  workHours?: number;
  productionBatch?: string;
  orderQty?: number;
  dailyQty?: number;
  planQty?: number;
  cumulativeQty?: number;
  defects?: number;
  oilInjection?: string;
  rubberRing?: string;
  capping?: string;
  shaftCore?: string;
  ultrasonic?: string;
  testing?: string;
  gear?: string;
  filler?: string;
  remark?: string;
}

export interface AuditLog {
  id: number;
  record_id: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
}

// 产线选项
export const ASSEMBLY_LINES = [
  "12#", "15#", "16#", "17#", "18#", "19#", "20#",
  "21#", "22#", "23#", "24#", "25#", "26#", "27#",
];

// 工序字段列表
export const PROCESS_FIELDS: { key: keyof ProductionEntryInput; label: string }[] = [
  { key: "oilInjection", label: "注油" },
  { key: "rubberRing", label: "装胶圈" },
  { key: "capping", label: "盖盖子" },
  { key: "shaftCore", label: "放轴芯" },
  { key: "ultrasonic", label: "超声" },
  { key: "testing", label: "测试" },
  { key: "gear", label: "装齿轮" },
];
