import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'standard-source-policy-'));
const s=await import('../server/services/standard-store.js');s.initDB();
const user={id:'admin',name:'管理员'};
const known={serialNo:'SP0103-A',customer:'芜湖中生▲',model:'RD-T020-800',categoryKey:'gear_damper',fields:{import_note:'此行作废\n放筒型阻尼器行内'},sourceHash:'f6267272947847810a542d7124f908bc03629ec243c6a65bf44719d34db89723',sourceSheet:'客户阻力值标准一览表-最新',sourceRow:100};
try{
 const preview=s.previewStandardImport([known],user);assert.equal(preview.obsolete,1);
 const result=await s.confirmStandardImport([known],user,preview.token);assert.equal(result.inserted,1);
 assert.equal(s.listStandards()[0].status,'obsolete');assert.equal(s.listStandards({onlyPublished:true}).length,0);
 const again=s.previewStandardImport([known],user);assert.equal(again.skipped,1);assert.equal(s.getDB().prepare('SELECT source_hash FROM product_standard_import_sources').get().source_hash,known.sourceHash);
 const project={...known,serialNo:'SP-PROJECT',customer:'利民FS11-A2▲',model:'RD-PROJECT',fields:{},sourceRow:101};
 const projectPreview=s.previewStandardImport([project],user);await s.confirmStandardImport([project],user,projectPreview.token);
 const imported=s.listStandards().find(item=>item.serialNo==='SP-PROJECT');assert.equal(imported.customer,'利民▲');assert.equal(imported.vehicleModel,'FS11-A2');
 assert.equal(s.previewStandardImport([project],user).skipped,1);
 const unknown=s.previewStandardImport([{...known,customer:'其他项目'}],user);assert.equal(unknown.token,null);assert.match(unknown.errors[0].message,/作废/);
 for(const field of ['serialNo','customer','model','customerPartNo','vehicleModel']) {
  const unknownBasic=s.previewStandardImport([{...known,serialNo:'SP-BASIC',fields:{},[field]:'作废'}],user);assert.equal(unknownBasic.token,null);assert.match(unknownBasic.errors[0].message,/作废/);
 }
 const altered=s.previewStandardImport([{...known,sourceHash:'a'.repeat(64)}],user);assert.equal(altered.token,null);
 console.log('confirmed obsolete source decisions, provenance and repeated import passed');
}finally{s.closeDB();}

const {resolveStandardImportStatus}=await import('../server/services/standard-source-policy.js');
const current={...known,sourceHash:'b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0',sourceRow:196};
assert.equal(resolveStandardImportStatus(current),'obsolete');
for(const patch of [{sourceHash:'b'.repeat(64)},{sourceSheet:'其他表'},{sourceRow:197},{customer:'其他客户'},{model:'其他型号'},{categoryKey:'barrel_damper'}]) {
 assert.throws(()=>resolveStandardImportStatus({...current,...patch}),/作废/);
}
assert.equal(resolveStandardImportStatus({...current,fields:{}}),'published');
