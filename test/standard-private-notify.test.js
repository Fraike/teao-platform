import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let user = { id: 'reviewer', status: 'active', permissions: ['engineering_review'], wecomUserid: 'alice' };
let pending = true, mutate = () => {}, posts = 0;
mock.module('../server/services/users.js', { namedExports: { getUserById: () => user, findUserByName: () => null } });
mock.module('../server/config.js', { namedExports: { readConfig: () => ({ wecomWebhook: 'never-used' }) } });
mock.module('../server/services/standard-store.js', { namedExports: {
 getDB: () => ({ prepare: () => ({ get: () => pending ? { id: 'version' } : undefined }) }),
 listCategories: () => [{ key: 'gear_damper', name: '齿轮阻尼器' }],
} });
mock.module('../server/services/wecom.js', { namedExports: { sendWecomMessage: () => { throw Error('group fallback prohibited'); }, sendWecomText: () => { throw Error('group fallback prohibited'); } } });
mock.module('../server/services/wecom-app.ts', { namedExports: {
 sendWecomAppText: async (userid, _text, { shouldSend }) => {
  assert.equal(userid, 'alice'); mutate();
  if (!shouldSend()) throw Object.assign(Error('cancelled'), { code: 'SEND_CANCELLED' });
  posts++;
 },
 appNotificationStatus: e => e.code === 'SEND_CANCELLED' ? 'cancelled' : 'failed',
} });
const { notifyReviewRequested } = await import('../server/services/standard-notify.js');
const standard = { id: 'standard', serialNo: 'SP-1', categoryKey: 'gear_damper', versions: [{ id: 'version', versionNo: 1, submittedAt: 'now', submittedById: 'author', assignedReviewerId: 'reviewer' }] };
test('private notification only targets eligible assigned reviewer and rechecks task, permission and binding', async () => {
 assert.equal((await notifyReviewRequested(standard, {id:'author',name:'作者'})).status,'sent');
 assert.equal(posts,1);
 for(const change of [()=>{pending=false;},()=>{user.permissions=[];},()=>{user.wecomUserid='bob';}]) {
  pending=true;user.permissions=['engineering_review'];user.wecomUserid='alice';mutate=change;
  assert.equal((await notifyReviewRequested(standard,{id:'author',name:'作者'})).status,'cancelled');
 }
 assert.equal(posts,1);
 mutate=()=>{};user.permissions=[];
 assert.equal((await notifyReviewRequested(standard,{id:'author',name:'作者'})).status,'invalid_reviewer');
 user=undefined;
 assert.equal((await notifyReviewRequested(standard,{id:'author',name:'作者'})).status,'invalid_reviewer');
 assert.equal(posts,1);
});
