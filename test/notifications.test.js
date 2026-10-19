import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { EventEmitter } from 'node:events';

let queries = [];
mock.module('../server/services/users.js', { namedExports: { listPasswordRecoveryRequests() { return []; } } });
mock.module('../server/services/standard-store.js', { namedExports: {
  initDB() {},
  listStandards() { throw new Error('full scan forbidden'); },
  listPendingStandardNotifications(user, options) {
    queries.push({ user, options });
    if (user.id === "reader") return {total:0,items:[]};
    return { total: 25, items: Array.from({ length: 20 }, (_, i) => ({
      id: String(i), serialNo: `SP-${i}`, customer: '客户', model: '型号',
      categoryKey: 'gear_damper', updatedAt: '2026-10-14',
    })) };
  },
} });
const service = await import('../server/services/notifications.js');

test('notification page preserves total, bounds the indexed query and keeps item shape', () => {
  assert.equal(typeof service.listNotificationsPage, 'function');
  const user = { id: 'reviewer', permissions: ['engineering_review'] };
  const page = service.listNotificationsPage(user);
  assert.equal(page.total, 25);
  assert.equal(page.data.length, 20);
  assert.deepEqual(queries.at(-1), { user, options: { limit: 20 } });
  assert.equal(page.data[0].id, 'standard_review:0');
  assert.equal(page.data[0].link, '/product-standards?status=pending_review&category=gear_damper');
  assert.deepEqual(service.listNotifications(user), page.data);
});

test('no user skips queries and ordinary users use scoped pending queries', () => {
  assert.equal(typeof service.listNotificationsPage, 'function');
  queries = [];
  for (const user of [null, { id: 'reader', permissions: [] }]) {
    assert.deepEqual(service.listNotificationsPage(user), { total: 0, data: [] });
  }
  assert.equal(queries.length, 1);
  assert.equal(queries[0].user.id,"reader");
  service.listNotificationsPage({ id: 'admin', role: 'admin' });
  assert.equal(queries.length, 2);
});

const { productionQueryMetrics } = await import('../server/middleware/request-metrics.js');
test('standard and notification metrics record supplied bytes and rows, including zero', () => {
  const logs = [];
  const original = console.info;
  console.info = value => logs.push(JSON.parse(value));
  try {
    for (const path of ['/api/standards', '/api/standards/categories', '/api/notifications']) {
      const res = Object.assign(new EventEmitter(), { statusCode: 200, locals: { responseRows: 0, responseBytes: 42 } });
      productionQueryMetrics({ method: 'GET', path }, res, () => {});
      res.emit('finish');
    }
    assert.equal(logs.length, 3);
    for (const log of logs) {
      assert.equal(log.responseRows, 0); assert.equal(log.responseBytes, 42);
      assert.equal(log.event, 'api_query'); assert.equal(log.error, false);
    }
  } finally { console.info = original; }
});
