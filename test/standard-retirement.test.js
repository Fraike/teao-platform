import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'standard-retire-'));
const s=await import('../server/services/standard-store.js');s.initDB();
try {
 const a={id:'a',name:'甲'},b={id:'b',name:'乙'},input={serialNo:'SP-OBSOLETE',categoryKey:'gear_damper',customer:'客户',model:'RD-T001',fields:{torque_standard:'12-18'}};
 let d=s.createStandard(input,a);const expected=()=>({versionId:d.versions[0].id,revision:d.versions[0].revision});
 d=s.submitStandard(d.id,a,expected());d=s.reviewStandard(d.id,{...expected(),approve:true},b);
 s.archiveStandardComments(s.getDB(),d.id,d.versions[0].id,[{fieldKey:'customer',fieldLabel:'客户',author:'旧作者',text:'2024.1.1新增',cell:'B7',changedAt:'2024-01-01'}]);
 assert.equal(s.getStandard(d.id,{onlyPublished:true}).sourceComments.length,1);
 assert.equal(s.getStandard(d.id,{includeHistory:false}).sourceComments.length,0);
 assert.equal(s.getStandard(d.id,{onlyPublished:true,includeHistory:false,includeCurrentComments:true}).sourceComments.length,1,'printing reads only current source comments without loading history');
 const old=expected();d=s.retireStandard(d.id,{...expected(),reason:'原表作废'},b);
 assert.equal(d.versions[0].status,'obsolete');assert.equal(d.versions[0].fields.torque_standard,'12-18');
 const outbox=await import('../server/services/standard-publication-outbox.js');
 assert.equal(outbox.publicationDelivery(s.getDB(),d.id,d.versions[0].id).status,'superseded');
 let sends=0;
 await outbox.createPublicationWorker(s.getDB(),()=>({wecomWebhook:''})).tick();
 const delivery=outbox.publicationDelivery(s.getDB(),d.id,d.versions[0].id);
 await outbox.deliverStandardPublication(s.getDB(),delivery.id,{webhook:'https://example.invalid/retired',sendText:async()=>{sends++;},sendMarkdown:async()=>{sends++;}});
 assert.equal(sends,0,'retired standard must never be dispatched');
 assert.equal(s.listStandards({onlyPublished:true}).length,0);assert.equal(s.listStandards({onlyPublished:true,status:'obsolete'}).length,1);
 const history=s.getStandard(d.id,{onlyPublished:true});assert.equal(history.sourceComments.length,1);assert(history.changes.some(c=>c.description.includes('原表作废')));
 assert.throws(()=>s.updateStandard(d.id,{...input,...expected()},a),/停用/);
 assert.throws(()=>s.retireStandard(d.id,{...old,reason:'旧页面'},b),e=>e.status===409);
 console.log('standard retirement and source comment visibility regression passed');
}finally{s.closeDB();}
