import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'serial-filter-'));
const store=await import('../server/services/standard-store.js');store.initDB();const actor={id:'a',name:'工程',role:'admin'};
try{
 for(const [serialNo,customer,model] of [['SP0001-A','甲','T001'],['SP0001-A','乙','T001'],['SP0002-A','甲','SP0001-A']])store.createStandard({serialNo,customer,model,categoryKey:'gear_damper',fields:{}},actor);
 assert.equal(store.listStandardPage({serialNo:'sp0001-a'}).total,2);
 const result=store.listStandardPage({serialNo:'0001',customer:'甲',category:'gear_damper'});assert.equal(result.total,1);assert.equal(result.data[0].serialNo,'SP0001-A');
 assert.equal(store.listStandardPage({serialNo:'SP0001-A%'}).total,0);
 assert.throws(()=>store.listStandardPage({serialNo:['bad']}),/格式/);
 console.log('internal number substring filter is scoped, case insensitive and combines with customer/category');
}finally{store.closeDB();}
