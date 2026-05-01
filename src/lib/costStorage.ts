import type { QuoteFormState } from "../types/costQuote";

const STORAGE_KEY = "cost-calculator-quote";

export function saveToStorage(state: QuoteFormState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadFromStorage(): QuoteFormState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QuoteFormState;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默失败
  }
}
