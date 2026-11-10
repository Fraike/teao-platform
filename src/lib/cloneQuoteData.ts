import type { QuoteFormState } from "../types/costQuote";
import type { Quotation } from "../types/quotation";

export function cloneQuoteData<T extends Quotation | QuoteFormState>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  // Both quote models use JSON for persistence, so the fallback copies the same data shape.
  return JSON.parse(JSON.stringify(value)) as T;
}
