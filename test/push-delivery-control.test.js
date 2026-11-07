import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const directory=mkdtempSync(path.join(os.tmpdir(),'push-delivery-'));
process.env.JWT_SECRET='push-tests-only-secret-at-least-32-characters';
process.env.DATA_DIR=directory;
process.env.PRODUCTION_CONFIG_PATH=path.join(directory,'production-config.json');
process.env.PUSH_SETTINGS_PATH=path.join(directory,'push-settings.json');
const {readPushSettings,writePushSettings}=await import('../server/services/push-settings.ts');
const store=await import('../server/services/standard-store.js');store.initDB();
const outbox=await import('../server/services/standard-publication-outbox.js');
const {createStandardReviewReminders}=await import('../server/services/standard-review-reminders.js');
const d=store.getDB();
const admin={id:'admin',name:'管理员',role:'admin'};
function settings(changes){return writePushSettings({...readPushSettings(),...changes},admin);}
function create(serial){return store.createStandard({serialNo:serial,categoryKey:'gear_damper',customer:'客户',model:'型号',fields:{}},admin);}

test('closed publication is terminal, closing mid-send stops remaining parts, reopening does not replay',async()=>{
  let detail=create('PUSH-OFF');
  let row=d.prepare('SELECT * FROM standard_publication_outbox WHERE version_id=?').get(detail.versions[0].id);
  assert.equal(row.status,'disabled');
  let sends=0;
  const send=async()=>{sends++;};
  await outbox.deliverStandardPublication(d,row.id,{webhook:'mock',sendText:send,sendMarkdown:send});
  assert.equal(sends,0);
  settings({standardPublicationEnabled:true,standardReviewEnabled:true});
  await outbox.deliverStandardPublication(d,row.id,{webhook:'mock',sendText:send,sendMarkdown:send});
  assert.equal(sends,0,'old skipped publications never replay');
  detail=create('PUSH-PARTS');
  row=d.prepare('SELECT * FROM standard_publication_outbox WHERE version_id=?').get(detail.versions[0].id);
  const parts=JSON.stringify([{type:'text',content:'first'},{type:'text',content:'second'}]);
  d.prepare('UPDATE standard_publication_outbox SET payload=?,total_parts=2 WHERE id=?').run(parts,row.id);
  const close=async()=>{sends++;settings({standardPublicationEnabled:false});};
  const result=await outbox.deliverStandardPublication(d,row.id,{webhook:'mock',sendText:close,sendMarkdown:close});
  assert.equal(sends,1);assert.equal(result.status,'disabled');assert.equal(result.sentParts,1);
  settings({standardPublicationEnabled:true});
  await outbox.deliverStandardPublication(d,row.id,{webhook:'mock',sendText:send,sendMarkdown:send});
  assert.equal(sends,1);
});

test('custom minute slots deduplicate separately, hot update stops old tasks, closed manual reminder consumes nothing',async()=>{
  settings({standardReviewEnabled:true,reviewTimes:['08:10','08:30','13:00']});
  const author={id:'author',name:'提交人'};
  const reviewer={id:'reviewer',name:'审核人',status:'active',permissions:['engineering_review'],wecomUserid:'reviewer'};
  let now=Date.parse('2026-11-09T08:09:00+08:00'), calls=0;
  let detail=store.createStandard({serialNo:'CUSTOM-TIMES',categoryKey:'gear_damper',customer:'客户',model:'型号',fields:{}},author);
  detail=store.submitStandard(detail.id,author,{versionId:detail.versions[0].id,revision:detail.versions[0].revision,reviewerId:reviewer.id,reviewerName:reviewer.name});
  d.prepare('UPDATE product_standard_versions SET submitted_at=? WHERE id=?').run(new Date(now-60000).toISOString(),detail.versions[0].id);
  const service=createStandardReviewReminders({now:()=>now,users:()=>[reviewer],config:()=>({app:{corpId:'mock',agentId:'1',secret:'mock'},restDays:[],makeupWorkdays:[]}),send:async(_u,_text,options)=>{assert.equal(options.shouldSend(),true);calls++;}});
  const tasks=[];
  service.start({schedule:(expression,callback)=>{const task={expression,callback,stopped:false,stop(){this.stopped=true;}};tasks.push(task);return task;}});
  assert.equal(tasks.length,3);assert.equal(calls,0);
  now=Date.parse('2026-11-09T08:10:00+08:00');await service.tick();await service.tick();assert.equal(calls,1);
  now=Date.parse('2026-11-09T08:30:00+08:00');await service.tick();assert.equal(calls,2);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM standard_review_timed_reminders WHERE reviewer_id='reviewer'").get().n,2);
  settings({standardReviewEnabled:false});
  assert(tasks.every(task=>task.stopped));
  const before=d.prepare('SELECT COUNT(*) n FROM standard_review_reminders').get().n;
  assert.equal((await service.remind(detail.id,author,{versionNo:detail.versions[0].versionNo})).status,'disabled');
  assert.equal(d.prepare('SELECT COUNT(*) n FROM standard_review_reminders').get().n,before);
  settings({standardReviewEnabled:true,reviewTimes:['09:15']});
  assert.equal(tasks.at(-1).expression,'15 9 * * *');assert.equal(calls,2);
  service.stop();
});

test('closing during an uncertain HTTP result preserves uncertainty rather than marking it skipped',async()=>{
  settings({standardPublicationEnabled:true});
  const detail=create('PUSH-UNCERTAIN');
  const row=d.prepare('SELECT * FROM standard_publication_outbox WHERE version_id=?').get(detail.versions[0].id);
  const fail=async()=>{settings({standardPublicationEnabled:false});throw Object.assign(new Error('uncertain'),{code:'SEND_RESULT_UNCERTAIN'});};
  const result=await outbox.deliverStandardPublication(d,row.id,{webhook:'mock',sendText:fail,sendMarkdown:fail});
  assert.equal(result.status,'unknown');
});

test('manual reminder uncertainty keeps its cooldown even if the switch closes during HTTP',async()=>{
  settings({standardReviewEnabled:true});
  const author={id:'uncertain-author',name:'提交人'};
  const reviewer={id:'uncertain-reviewer',name:'审核人',status:'active',permissions:['engineering_review'],wecomUserid:'reviewer'};
  let detail=store.createStandard({serialNo:'MANUAL-UNCERTAIN',categoryKey:'gear_damper',customer:'客户',model:'型号',fields:{}},author);
  detail=store.submitStandard(detail.id,author,{versionId:detail.versions[0].id,revision:detail.versions[0].revision,reviewerId:reviewer.id,reviewerName:reviewer.name});
  let sends=0;
  const service=createStandardReviewReminders({users:()=>[reviewer],config:()=>({app:{corpId:'mock',agentId:'1',secret:'mock'}}),send:async()=>{sends++;settings({standardReviewEnabled:false});throw Object.assign(new Error('uncertain'),{code:'SEND_RESULT_UNCERTAIN'});}});
  const result=await service.remind(detail.id,author,{versionNo:detail.versions[0].versionNo});
  assert.equal(result.status,'unknown');
  assert.equal(d.prepare('SELECT status FROM standard_review_reminders WHERE version_id=?').get(detail.versions[0].id).status,'unknown');
  settings({standardReviewEnabled:true});
  assert.equal((await service.remind(detail.id,author,{versionNo:detail.versions[0].versionNo})).status,'cooldown');
  assert.equal(sends,1);
});
