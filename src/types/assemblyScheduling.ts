import type { ProductCategoryNode } from "./product.ts";

export interface ScheduleOrder {
  id: string;
  orderNo: string;
  customer: string;
  materialId: string;
  code: string;
  customerCode: string;
  product: string;
  spec: string;
  warehouseId: string;
  variant: string;
  unit: string;
  due: string;
  batch: string;
  ordered: number;
  qty: number | null;
  eligible: boolean;
  openForScheduling?: boolean;
  status: string;
  closed: string;
  out: number | null;
  realOut: number | null;
  orderDate?: string;
  lineClosed?: string;
  details?: Record<string,string | number | undefined>;
  inventory?: ScheduleStock[];
}

export interface ScheduleStock {
  materialId: string;
  categoryId?: string;
  warehouseId: string;
  warehouse: string;
  variant: string;
  batch: string;
  locationId: string;
  location?: string;
  unit: string;
  code: string;
  product: string;
  qty: number | null;
  onHand: number | null;
  finished: boolean;
  restricted: boolean;
}

export interface LineCapacity {
  line: string;
  materialId: string;
  hours: number;
  shiftHours: number;
  output: number;
  changeHours: number;
}

export interface ScheduleOverride {
  shipmentBaseline?: { field: ScheduleSettings["shipmentField"]; qty: number };
  ready?: boolean;
  urgent?: boolean;
  line?: string;
  maxQty?: number;
  note?: string;
  batches?: {date: string; qty: number; note?: string}[];
  actualReportIds?: number[];
  expected?: {reportId: number; date: string; qty: number}[];
}

export interface ScheduleSettings {
  prepDays: number;
  draftTime: string;
  shipmentField: '' | 'out_qty' | 'real_out_qty';
  reconciliation: string;
  warehouseIds: string[];
  capacities: LineCapacity[];
  overrides: Record<string, ScheduleOverride>;
}

export interface AssemblyProgress {
  id: number;
  date: string;
  line: string;
  productId: string;
  productName: string;
  spec: string;
  productionBatch: string;
  customer?: string;
  dailyQty: number;
  cumulativeQty: number;
  defects: number;
}

export interface ScheduleRow {
  key: string;
  order: ScheduleOrder;
  due: string;
  finish: string;
  demand: number;
  stock: number;
  availableStock?: number;
  expected: number;
  expectedBatches?: {key: string; qty: number}[];
  planned: number;
  actual?: number;
  actualState?: "matched" | "missing" | "ambiguous";
  short: number;
  line: string;
  hours: number;
  note: string;
  issue: string;
  quantityIssue?: boolean;
}

export interface ScheduleVersion {
  omittedCount?: number;
  version: number;
  snapshotId: number;
  stockSnapshotId?: number;
  at: string;
  actor: string;
  reason: string;
  rows: ScheduleRow[];
}

export interface SchedulePreview {
  omittedCount?: number;
  snapshotId: number;
  stockSnapshotId?: number;
  token: string;
  rows: ScheduleRow[];
  progress: AssemblyProgress[];
  versions: ScheduleVersion[];
  scheduledAt?: string;
  conflicts?: ScheduleRow[];
  progressAt?: string;
}

export interface ScheduleStatus {
  settings: ScheduleSettings;
  revision: number;
  lines: string[];
  snapshot: {id: number; at: string; orders: number; lines: number; stocks: number} | null;
  sync: {running: boolean; done: number; total: number; error: string};
  stockSnapshot?: {id:number; at:string; stocks:number} | null;
  stockSync?: {running:boolean; error:string};
  warehouses?: {id:string; name:string}[];
  canEdit: boolean;
  canConfigure: boolean;
}

export interface ScheduleLedger {
  rows: (ScheduleOrder | ScheduleStock)[];
  total: number;
  categories?: ProductCategoryNode[];
  unclassified?: number;
  warehouses?: {id:string; name:string}[];
}
