import type { Express, Request, Response } from 'express';
import { jwtAuth, adminAuth, requirePermission } from '../middleware/jwt-auth.js';
import { getUserById, listUsers } from '../services/users.js';
import { registerEngineeringPending } from '../services/notifications.js';
import { getDB } from '../services/standard-store.js';
import { createEngineeringChangeStore } from '../services/engineering-changes.ts';
import { canSubmit, fail, latestRound, tasks } from '../services/engineering-change-rules.ts';
import { canAccessEngineeringChanges, ENGINEERING_CHANGE_PERMISSION, materialDefaultWarehouse, roundAffectedMaterials } from '../shared/engineering-change-content.ts';
import type { ChangeDraftOptions } from '../../src/types/engineeringChange.ts';
import type { KingdeeMaterial } from '../../src/types/kingdee.ts';
import type { Actor } from '../services/engineering-change-rules.ts';
import { createChangeInventoryLookup } from '../services/engineering-change-inventory.ts';
import { createChangeNotificationWorker } from '../services/engineering-change-notifications.ts';
import { organizationStore } from './organization.ts';
import { searchCachedKingdeeMaterials } from './kingdee.js';

type AuthenticatedRequest = Request & { user: Actor };

let store: ReturnType<typeof createEngineeringChangeStore> | undefined;
export function engineeringChanges() {
  if (!store) {
    const organization = organizationStore();
    store = createEngineeringChangeStore(getDB(), getUserById, organization.routingConfig, () => true);
  }
  return store;
}

function route(handler: (req: AuthenticatedRequest) => unknown) {
  return async (req: Request, res: Response) => {
    try { res.json({ ok: true, data: await handler(req as AuthenticatedRequest) }); }
    catch (error) {
      const handled = error instanceof Error && 'status' in error && typeof error.status === 'number';
      if (!handled) console.error('[engineering-change] 处理请求失败', error);
      res.status(handled ? error.status as number : 500).json({ error: handled ? error.message : '工程变更处理失败，请稍后重试' });
    }
  };
}

export function registerEngineeringChangeRoutes(app: Express, inventory = createChangeInventoryLookup()) {
  const base = '/api/engineering-changes';
  const store = engineeringChanges();
  app.use(base, jwtAuth, requirePermission(ENGINEERING_CHANGE_PERMISSION));
  registerEngineeringPending((actor: Actor) => canAccessEngineeringChanges(actor) ? store.pending(actor) : { total: 0, data: [] });
  const assertDraft = (req: AuthenticatedRequest) => {
    const change = store.get(req.user, String(req.params.id));
    if (change.creator !== req.user.id || change.status !== 'draft' || !canSubmit(req.user)) fail(403, '仅草稿发起人可以编辑');
    return change;
  };
  const assessable = (req: AuthenticatedRequest) => {
    const change = store.get(req.user, String(req.params.id));
    if (!tasks(change).some(task => task.key === 'assessment' && task.userId === req.user.id)) fail(403, '当前单据未分派给你评估');
    return change;
  };
  const worker = createChangeNotificationWorker(store, getUserById);

  app.get(base, route(req => {
    const scope = req.query.scope;
    if (scope !== 'mine' && scope !== 'pending' && scope !== 'all') fail(400, '无效的列表范围');
    const page = Number(req.query.page ?? '1');
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) fail(400, '无效的页码');
    const rows = store.list(req.user, scope, page);
    const people = new Map((listUsers() as Actor[]).map(({ id, name, username }) => [id, name || username]));
    return {
      rows: rows.slice(0, 30).map(row => ({
        ...row, creatorName: people.get(row.creator) || row.creatorName,
        tasks: row.tasks.map(task => ({ ...task, assignee: people.get(task.userId) })),
      })),
      hasNext: rows.length > 30, canCreate: canSubmit(req.user),
    };
  }));
  app.get(`${base}/draft-check`, route(req => store.openDraft(req.user)));
  app.post(base, route(req => {
    const change = store.create(req.user, req.body);
    worker.wake();
    return change;
  }));
  app.get(`${base}/settings`, adminAuth, route(() => ({
    config: store.config(),
    users: (listUsers() as (Actor & { status: string; wecomUserid?: string })[]).filter(user => user.status === 'active').map(user => ({
      id: user.id, name: user.name || user.username, bound: Boolean(user.wecomUserid), canAccess: canAccessEngineeringChanges(user),
    })),
  })));
  app.put(`${base}/settings`, adminAuth, route(req => store.configure(req.user, req.body)));
  const search = async (req: AuthenticatedRequest) => {
    if (typeof req.query.search !== 'string' || !req.query.search.trim() || req.query.search.length > 100) return [];
    try {
      const rows: KingdeeMaterial[] = await searchCachedKingdeeMaterials(req.query.search.trim(), 30);
      return rows.map(row => ({ id: String(row.id), code: row.number, name: row.name, unit: row.base_unit_name,
        defaultWarehouse: materialDefaultWarehouse(row.stock_name) }));
    } catch { fail(503, '金蝶物料暂时无法查询，请稍后重试'); }
  };
  app.get(`${base}/materials`, route(req => {
    if (!canSubmit(req.user)) fail(403, '仅工程提交人员可查询物料');
    return search(req);
  }));
  app.get(`${base}/:id/materials`, route(req => {
    assessable(req);
    return search(req);
  }));
  const draftOptions = (req: AuthenticatedRequest): ChangeDraftOptions => {
    const doc = req.params.id ? assertDraft(req) : undefined;
    if (!canSubmit(req.user)) fail(403, '仅有工程提交权限的人员可发起');
    const config = store.routingConfig();
    const people = (listUsers() as (Actor & { status: string })[]).filter(user => user.status === 'active')
      .map(user => ({ id: user.id, name: user.name || user.username || user.id, canAccess: canAccessEngineeringChanges(user) }));
    const active = new Set(people.map(user => user.id));
    const allowed = new Set(people.filter(user => user.canAccess).map(user => user.id));
    const defaultId = (id?: string) => id && active.has(id) ? id : '';
    return {
      people, defaults: { pmc: defaultId(doc?.assignment?.pmc) || defaultId(config?.pmc),
        warehouse: defaultId(doc?.assignment?.warehouse) || defaultId(config?.warehouse) },
      departments: organizationStore().departments().map(({ name, account, issue }) => ({
        name, userId: account?.id,
        unavailableReason: issue
          ?? (account && !allowed.has(account.id) ? '主管未开通工程变更' : undefined)
          ?? (!config ? '待设置流程处理人' : account?.id === req.user.id ? '主管是申请人' : undefined),
      })),
    };
  };
  app.get(`${base}/draft-options`, route(draftOptions));
  app.get(`${base}/:id/draft-options`, route(draftOptions));
  app.get(`${base}/:id/cc-options`, route(req => {
    assertDraft(req);
    return (listUsers() as (Actor & { status: string })[]).filter(user => user.status === 'active' && user.id !== req.user.id && canAccessEngineeringChanges(user))
      .map(user => ({ id: user.id, name: user.name || user.username || user.id }));
  }));
  app.get(`${base}/:id/attachments/:fileId`, (req: Request, res: Response) => {
    try {
      const { file, bytes } = store.attachment((req as AuthenticatedRequest).user, String(req.params.id), String(req.params.fileId));
      res.set({ 'Content-Type': file.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}` }).send(bytes);
    } catch (error) {
      const handled = error instanceof Error && 'status' in error && typeof error.status === 'number';
      res.status(handled ? error.status as number : 500).json({ error: handled ? error.message : '附件读取失败' });
    }
  });
  app.get(`${base}/:id`, route(req => store.detail(req.user, String(req.params.id))));
  app.post(`${base}/:id/actions`, route(req => {
    const id = String(req.params.id);
    store.act(req.user, id, req.body);
    worker.wake();
    return store.detail(req.user, id);
  }));
  app.post(`${base}/:id/remind`, route(req => {
    const id = String(req.params.id);
    store.remind(req.user, id, req.body);
    worker.wake();
    return store.detail(req.user, id);
  }));
  app.get(`${base}/:id/inventory`, route(async req => {
    const change = store.get(req.user, String(req.params.id));
    const current = tasks(change).find(task => task.userId === req.user.id && (task.key === 'assessment' || task.key === 'scrap'));
    if (!current) fail(403, '仅当前 PMC 评估或报废登记人可以查询库存');
    const id = req.query.materialId;
    if (typeof id !== 'string') fail(400, '请选择物料');
    if (current.key === 'scrap') {
      if (!latestRound(change).lines.some(row => row.materialId === id && Number(row.scrap) > 0)) {
        fail(400, '请选择本轮已批准报废的物料');
      }
    } else {
      const previous = change.rounds.at(-1);
      const known = [...change.draft.materials, ...(previous ? roundAffectedMaterials(previous) : [])];
      if (!known.some(row => row.id === id) && !/^\d{8,30}$/.test(id)) fail(400, '请选择受影响物料');
    }
    try { return await inventory(id); }
    catch { fail(503, '金蝶库存暂时无法查询，请记录现场核对数量和来源'); }
  }));
  return worker;
}
