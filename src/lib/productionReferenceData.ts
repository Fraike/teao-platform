import { api } from "./api";
import { getCache, setCache } from "./kingdeeCache";
import { getProductionMaterialConfig } from "./productionMaterialConfig";
import { toProductionProductOptions, type ProductionProductOption } from "./productionProductSearch";
import { createProductionMaterialRequestQueue } from "./productionMaterialRequestQueue";

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
}

const productionMaterialRequestQueue = createProductionMaterialRequestQueue<ProductionMaterialOptions>();

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
    const response = await api.get<{ ok: boolean; data: { finishedProducts: Array<{ id: string | number; name: string; number?: string; spec?: string }>; plasticParts: Array<{ id: string | number; name: string; number?: string; spec?: string }> } }>(`/api/kingdee/production-materials${refreshParam}`);
    const options = {
      finishedProducts: toProductionProductOptions(response.data.finishedProducts),
      plasticParts: toProductionProductOptions(response.data.plasticParts),
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
  const { finishedProducts, plasticParts } = await getProductionMaterialOptions(true);
  productionMaterialListeners.forEach((listener) => listener());
  return { finishedProducts, plasticParts };
}

export function subscribeToProductionMaterialUpdates(listener: () => void): () => void {
  productionMaterialListeners.add(listener);
  return () => productionMaterialListeners.delete(listener);
}

export function getCustomerOptions() {
  return getReferenceOptions("production_customers", async () => {
    const response = await api.get<{ ok: boolean; data: Array<{ name: string }> }>("/api/kingdee/customers");
    return response.ok ? response.data.map((item) => ({ value: item.name, label: item.name })) : [];
  });
}

export function getEmployeeOptions() {
  return getReferenceOptions("production_employees", async () => {
    const response = await api.get<Array<{ name: string }>>("/api/employees?status=active");
    return response.map((item) => ({ value: item.name, label: item.name }));
  });
}
