export interface ImportDateRecord {
  date?: string;
}

export interface ImportDateRange {
  dateFrom: string;
  dateTo: string;
}

export function getImportedDateRange(records: ImportDateRecord[]): ImportDateRange | null {
  const dates = records.map((record) => record.date).filter((date): date is string => Boolean(date)).sort();
  if (dates.length === 0) return null;
  return { dateFrom: dates[0], dateTo: dates[dates.length - 1] };
}
