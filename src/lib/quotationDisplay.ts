export function formatIntlTierLabel(
  minQty: number,
  unit: string,
  currency: string,
  price: number,
): string {
  const quantity = minQty.toLocaleString("en-US");
  const formattedPrice = price.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `MOQ ≥ ${quantity} ${unit || "PCS"} · ${currency} ${formattedPrice}`;
}
