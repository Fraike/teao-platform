export type ProductionDataSource = "vika" | "internal";
export type ProductionDepartment = "assembly" | "injection";

export interface ProductionReportConfig {
  dataSource: ProductionDataSource;
  hasWebhook: boolean;
  configured: boolean;
}

export interface ProductionReportProduct {
  date?: string;
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
  date: string;
  dataSource: ProductionDataSource;
  generatedAt: string;
  missingDepartments: ProductionDepartment[];
  assembly: {
    records: ProductionLineSummary[];
    rawCount: number;
    summary: {
      lines: number;
      totalPlanQty: number;
      totalActualQty: number;
      totalDefects: number;
      totalBackorder: number;
      avgAchievementRate: number | null;
      avgQualifiedRate: number | null;
    };
  };
  injection: {
    records: ProductionMachineSummary[];
    rawCount: number;
    summary: {
      machines: number;
      totalQty: number;
      totalDefects: number;
      totalBackorder: number;
      avgQualifiedRate: number | null;
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

export type ProductionReportChannel = "config" | "report" | "preview" | "send" | "source" | "sourceConfirmation";

export interface ProductionReportContext {
  date: string;
  source: ProductionDataSource | null;
}

export interface ProductionReportTicket extends ProductionReportContext {
  revision: number;
  sequence: number;
  channel: ProductionReportChannel;
}

export interface ProductionReportCoordinator {
  getContext: () => ProductionReportContext;
  setContext: (date: string, source: ProductionDataSource | null) => void;
  begin: (channel: ProductionReportChannel) => ProductionReportTicket;
  isCurrent: (ticket: ProductionReportTicket) => boolean;
  invalidate: (channel: ProductionReportChannel) => void;
  invalidateAll: () => void;
}

export interface ProductionSourceSwitchAction {
  label: string;
  target: ProductionDataSource;
}

export interface ProductionPreviewView {
  ticket: ProductionReportTicket;
  data: ProductionReportPreview | null;
  error: string | null;
}
