import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let saved;
mock.module('../server/services/users.js', { namedExports: {
  listStandardMaintainers: () => ({ candidates: [], selectedIds: [], revision: 'staff-v1' }),
  setStandardMaintainers: async () => ({ candidates: [], selectedIds: [], revision: 'staff-v1' }),
} });
mock.module('../server/middleware/jwt-auth.js', { namedExports: {
  jwtAuth: (req, res, next) => req.user ? next() : res.status(401).json({ error: '未登录' }),
  adminAuth: (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: '无权限' }),
} });
mock.module('../server/services/push-settings.ts', { namedExports: {
  readPushSettings: () => ({ enabled: true, revision: 2 }),
  writePushSettings: (data, user) => { saved = { data, user }; if (data.revision !== 2) throw Object.assign(new Error('版本冲突'), { status: 409 }); return { ...data, revision: 3 }; },
} });
const { registerSystemSettingsRoutes } = await import('../server/routes/system-settings.js');
const routes = {};
registerSystemSettingsRoutes({ get: (url, ...handlers) => routes.get = { url, handlers }, put: (url, ...handlers) => routes.put = { url, handlers } });
function run(method, user, body) {
  const result = { status: 200, body: null };
  const res = { status: status => { result.status = status; return res; }, json: body => { result.body = body; } };
  const req = { user, body };
  const handlers = [...routes[method].handlers];
  const next = () => handlers.shift()?.(req, res, next);
  next(); return result;
}
test('GET and PUT require admin, use exact endpoint and preserve response envelope', () => {
  assert.equal(routes.get.url, '/api/admin/system-settings/push');
  for (const method of ['get', 'put']) {
    assert.equal(run(method).status, 401);
    assert.equal(run(method, { role: 'user' }).status, 403);
  }
  assert.deepEqual(run('get', { role: 'admin' }).body, { ok: true, data: { enabled: true, revision: 2 } });
  assert.equal(run('put', { id: 'a', role: 'admin' }, { revision: 2 }).body.data.revision, 3);
  assert.equal(saved.user.id, 'a');
  assert.equal(run('put', { role: 'admin' }, { revision: 1 }).status, 409);
});
