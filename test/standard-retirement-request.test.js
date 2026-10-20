import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const express=require('express'),jwt=require('jsonwebtoken');
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'retirement-workflow-'));
process.env.JWT_SECRET='retirement-workflow-isolated-test-secret-at-least-32';
process.env.PRODUCTION_CONFIG_PATH=path.join(process.env.DATA_DIR,'config.json');
writeFileSync(process.env.PRODUCTION_CONFIG_PATH,JSON.stringify({enabled:false,wecomWebhook:''}));
let users=[['admin','admin',[]],['editor','user',['engineering_submit']],['reviewer','user',['engineering_review']],['other','user',['engineering_review']],['direct','user',['engineering_retire']]].map(([id,role,permissions])=>({id,username:id,name:id,role,permissions,status:'active',passwordVersion:0}));
const save=()=>writeFileSync(path.join(process.env.DATA_DIR,'users.json'),JSON.stringify({users}));save();
const token=Object.fromEntries(users.map(u=>[u.id,jwt.sign(u,process.env.JWT_SECRET)]));
const {registerStandardRoutes}=await import('../server/routes/standards.js');
const s=await import('../server/services/standard-store.js');
const {createStandardReviewReminders,REVIEW_REMINDER_INTERVAL_MS}=await import('../server/services/standard-review-reminders.js');
const app=express();app.use(express.json());registerStandardRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const call=async(who,url,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{authorization:`Bearer ${token[who]}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
const input={serialNo:'ADMIN-PENDING',customer:'客户',model:'RD-TEST',categoryKey:'gear_damper',fields:{test_standard:'10-20'}};
const exp=v=>({versionId:v.id,revision:v.revision});
async function pending(serialNo){let d=s.createStandard({...input,serialNo},users[1]);return s.submitStandard(d.id,users[1],{...exp(d.versions[0]),reviewerId:'reviewer',reviewerName:'reviewer'});}
try {
 const pub=()=>s.createStandard({...input,serialNo:'RETIRE-'+Math.random()},users[0]);
 let d=pub(),v=d.versions[0],snapshot=exp(v);
 const reqBody={...snapshot,reason:'客户要求停产',reviewerId:'direct'};
 // Old engineering_review must no longer imply direct retirement.
 assert.equal((await call('reviewer',`/api/standards/${d.id}/retire`,'POST',{...snapshot,reason:'无授权'})).status,403);
 const roster=await call('editor','/api/standards/retirement-reviewers');assert.equal(roster.status,200);assert.deepEqual(roster.body.data.map(r=>r.id).sort(),['admin','direct']);
 assert.equal((await call('other',`/api/standards/${d.id}/retirement-requests`,'POST',reqBody)).status,403);
 assert.equal((await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,reason:' '})).status,400);
 assert.equal((await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,reviewerId:'reviewer'})).status,400);
 let r=await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',reqBody);assert.equal(r.status,201);
 const request=r.body.request;assert.equal(request.status,'pending');assert.equal(s.getStandard(d.id).versions[0].status,'published');
 const list=(await call('editor','/api/standards')).body.data.find(row=>row.id===d.id);assert.equal(list.retirementRequest.id,request.id);assert.equal(list.hasPending,false);
 const {listNotificationsPage}=await import('../server/services/notifications.js');
 assert(listNotificationsPage(users[4]).data.some(item=>item.type==='standard_retirement'&&item.link.includes('standardId=')));
 assert.equal((await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',reqBody)).status,409);
 const url=`/api/standards/${d.id}/retirement-requests/${request.id}/review`;
 assert.equal((await call('admin',url,'POST',{revision:request.revision,approve:true})).status,403);
 assert.equal((await call('direct',url,'POST',{revision:0,approve:true})).status,409);
 r=await call('direct',url,'POST',{revision:request.revision,approve:true});assert.equal(r.status,200);assert.equal(r.body.request.status,'approved');assert.equal(s.getStandard(d.id).versions[0].status,'obsolete');
 assert.equal((await call('direct',url,'POST',{revision:request.revision,approve:true})).status,409);
 assert(!listNotificationsPage(users[4]).data.some(item=>item.description.includes(d.serialNo)));
 // Rejection preserves published data and permits a new request.
 d=pub();snapshot=exp(d.versions[0]);let created=await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,...snapshot});const pendingRequest=created.body.request;
 const reviewUrl=`/api/standards/${d.id}/retirement-requests/${pendingRequest.id}/review`;
 assert.equal((await call('direct',reviewUrl,'POST',{revision:pendingRequest.revision,approve:false,comment:' '})).status,400);
 r=await call('direct',reviewUrl,'POST',{revision:pendingRequest.revision,approve:false,comment:'订单仍在生产'});assert.equal(r.status,200);assert.equal(r.body.request.status,'rejected');assert.equal(s.getStandard(d.id).versions[0].status,'published');
 created=await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,...snapshot});assert.equal(created.status,201);
 const newer=created.body.request;
 // A new draft invalidates the request; abandoning it must not revive the old request.
 let revised=s.updateStandard(d.id,{...input,...snapshot},users[1]);
 assert.equal((await call('direct',`/api/standards/${d.id}/retirement-requests/${newer.id}/review`,'POST',{revision:newer.revision,approve:true})).status,409);
 s.discardDraftStandard(d.id,exp(revised.versions[0]),users[1]);
 assert.equal(s.getDB().prepare('SELECT status FROM standard_retirement_requests WHERE id=?').get(newer.id).status,'invalidated');
 assert.equal((await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,...snapshot})).status,201);
 // Live revocation blocks both direct retirement and reviewing old requests.
 users=users.map(u=>u.id==='direct'?{...u,permissions:[]}:u);save();
 const active=s.listStandards().find(row=>row.id===d.id).retirementRequest;
 assert.equal((await call('direct',`/api/standards/${d.id}/retire`,'POST',{...snapshot,reason:'撤权后'})).status,403);
 assert.equal((await call('direct',`/api/standards/${d.id}/retirement-requests/${active.id}/review`,'POST',{revision:active.revision,approve:true})).status,403);
 assert.equal((await call('admin',`/api/standards/${d.id}/retirement-requests/${active.id}/review`,'POST',{revision:active.revision,approve:false,comment:'审核人已撤权，请重新申请'})).status,200);
 const {setUserPermission}=await import('../server/services/users.js');assert.equal((await setUserPermission('direct','engineering_retire',true)).error,undefined);
 d=pub();assert.equal((await call('direct',`/api/standards/${d.id}/retire`,'POST',{...exp(d.versions[0]),reason:'授权直接停用'})).status,200);
 // Nested approval and retirement are atomic even when the version update fails.
 d=pub();r=await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,...exp(d.versions[0])});const atomic=r.body.request;
 s.getDB().exec("CREATE TEMP TRIGGER retirement_test_abort BEFORE UPDATE ON product_standard_versions WHEN NEW.status='obsolete' BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 assert.equal((await call('direct',`/api/standards/${d.id}/retirement-requests/${atomic.id}/review`,'POST',{revision:atomic.revision,approve:true})).status,500);
 assert.equal(s.getDB().prepare('SELECT status FROM standard_retirement_requests WHERE id=?').get(atomic.id).status,'pending');assert.equal(s.getStandard(d.id).versions[0].status,'published');
 s.getDB().exec('DROP TRIGGER retirement_test_abort');
 assert.equal((await call('direct',`/api/standards/${d.id}/retirement-requests/${atomic.id}/review`,'POST',{revision:atomic.revision,approve:true})).status,200);
 // Self-assignment remains forbidden even after the applicant obtains direct retirement rights.
 assert.equal((await setUserPermission('editor','engineering_retire',true)).error,undefined);
 d=pub();assert.equal((await call('editor',`/api/standards/${d.id}/retirement-requests`,'POST',{...reqBody,...exp(d.versions[0]),reviewerId:'editor'})).status,400);
 console.log('retirement permissions, application approval, conflicts, invalidation, notifications and live revocation passed');
}finally{await new Promise(r=>server.close(r));s.closeDB();}
