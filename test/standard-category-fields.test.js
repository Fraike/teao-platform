import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'standard-category-fields-'));
const s=await import('../server/services/standard-store.js');s.initDB();
const {buildStandardPublication}=await import('../server/services/standard-publication.js');
try{
 for(const categoryKey of ['gear_damper','lock_sync']){
  const category=s.listCategories().find(c=>c.key===categoryKey);assert(!category.fields.some(f=>f.key==='lock_direction'));
  const d=s.createStandard({serialNo:`SP-${categoryKey}`,categoryKey,customer:'客户',model:'RD-TEST',fields:{lock_direction:'旧原始记录',test_standard:'12-18'}},{id:'admin',name:'管理员',role:'admin'});
  assert.equal(d.versions[0].fields.lock_direction,undefined);assert.equal(s.listStandardPage({category:categoryKey}).data[0].fields.lock_direction,undefined);
  const raw=s.getDB().prepare('SELECT fields FROM product_standard_versions WHERE id=?').get(d.versions[0].id);assert.equal(JSON.parse(raw.fields).lock_direction,'旧原始记录');
  const text=buildStandardPublication(d,{...d.versions[0],fields:JSON.parse(raw.fields)},category,{});assert(!text.includes('lock_direction'));assert(!text.includes('旧原始记录'));assert(text.includes('12-18'));
 }
 assert(s.listCategories().find(c=>c.key==='rack_damper').fields.some(f=>f.key==='lock_direction'));
 const rack=s.createStandard({serialNo:'SP-RACK',categoryKey:'rack_damper',customer:'客户',model:'RD-V130',fields:{lock_direction:'锁装右边'}},{id:'admin',name:'管理员',role:'admin'});
 assert.equal(rack.versions[0].fields.lock_direction,'锁装右边');
 console.log('category templates, business views and publication omit inapplicable fields; source history retained');
}finally{s.closeDB();}
