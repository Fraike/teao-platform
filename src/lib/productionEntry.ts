export type OrderQtySort = "asc" | "desc" | null;

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
