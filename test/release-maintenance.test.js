import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'teao-maintenance-'));
process.env.DATA_DIR=dir;
process.env.JWT_SECRET='isolated-maintenance-test-secret-at-least-32-characters';
process.env.PRODUCTION_CONFIG_PATH=path.join(dir,'config.json');
process.env.TEAO_RELEASE_MAINTENANCE_FILE=path.join(dir,'maintenance');
fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH,JSON.stringify({enabled:true,wecomWebhook:'https://example.invalid/maintenance',cronExpression:'0 9 * * *'}));
fs.writeFileSync(process.env.TEAO_RELEASE_MAINTENANCE_FILE,'release');
const store=await import('../server/services/standard-store.js');
const {createPublicationWorker}=await import('../server/services/standard-publication-outbox.js');
const {createStandardReviewReminders}=await import('../server/services/standard-review-reminders.js');
const {createProductionScheduler}=await import('../server/services/production-report-scheduler.js');
let publicationReads=0,reminderReads=0,productionSends=0,callback;
const publication=createPublicationWorker(store.getDB(),()=>{publicationReads++;return {};});
const reminders=createStandardReviewReminders({config:()=>{reminderReads++;return {};}});
const scheduler=createProductionScheduler({validate:()=>true,schedule:(_expr,fn)=>{callback=fn;return {stop(){}};}},async()=>{productionSends++;return {status:'mocked'};},()=> '2026-10-19');
try {
 scheduler.start();
 await Promise.all([publication.tick(),reminders.tick(),callback()]);
 assert.deepEqual([publicationReads,reminderReads,productionSends],[0,0,0]);
 fs.renameSync(process.env.TEAO_RELEASE_MAINTENANCE_FILE,path.join(dir,'maintenance.completed'));
 await Promise.all([publication.tick(),reminders.tick(),callback()]);
 assert.deepEqual([publicationReads,reminderReads,productionSends],[1,1,1]);
 console.log('Release maintenance pauses all automatic external messages before readiness and resumes after reopening.');
} finally {scheduler.stop();store.closeDB();}
