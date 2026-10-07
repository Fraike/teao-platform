export type ProductionDataSource = "internal";
export type ProductionDepartment = "assembly" | "injection";

export interface ProductionReportConfig {
  dataSource: ProductionDataSource;
  hasWebhook: boolean;
  configured: boolean;
}

export interface ProductionReportProduct {
  id: number;
  date?: string;
  line?: string;
  machine?: string;
  shift?: string;
  name: string;
  spec?: string;
  customer?: string;
  material?: string;
  planQty: number;
  actualQty: number;
  achievementRate: number | null;
  defects: number;
  qualifiedRate: number | null;
  backorder: number;
  batchNo: string;
  operator?: string;
  remark?: string;
}

export interface ProductionLineSummary {
  line: string;
  products: ProductionReportProduct[];
  totalPlan: number;
  totalActual: number;
  totalDefects: number;
  totalBackorder: number;
  recordCount: number;
}

export interface ProductionMachineSummary {
  machine: string;
  shift: string;
  products: ProductionReportProduct[];
  totalQty: number;
  totalDefects: number;
  totalBackorder: number;
  recordCount: number;
}

export interface ProductionReportData {
  exists: boolean;
  dateFrom: string;
  dateTo: string;
  dataSource: ProductionDataSource;
  generatedAt: string;
  missingDepartments: ProductionDepartment[];
  assembly: {
    rawCount: number;
    summary: {
      lines: number;
      totalPlanQty: number;
      totalActualQty: number;
      totalDefects: number;
      totalBackorder: number;
      avgAchievementRate: number | null;
      avgQualifiedRate: number | null;
      latestBackorder: number;
      backorderAsOf: string | null;
    };
  };
  injection: {
    rawCount: number;
    summary: {
      machines: number;
      machineShifts: number;
      totalQty: number;
      totalDefects: number;
      totalBackorder: number;
      avgQualifiedRate: number | null;
      latestBackorder: number;
      backorderAsOf: string | null;
    };
  };
}

export interface ProductionReportPreview {
  content: string;
  hasData: boolean;
  dataSource: ProductionDataSource;
  generatedAt: string;
  missingDepartments: ProductionDepartment[];
}

export interface ProductionReportRecords {
  department: ProductionDepartment;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  records: ProductionReportProduct[];
}

export type ProductionReportChannel = "config" | "report" | "records" | "preview" | "send";

export interface ProductionReportContext {
  dateFrom: string;
  dateTo: string;
}

export interface ProductionReportTicket extends ProductionReportContext {
  revision: number;
  sequence: number;
  channel: ProductionReportChannel;
}

export interface ProductionReportCoordinator {
  getContext: () => ProductionReportContext;
  setContext: (dateFrom: string, dateTo: string) => void;
  begin: (channel: ProductionReportChannel) => ProductionReportTicket;
  isCurrent: (ticket: ProductionReportTicket) => boolean;
  invalidate: (channel: ProductionReportChannel) => void;
  invalidateAll: () => void;
}

export interface ProductionPreviewView {
  ticket: ProductionReportTicket;
  data: ProductionReportPreview | null;
  error: string | null;
}
