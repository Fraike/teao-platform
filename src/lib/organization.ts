import { api } from './api';
import type { EmployeeWecomBinding, OrganizationSettings, OrganizationView } from '../types/organization';

const base = '/api/organization';
export const organizationApi = {
  get: (signal: AbortSignal) => api.get<{ data: OrganizationView }>(base, { signal }),
  settings: (signal: AbortSignal) => api.get<{ data: OrganizationSettings }>(`${base}/settings`, { signal }),
  bindings: () => api.get<{ data: EmployeeWecomBinding[] }>(`${base}/wecom-bindings`),
  setLink: (employeeNo: string, userId: string) => api.put(`${base}/employee-link`, { employeeNo, userId }),
};
