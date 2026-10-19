import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'standard-test-history-'));
const s=await import('../server/services/standard-store.js');
s.initDB();
test('test field history is filtered before pagination with the same published visibility boundary',()=>{
 const standard=s.createStandard({serialNo:'history-test',customer:'客户',model:'M',categoryKey:'rack_damper',fields:{test_standard:'120-160',winter_test_standard:'100-140'}},{id:'admin',name:'管理员',role:'admin'});
 const v=standard.versions[0],d=s.getDB();
 for(let i=0;i<25;i++)d.prepare("INSERT INTO product_standard_changes(id,standard_id,version_id,field_key,description,author,changed_at,sort_date,seq,created_at) VALUES(?,?,?,?,?,'作者','2025-01-01',20250101,?,?)").run(`change${i}`,standard.id,v.id,i%2?'test_standard':'winter_test_standard','变更',i,new Date().toISOString());
 d.prepare("INSERT INTO product_standard_changes(id,standard_id,version_id,field_key,description,author,changed_at,sort_date,seq,created_at) VALUES('hidden',?,'','test_standard','不可见','作者','2025-01-01',20250101,30,?)").run(standard.id,new Date().toISOString());
 const page=s.getStandardHistory(standard.id,{onlyPublished:true,section:'changes',fieldKey:'test_standard',page:2,pageSize:20});
 assert.equal(page.total,25);assert.equal(page.data.length,5);assert.ok(page.data.every(row=>/^(winter_)?test_standard$/.test(row.fieldKey)));
 assert.equal(s.listStandardPage({onlyPublished:true,search:'100-140'}).data.length,1);
 assert.throws(()=>s.getStandardHistory(standard.id,{section:'changes',fieldKey:'x'}),/字段/);
 s.closeDB();
});
