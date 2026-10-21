import type { api } from '../src/lib/api.ts';

// Existing page scenarios have no pending tasks unless their test explicitly supplies them.
export const withEmptyPendingOverview = (get: typeof api.get): typeof api.get => ((url: string, options?: RequestInit) =>
  url.startsWith('/api/standards/pending-reviews') ? Promise.resolve({ ok: true, data: [], total: 0, overallTotal: 0, categories: [], page: 1, pageSize: 3, version: '' }) : get(url, options)) as typeof api.get;
