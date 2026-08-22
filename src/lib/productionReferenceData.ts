import { api } from "./api";
import { getCache, setCache } from "./kingdeeCache";

export interface ReferenceOption {
  value: string;
  label: string;
  spec?: string;
}

const FINISHED_PRODUCT_CATEGORY = "2314557705978701824";
const pendingRequests = new Map<string, Promise<ReferenceOption[]>>();

async function getReferenceOptions(key: string, request: () => Promise<ReferenceOption[]>): Promise<ReferenceOption[]> {
  const cached = getCache<ReferenceOption[]>(key);
  if (cached) return cached;
  const pending = pendingRequests.get(key);
  if (pending) return pending;
  const promise = request().then((options) => {
    setCache(key, options);
    return options;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, promise);
  return promise;
}

export function getFinishedProductOptions() {
  return getReferenceOptions("production_finished_products", async () => {
    const response = await api.get<{ ok: boolean; data: Array<{ name: string; spec?: string }> }>(`/api/kingdee/materials?category=${FINISHED_PRODUCT_CATEGORY}`);
    return response.ok ? response.data.map((item) => ({ value: item.name, label: item.name, spec: item.spec || "" })) : [];
  });
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
