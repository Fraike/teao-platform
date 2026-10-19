import { api } from "./api";
import { getToken } from "./api";
import type { StandardCategory } from "../types/standard";

let generation = 0;
let cached: { session: string | null; expiresAt: number; data: StandardCategory[] } | null = null;
let pending: { session: string | null; promise: Promise<StandardCategory[]> } | null = null;

export function clearStandardQueryCache() { generation++; cached = null; pending = null; }

export async function loadStandardCategories(force = false): Promise<StandardCategory[]> {
  const session = getToken();
  const requestGeneration = generation;
  if (!force && cached?.session === session && cached.expiresAt > Date.now()) return cached.data;
  if (pending?.session === session) return pending.promise;
  const request = api.get<{ ok: boolean; data: StandardCategory[] }>("/api/standards/categories")
    .then((response) => {
      if (getToken() === session && generation === requestGeneration) cached = { session, expiresAt: Date.now() + 300_000, data: response.data };
      return response.data;
    }).finally(() => { if (pending?.promise === request) pending = null; });
  pending = { session, promise: request };
  return request;
}
