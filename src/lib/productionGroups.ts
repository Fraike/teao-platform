import type { DailySummary, ProductionRecord } from "../types/production";

export function buildAssemblySummary(records: readonly ProductionRecord[]): DailySummary {
  const totalOrderQty = records.reduce((sum, r) => sum + (r.orderQty || 0), 0);
  const totalPlanQty = records.reduce((sum, r) => sum + (r.planQty || 0), 0);
  const totalDailyQty = records.reduce((sum, r) => sum + (r.dailyQty || 0), 0);
  const totalCumulativeQty = records.reduce((sum, r) => sum + (r.cumulativeQty || 0), 0);
  const totalDefects = records.reduce((sum, r) => sum + (r.defects || 0), 0);
  return {
    lines: new Set(records.map((r) => r.line)).size,
    totalOrderQty, totalPlanQty, totalDailyQty, totalCumulativeQty, totalDefects,
    achievementRate: totalPlanQty ? totalDailyQty / totalPlanQty : null,
    qualifiedRate: totalDailyQty ? (totalDailyQty - totalDefects) / totalDailyQty : null,
    totalBackorder: totalOrderQty - totalCumulativeQty,
  };
}

export function replaceProductionRecord<T extends { id: number }, S, G extends { records: T[]; summary: S }>(
  groups: G[], record: T, summarize: (records: T[]) => S,
): G[] {
  return groups.map((group) => {
    if (!group.records.some((item) => item.id === record.id)) return group;
    const records = group.records.map((item) => item.id === record.id ? record : item);
    return { ...group, records, summary: summarize(records) };
  });
}
