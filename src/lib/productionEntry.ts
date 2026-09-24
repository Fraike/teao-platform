export type OrderQtySort = "asc" | "desc" | null;

export function getInjectionShiftVisual(shift: string): { tone: "day" | "night"; icon: "sun" | "moon" } {
  return shift === "白班" ? { tone: "day", icon: "sun" } : { tone: "night", icon: "moon" };
}

interface InjectionSummaryRecord {
  machine: string;
  orderQty: number;
  dailyQty: number;
  cumulativeQty: number;
  defects: number;
}

export function buildInjectionSummary(records: readonly InjectionSummaryRecord[]) {
  const totalOrderQty = records.reduce((sum, record) => sum + (record.orderQty || 0), 0);
  const totalDailyQty = records.reduce((sum, record) => sum + (record.dailyQty || 0), 0);
  const totalCumulativeQty = records.reduce((sum, record) => sum + (record.cumulativeQty || 0), 0);
  const totalDefects = records.reduce((sum, record) => sum + (record.defects || 0), 0);
  return {
    machines: new Set(records.map((record) => record.machine)).size,
    totalOrderQty,
    totalDailyQty,
    totalCumulativeQty,
    totalDefects,
    qualifiedRate: totalDailyQty > 0 ? (totalDailyQty - totalDefects) / totalDailyQty : null,
    totalBackorder: totalOrderQty - totalCumulativeQty,
  };
}

interface OrderQtyRecord {
  orderQty: number | null | undefined;
}

function isSortableOrderQty(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function sortRecordsByOrderQty<T extends OrderQtyRecord>(records: readonly T[], direction: OrderQtySort): T[] {
  if (!direction) return [...records];

  return [...records].sort((left, right) => {
    const leftOrderQty = left.orderQty;
    const rightOrderQty = right.orderQty;
    const leftHasValue = isSortableOrderQty(leftOrderQty);
    const rightHasValue = isSortableOrderQty(rightOrderQty);
    if (leftHasValue && rightHasValue) return direction === "asc" ? leftOrderQty - rightOrderQty : rightOrderQty - leftOrderQty;
    if (leftHasValue) return -1;
    if (rightHasValue) return 1;
    return 0;
  });
}

export function normalizePersonnel(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  return (value || []).map((item) => item.trim()).filter(Boolean).join("、");
}

export function splitPersonnelNames(value: string | undefined): string[] {
  return (value || "").split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
}

export function personnelToTags(value: string | undefined): string[] {
  return splitPersonnelNames(value);
}
