import { callApi, ensureToken } from './kingdee.js';
import type { ChangeInventoryRow } from '../../src/types/engineeringChange.ts';

interface InventoryResponse {
  data: ChangeInventoryRow[];
  fetchedAt: string;
}

function count(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim() || !Number.isFinite(Number(value))) {
    throw new Error('库存数量格式无效');
  }
  return String(value);
}

export function readInventoryResponse(raw: { errcode?: number; code?: string | number; data?: { rows?: Record<string, unknown>[] } }): InventoryResponse {
  if (raw.errcode !== 0 && String(raw.code) !== '200' || !Array.isArray(raw.data?.rows)) throw new Error('库存响应不可用');
  const data = raw.data.rows.map(row => {
    if (typeof row.inv_stock !== 'string' || !row.inv_stock || typeof row.inv_base_unit !== 'string' || !row.inv_base_unit) {
      throw new Error('库存缺少仓库或单位');
    }
    return { warehouse: row.inv_stock, position: String(row.inv_stock_position ?? ''),
      unit: row.inv_base_unit, stock: count(row.inv_im_qty), available: count(row.inv_qty) };
  });
  return { data, fetchedAt: new Date().toISOString() };
}

export function createChangeInventoryLookup() {
  const pending = new Map<string, Promise<InventoryResponse>>();
  const cache = new Map<string, InventoryResponse>();
  return async function inventory(id: string) {
    const cached = cache.get(id);
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < 30_000) return cached;
    const existing = pending.get(id);
    if (existing) return existing;
    const request = (async () => {
      const { token, domain } = await ensureToken();
      const result = await callApi('GET', '/jdy/v2/scm/inventory_stock',
        { material_id: id, is_show_stock_position: 'true', is_show_zero_im_qty: 'true' }, null,
        { 'app-token': token, 'X-GW-Router-Addr': domain }, 1);
      const response = readInventoryResponse(result);
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(id, response);
      return response;
    })();
    pending.set(id, request);
    try { return await request; } finally { pending.delete(id); }
  };
}
