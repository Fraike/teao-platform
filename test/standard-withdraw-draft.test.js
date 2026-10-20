import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const express=require('express'),jwt=require('jsonwebtoken');
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'withdraw-draft-'));
process.env.JWT_SECRET='withdraw-draft-isolated-test-secret-at-least-32';
process.env.PRODUCTION_CONFIG_PATH=path.join(process.env.DATA_DIR,'config.json');
writeFileSync(process.env.PRODUCTION_CONFIG_PATH,JSON.stringify({enabled:false,wecomWebhook:''}));
let users=[['admin','admin',[]],['editor','user',['engineering_submit']],['reviewer','user',['engineering_review']],['other','user',['engineering_review']]].map(([id,role,permissions])=>({id,username:id,name:id,role,permissions,status:'active',passwordVersion:0}));
const save=()=>writeFileSync(path.join(process.env.DATA_DIR,'users.json'),JSON.stringify({users}));save();
const token=Object.fromEntries(users.map(u=>[u.id,jwt.sign(u,process.env.JWT_SECRET)]));
const {registerStandardRoutes}=await import('../server/routes/standards.js');
const s=await import('../server/services/standard-store.js');
const {createStandardReviewReminders,REVIEW_REMINDER_INTERVAL_MS}=await import('../server/services/standard-review-reminders.js');
const app=express();app.use(express.json());registerStandardRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const call=async(who,url,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{authorization:`Bearer ${token[who]}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():{}};};
const input={serialNo:'ADMIN-PENDING',customer:'客户',model:'RD-TEST',categoryKey:'gear_damper',fields:{test_standard:'10-20'}};
const exp=v=>({versionId:v.id,revision:v.revision});
const nextMorning=at=>{let day=Date.parse(new Date(at+REVIEW_REMINDER_INTERVAL_MS).toISOString().slice(0,10)+'T08:00:00+08:00');while(day<=at||new Date(day).getUTCDay()===0)day+=REVIEW_REMINDER_INTERVAL_MS;return day;};
async function pending(serialNo){let d=s.createStandard({...input,serialNo},users[1]);return s.submitStandard(d.id,users[1],{...exp(d.versions[0]),reviewerId:'reviewer',reviewerName:'reviewer'});}
try {
 let d=await pending('WITHDRAW-OWNER');const v=d.versions[0];const withdraw=`/api/standards/${d.id}/withdraw`;
 for(const who of ['other','reviewer','admin'])assert.equal((await call(who,withdraw,'POST',exp(v))).status,403,'only submitter withdraws');
 assert.equal((await call('editor',withdraw,'POST',{...exp(v),revision:0})).status,409);
 const fetchOriginal=globalThis.fetch;let notices=0;
 writeFileSync(process.env.PRODUCTION_CONFIG_PATH,JSON.stringify({enabled:false,wecomWebhook:'https://example.invalid/no-withdraw-notice'}));
 globalThis.fetch=(url,options)=>{if(String(url).startsWith('https://example.invalid/')){notices++;return Promise.resolve(Response.json({errcode:0}));}return fetchOriginal(url,options);};
 try {
  const r=await call('editor',withdraw,'POST',exp(v));assert.equal(r.status,200);d=r.body.data;
  assert.equal(d.versions[0].status,'draft');assert.equal(d.versions[0].versionNo,v.versionNo);assert.deepEqual(d.versions[0].fields,v.fields);
  assert.equal(d.versions[0].assignedReviewerId,'');assert.equal(d.versions[0].submittedAt,'');assert.equal(d.versions[0].submittedById,'editor');
  assert.equal(s.listPendingStandardNotifications(users[2]).total,0);assert.equal(notices,0);
 }finally{globalThis.fetch=fetchOriginal;writeFileSync(process.env.PRODUCTION_CONFIG_PATH,JSON.stringify({enabled:false,wecomWebhook:''}));}
 assert.equal((await call('editor',withdraw,'POST',exp(v))).status,409);
 assert.equal((await call('reviewer',`/api/standards/${d.id}/review`,'POST',{...exp(v),approve:true})).status,409,'old review cannot approve withdrawn content');
 let r=await call('editor',`/api/standards/${d.id}/discard-draft`,'POST',exp(d.versions[0]));assert.equal(r.status,200);assert.equal(r.body.data,null);
 assert(!s.listStandards().some(row=>row.id===d.id));assert.equal(s.getStandard(d.id,{includeDeleted:true}).versions[0].fields.test_standard,'10-20');
 // Clean up a revision: the published snapshot, source comments and outbox stay exactly unchanged.
 let pub=s.createStandard({...input,serialNo:'RESTORE-PUBLISHED'},users[0]);const original=pub.versions[0];
 s.archiveStandardComments(s.getDB(),pub.id,original.id,[{fieldKey:'test_standard',fieldLabel:'测试标准',author:'源表',text:'已发布批注',cell:'F2'}]);
 const outboxBefore=s.getDB().prepare('SELECT * FROM standard_publication_outbox WHERE standard_id=?').all(pub.id);
 pub=s.updateStandard(pub.id,{...input,...exp(original),categoryKey:'rack_damper',fields:{test_standard:'90-100'}},users[1]);const draft=pub.versions[0];
 for(const who of ['reviewer','other'])assert.equal((await call(who,`/api/standards/${pub.id}/discard-draft`,'POST',exp(draft))).status,403);
 r=await call('editor',`/api/standards/${pub.id}/discard-draft`,'POST',exp(draft));assert.equal(r.status,200);
 const active=s.listStandards().find(row=>row.id===pub.id);assert.equal(active.status,'published');assert.equal(active.hasPending,false);assert.deepEqual(active.fields,original.fields);assert.equal(active.categoryKey,original.categoryKey);
 const summary=s.getStandard(pub.id,{includeHistory:false,includeCurrentComments:true});assert.equal(summary.versions[0].id,original.id);assert.equal(summary.sourceComments[0].text,'已发布批注');
 assert.deepEqual(s.getDB().prepare('SELECT * FROM standard_publication_outbox WHERE standard_id=?').all(pub.id),outboxBefore);
 assert.deepEqual(s.getStandard(pub.id).versions[0],original);
 pub=s.updateStandard(pub.id,{...input,...exp(original)},users[1]);assert.equal(pub.versions[0].versionNo,3);
 // Submitter remains entitled to abandon a rejected draft even if another person originally created it.
 let shared=s.createStandard({...input,serialNo:'SUBMITTER-OWNERSHIP'},users[1]);shared=s.submitStandard(shared.id,users[3],{...exp(shared.versions[0]),reviewerId:'reviewer',reviewerName:'reviewer'});
 shared=s.reviewStandard(shared.id,{...exp(shared.versions[0]),approve:false,comment:'请修正'},users[2]);
 assert.equal((await call('other',`/api/standards/${shared.id}/discard-draft`,'POST',exp(shared.versions[0]))).status,200);
 let legacy=s.createStandard({...input,serialNo:'LEGACY-DRAFT'},users[1]);s.getDB().prepare("UPDATE product_standard_versions SET created_by_id='',submitted_by_id='' WHERE id=?").run(legacy.versions[0].id);
 assert.equal((await call('editor',`/api/standards/${legacy.id}/discard-draft`,'POST',exp(legacy.versions[0]))).status,403);
 assert.equal((await call('admin',`/api/standards/${legacy.id}/discard-draft`,'POST',exp(legacy.versions[0]))).status,200);
 const race=await pending('RACE');const outcomes=await Promise.all([call('editor',`/api/standards/${race.id}/withdraw`,'POST',exp(race.versions[0])),call('reviewer',`/api/standards/${race.id}/review`,'POST',{...exp(race.versions[0]),approve:true})]);assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);
 // Draft cleanup loses to submission; stale/repeated cleanup must never archive the replacement state.
 let competing=s.createStandard({...input,serialNo:'DRAFT-SUBMIT-RACE'},users[1]);const oldDraft=competing.versions[0];
 const competingResults=await Promise.all([call('editor',`/api/standards/${competing.id}/submit`,'POST',{...exp(oldDraft),reviewerId:'reviewer'}),call('editor',`/api/standards/${competing.id}/discard-draft`,'POST',exp(oldDraft))]);
 assert.deepEqual(competingResults.map(r=>r.status).sort(),[200,409]);
 const disabledPending=await pending('DISABLED-WITHDRAW');
 const onlyDraft=s.createStandard({...input,serialNo:'DISABLED-OWNER'},users[1]);
 users=users.map(u=>u.id==='editor'?{...u,status:'pending'}:u);save();
 assert.equal((await call('editor',`/api/standards/${onlyDraft.id}/discard-draft`,'POST',exp(onlyDraft.versions[0]))).status,401);
 assert.equal(s.getStandard(onlyDraft.id).versions[0].status,'draft');
 assert.equal((await call('editor',`/api/standards/${disabledPending.id}/withdraw`,'POST',exp(disabledPending.versions[0]))).status,401);
 assert.equal(s.getStandard(disabledPending.id).versions[0].status,'pending_review');
 users=users.map(u=>u.id==='editor'?{...u,status:'active'}:u);save();
 assert.equal((await call('admin',`/api/standards/${onlyDraft.id}/discard-draft`,'POST',exp(onlyDraft.versions[0]))).status,200);
 assert.equal((await call('admin',`/api/standards/${onlyDraft.id}/discard-draft`,'POST',exp(onlyDraft.versions[0]))).status,409);
 // Upgrade compatibility: an older pending record has no structured submission event.
 let upgraded=await pending('LEGACY-REMINDER-CYCLE');const oldStamp=upgraded.versions[0].submittedAt;
 s.getDB().prepare("UPDATE product_standard_changes SET field_key='' WHERE standard_id=? AND field_key='review_submission'").run(upgraded.id);
 if(s.getDB().prepare('PRAGMA table_info(product_standard_versions)').all().some(c=>c.name==='last_submitted_at'))s.getDB().prepare('UPDATE product_standard_versions SET last_submitted_at=NULL WHERE standard_id=?').run(upgraded.id);
 s.getDB().prepare("INSERT INTO standard_review_reminders(version_id,submitted_at,last_attempt_at,status) VALUES(?,?,?,'sent')").run(upgraded.versions[0].id,oldStamp,Date.parse(oldStamp)+REVIEW_REMINDER_INTERVAL_MS);
 const OriginalDate=Date,rollbackAt=Date.parse(oldStamp)-5000;
 globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[rollbackAt]));}static now(){return rollbackAt;}};
 try{
  s.withdrawStandard(upgraded.id,exp(upgraded.versions[0]),users[1]);upgraded=s.getStandard(upgraded.id);
  upgraded=s.submitStandard(upgraded.id,users[1],{...exp(upgraded.versions[0]),reviewerId:'reviewer',reviewerName:'reviewer'});
  assert(Date.parse(upgraded.versions[0].submittedAt)>Date.parse(oldStamp),'legacy submission epoch survives withdrawal and clock rollback');
  let at=nextMorning(Date.parse(upgraded.versions[0].submittedAt))-1,notified=0;
  const service=createStandardReviewReminders({now:()=>at,users:()=>users,config:()=>({wecomWebhook:'https://example.invalid/mock'}),send:async(_url,content)=>{if(content.includes('LEGACY-REMINDER-CYCLE'))notified++;}});
  await service.tick();assert.equal(notified,0);at++;await service.tick();assert.equal(notified,1,'old reminder entry cannot throttle a new review cycle');
 }finally{globalThis.Date=OriginalDate;}
 // Frozen wall clock must still create a distinct submission epoch and the next workday reminder.
 const NativeDate=Date,at=NativeDate.now()+1000;
 globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}};
 try {
  let timed=await pending('NEW-REVIEW-CYCLE');const stamp=timed.versions[0].submittedAt;
  s.withdrawStandard(timed.id,exp(timed.versions[0]),users[1]);timed=s.getStandard(timed.id);
  timed=s.submitStandard(timed.id,users[1],{...exp(timed.versions[0]),reviewerId:'reviewer',reviewerName:'reviewer'});
  assert(Date.parse(timed.versions[0].submittedAt)>Date.parse(stamp),'new cycle must not reuse old reminder key');
  let tickAt=nextMorning(nextMorning(Date.parse(timed.versions[0].submittedAt)))-1,sends=0;
  const reminders=createStandardReviewReminders({now:()=>tickAt,users:()=>users,config:()=>({wecomWebhook:'https://example.invalid/mock'}),send:async(_url,content)=>{if(content.includes('NEW-REVIEW-CYCLE'))sends++;}});
  await reminders.tick();assert.equal(sends,0);tickAt++;await reminders.tick();assert.equal(sends,1);
  s.withdrawStandard(timed.id,exp(timed.versions[0]),users[1]);tickAt+=REVIEW_REMINDER_INTERVAL_MS;await reminders.tick();assert.equal(sends,1);
 }finally{globalThis.Date=NativeDate;}
 console.log('withdrawal, draft ownership, clean restoration, original comments/outbox, conflicts and reminder cycles passed');
}finally{await new Promise(r=>server.close(r));s.closeDB();}
