import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'comment-repair-transaction-'));
const store=await import('../server/services/standard-store.js');
const {applyRepair,repairFingerprint,assertSourceCoverage}=await import('../server/scripts/repair-standard-comment-history.js');
store.initDB();
test('repair rejects stale previews and rolls back mixed source updates on failure',()=>{
 const d=store.getDB();
 const st=store.createStandard({serialNo:'repair',customer:'客户',model:'M',categoryKey:'rack_damper',fields:{test_standard:'120-160'}},{id:'u',name:'用户'});
 const version=st.versions[0];
 const row=d.prepare('SELECT * FROM product_standard_changes WHERE standard_id=?').get(st.id);
 const preview={dbFingerprint:repairFingerprint(d),repair:{link:[{id:row.id,source_cell:'F1'}],removeIds:['not-imported'],insert:[]},fieldEdit:null};
 assert.throws(()=>applyRepair(d,preview),/机器导入批次/);
 assert.equal(d.prepare('SELECT source_cell FROM product_standard_changes WHERE id=?').get(row.id).source_cell,'');
 const beforeOutbox=d.prepare('SELECT count(*) n FROM standard_publication_outbox').get().n;
 const success={...preview,repair:{...preview.repair,removeIds:[]}};
 assert.throws(()=>applyRepair(d,success,()=>{throw new Error('最终验收失败');}),/最终验收失败/);
 assert.equal(d.prepare('SELECT source_cell FROM product_standard_changes WHERE id=?').get(row.id).source_cell,'');
 applyRepair(d,success);
 assert.equal(d.prepare('SELECT source_cell FROM product_standard_changes WHERE id=?').get(row.id).source_cell,'F1');
 assert.equal(d.prepare('SELECT status FROM product_standard_versions WHERE id=?').get(version.id).status,'draft');
 assert.equal(d.prepare('SELECT count(*) n FROM standard_publication_outbox').get().n,beforeOutbox);
 assert.throws(()=>applyRepair(d,success),/数据库已变化/);
 store.closeDB();
});

test('all worksheet comments require source-to-archive coverage, including sanitary notes',()=>{
 const sources=[{hash:'h',comments:[{sheetName:'卫浴',cell:'K7',author:'a',text:'盖印字变更'}]}];
 assert.throws(()=>assertSourceCoverage(sources,[],[]),/来源批注缺失/);
 assert.doesNotThrow(()=>assertSourceCoverage(sources,[{source_hash:'h',source_cell:'K7',author:'a',text:'盖印字变更'}],[]));
});
