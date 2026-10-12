export interface ProductionImportPreview {
  previewToken: string;
  currentCount: number;
  incomingCount: number;
  replacedCount: number;
  currentDateRange: { from: string; to: string } | null;
  incomingDateRange: { from: string; to: string } | null;
  disappearingDates: Array<{ date: string; count: number }>;
  dateDifferences: Array<{ date: string; currentCount: number; incomingCount: number }>;
}
