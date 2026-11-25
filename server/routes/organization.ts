import type { Express, Request, Response } from 'express';
import { jwtAuth, adminAuth, requirePermission } from '../middleware/jwt-auth.js';
import { getDB } from '../services/standard-store.js';
import { listEmployees } from '../services/employees.js';
import { listUsers } from '../services/users.js';
import { readWecomDirectory } from '../services/wecom-directory.ts';
import { createOrganizationStore } from '../services/organization.ts';

let store: ReturnType<typeof createOrganizationStore> | undefined;
export function organizationStore() {
  return store ??= createOrganizationStore(getDB(), () => listEmployees(), listUsers, readWecomDirectory);
}

function respond(handler: (req: Request) => unknown) {
  return (req: Request, res: Response) => {
    try { res.json({ ok: true, data: handler(req) ?? null }); }
    catch (error) {
      const handled = error instanceof Error && 'status' in error && typeof error.status === 'number';
      if (!handled) console.error('[organization] 处理请求失败');
      res.status(handled ? error.status as number : 500).json({ error: handled ? error.message : '组织架构暂不可用' });
    }
  };
}

export function registerOrganizationRoutes(app: Express) {
  const organization = organizationStore();
  const base = '/api/organization';
  app.get(base, jwtAuth, respond(() => organization.view()));
  app.get(`${base}/settings`, jwtAuth, adminAuth, respond(() => ({
    people: organization.people(), reconciliation: organization.reconcile(),
  })));
  app.get(`${base}/wecom-bindings`, jwtAuth, requirePermission('hr'), respond(() => organization.bindings()));
  app.put(`${base}/employee-link`, jwtAuth, adminAuth, respond(req => organization.link(req.body?.employeeNo, req.body?.userId)));
}
