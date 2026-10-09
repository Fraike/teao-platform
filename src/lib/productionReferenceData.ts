import { api } from "./api";
import { getCache, setCache } from "./kingdeeCache";
import { getProductionMaterialConfig } from "./productionMaterialConfig";
import { toProductionProductOptions, type ProductionProductOption } from "./productionProductSearch";
import { createProductionMaterialRequestQueue } from "./productionMaterialRequestQueue";
import { requireFreshKingdeeData } from "./kingdeeRefreshResult";
import type { KingdeeDataRefreshResult, KingdeeRefreshMessage } from "../types/kingdeeRefresh";
import type { KingdeeCustomer } from "../types/kingdee";

export interface ReferenceOption {
  value: string;
  label: string;
  spec?: string;
}

const pendingRequests = new Map<string, Promise<ReferenceOption[]>>();
const productionMaterialListeners = new Set<() => void>();

interface ProductionMaterialOptions {
  finishedProducts: ProductionProductOption[];
  plasticParts: ProductionProductOption[];
  fetchedAt?: string | null;
}

const productionMaterialRequestQueue = createProductionMaterialRequestQueue<ProductionMaterialOptions>();
const customerRequestQueue = createProductionMaterialRequestQueue<{ options: ReferenceOption[]; fetchedAt: string | null }>();
let pendingKingdeeDataRefresh: Promise<KingdeeDataRefreshResult> | null = null;

async function getReferenceOptions(key: string, request: () => Promise<ReferenceOption[]>, forceRefresh = false): Promise<ReferenceOption[]> {
  if (!forceRefresh) {
    const cached = getCache<ReferenceOption[]>(key);
    if (cached) return cached;
  }
  const pending = pendingRequests.get(key);
  if (pending) return pending;
  const promise = request().then((options) => {
    setCache(key, options);
    return options;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, promise);
  return promise;
}

async function getProductionMaterialOptions(forceRefresh = false): Promise<ProductionMaterialOptions> {
  const finishedConfig = getProductionMaterialConfig("assembly");
  const plasticPartsConfig = getProductionMaterialConfig("injection");
  if (!forceRefresh) {
    const finishedProducts = getCache<ProductionProductOption[]>(finishedConfig.cacheKey);
    const plasticParts = getCache<ProductionProductOption[]>(plasticPartsConfig.cacheKey);
    if (finishedProducts && plasticParts) return { finishedProducts, plasticParts };
  }
  const refreshParam = forceRefresh ? "?refresh=1" : "";
  return productionMaterialRequestQueue(forceRefresh, async () => {
    const response = await api.get<{ ok: boolean; stale?: boolean; refreshed?: boolean; fetchedAt?: string | null; data: { finishedProducts: Array<{ id: string | number; name: string; number?: string; spec?: string; model?: string }>; plasticParts: Array<{ id: string | number; name: string; number?: string; spec?: string; model?: string }> } }>(`/api/kingdee/production-materials${refreshParam}`);
    const data = forceRefresh ? requireFreshKingdeeData(response) : response.data;
    const options = {
      finishedProducts: toProductionProductOptions(data.finishedProducts),
      plasticParts: toProductionProductOptions(data.plasticParts),
      fetchedAt: response.fetchedAt,
    };
    setCache(finishedConfig.cacheKey, options.finishedProducts);
    setCache(plasticPartsConfig.cacheKey, options.plasticParts);
    return options;
  });
}

export function getFinishedProductOptions(forceRefresh = false) {
  return getProductionMaterialOptions(forceRefresh).then((options) => options.finishedProducts);
}

export function getInjectionPlasticPartOptions(forceRefresh = false) {
  return getProductionMaterialOptions(forceRefresh).then((options) => options.plasticParts);
}

export async function refreshProductionMaterialOptions() {
  const { finishedProducts, plasticParts, fetchedAt } = await getProductionMaterialOptions(true);
  productionMaterialListeners.forEach((listener) => listener());
  return { finishedProducts, plasticParts, fetchedAt };
}

export function subscribeToProductionMaterialUpdates(listener: () => void): () => void {
  productionMaterialListeners.add(listener);
  return () => productionMaterialListeners.delete(listener);
}

export function getCustomerOptions() {
  return getCustomerReference(false).then(({ options }) => options);
}

function getCustomerReference(forceRefresh: boolean) {
  return customerRequestQueue(forceRefresh, async () => {
    const cached = !forceRefresh && getCache<ReferenceOption[]>("production_customers");
    if (cached) return { options: cached, fetchedAt: null };
    const suffix = forceRefresh ? "?refresh=1" : "";
    const response = await api.get<{ ok: boolean; stale?: boolean; refreshed?: boolean; fetchedAt?: string | null; data: KingdeeCustomer[] }>(`/api/kingdee/customers${suffix}`);
    const customers = forceRefresh ? requireFreshKingdeeData(response) : response.data;
    const options = customers.map((customer) => ({ value: customer.name, label: customer.name }));
    setCache("production_customers", options);
    setCache("customers", customers);
    return { options, fetchedAt: response.fetchedAt || null };
  });
}

function refreshError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "金蝶更新失败，已保留旧缓存";
}

export function refreshKingdeeData(): Promise<KingdeeDataRefreshResult> {
  if (pendingKingdeeDataRefresh) return pendingKingdeeDataRefresh;
  const request = (async () => {
    const [products, customers] = await Promise.allSettled([
      getProductionMaterialOptions(true), getCustomerReference(true),
    ]);
    const result: KingdeeDataRefreshResult = {
      products: products.status === "fulfilled"
        ? { ok: true, finishedCount: products.value.finishedProducts.length,
          plasticCount: products.value.plasticParts.length, fetchedAt: products.value.fetchedAt || null }
        : { ok: false, error: refreshError(products.reason) },
      customers: customers.status === "fulfilled"
        ? { ok: true, count: customers.value.options.length, fetchedAt: customers.value.fetchedAt }
        : { ok: false, error: refreshError(customers.reason) },
    };
    if (result.products.ok || result.customers.ok) {
      productionMaterialListeners.forEach((listener) => listener());
    }
    return result;
  })();
  pendingKingdeeDataRefresh = request.finally(() => { pendingKingdeeDataRefresh = null; });
  return pendingKingdeeDataRefresh;
}

function fetchedAtLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `（${date.toLocaleString("zh-CN")}）`;
}

export function formatKingdeeRefreshMessage(result: KingdeeDataRefreshResult): KingdeeRefreshMessage {
  const products = result.products.ok
    ? `商品：成品 ${result.products.finishedCount} 条、塑胶配件 ${result.products.plasticCount} 条${fetchedAtLabel(result.products.fetchedAt)}`
    : `商品更新失败：${result.products.error}`;
  const customers = result.customers.ok
    ? `客户 ${result.customers.count} 条${fetchedAtLabel(result.customers.fetchedAt)}`
    : `客户更新失败：${result.customers.error}`;
  const level = result.products.ok && result.customers.ok ? "success"
    : result.products.ok || result.customers.ok ? "warning" : "error";
  return { level, content: `${products}；${customers}` };
}

export function getEmployeeOptions() {
  return getReferenceOptions("production_employees", async () => {
    const response = await api.get<Array<{ name: string }>>("/api/employees?status=active");
    return response.map((item) => ({ value: item.name, label: item.name }));
  });
}
