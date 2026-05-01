export function formatMoney(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

export function formatWeight(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return (value * 100).toFixed(1) + "%";
}

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}
