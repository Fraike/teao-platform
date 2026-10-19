import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'standard-reclassify-'));
const s=await import('../server/services/standard-store.js');
const {previewStandardReclassification,applyStandardReclassification}=await import('../server/services/standard-reclassification.js');
s.initDB();
const actor={id:'test',name:'测试'};
try{
 const a=s.createStandard({serialNo:'SP0015-C',model:'RD-V129-370',customer:'客户甲',categoryKey:'gear_damper',fields:{gear_spec:'正方向',remark:'原备注'}},actor);
 const b=s.createStandard({serialNo:'SP0015-C',model:'RD-V129-370',customer:'客户乙',categoryKey:'gear_damper',fields:{gear_spec:'反方向'}},actor);
 s.createStandard({serialNo:'SP-X',model:'OTHER',customer:'其他',categoryKey:'gear_damper',fields:{gear_spec:'齿轮'}},actor);
 const source=[{serialNo:'SP0015-C',model:'RD-V129-370',customer:'客户甲',categoryKey:'rack_damper',fields:{torque_direction:'正方向',lock_direction:'锁装左边'}},{serialNo:'SP0015-C',model:'RD-V129-370',customer:'客户乙',categoryKey:'rack_damper',fields:{torque_direction:'反方向',lock_direction:'/'}}];
 const preview=previewStandardReclassification(s.getDB(),source);assert.equal(preview.plans.length,2);assert.equal(preview.conflicts.length,0);
 applyStandardReclassification(s.getDB(),source,preview);
 const changed=s.getStandard(a.id);assert.equal(changed.categoryKey,'rack_damper');assert.equal(changed.versions[0].fields.torque_direction,'正方向');assert.equal(changed.versions[0].fields.gear_spec,undefined);assert.equal(changed.versions[0].fields.lock_direction,'锁装左边');assert.equal(changed.versions[0].fields.remark,'原备注');assert.equal(changed.versions[0].status,'draft');
 assert.equal(s.getStandard(b.id).versions[0].fields.torque_direction,'反方向');
 assert.equal(s.listStandards({category:'gear_damper'}).length,1);assert.equal(previewStandardReclassification(s.getDB(),source).plans.length,0);
 console.log('standard reclassification regression passed');
}finally{s.closeDB();}
