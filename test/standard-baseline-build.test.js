import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { materializeBaseline, verifyBaselineDatabase } from '../server/services/standard-baseline-build.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teao-baseline-build-'));
  const records = [{serialNo:'SP0006-C',customer:'常州新泉▲',model:'RD-V128-170',customerPartNo:'2010.0431.0805',vehicleModel:'',
    categoryKey:'rack_damper',standardType:'formal',initialStatus:'published',fields:{test_standard:'120-160',winter_test_standard:'100-140'},
    sourceHash:'a'.repeat(64),sourceSheet:'原表',sourceRow:490,comments:[
      {cell:'F490',fieldKey:'test_standard',fieldLabel:'测试标准',author:'Mike',text:'Mike:\n2025.1.2夏季120-160\n2026.10.15冬季100-140',changedAt:'2025-01-02'},
      {cell:'J490',fieldKey:'remark',fieldLabel:'备注',author:'Administrator',text:'Administrator:\n',changedAt:''},
    ]}];
  return {root,records,database:path.join(root,'new','standards.db')};
}

test('isolated baseline retains all raw notes, splits history, never fabricates approvals or publication jobs', () => {
  const f=fixture();
  const result=materializeBaseline(f.records,f.database,{createdAt:'2026-10-19T00:00:00.000Z',tableNotes:[{cell:'K1',text:'表级备注'}]});
  assert.equal(result.records,1); assert.equal(result.comments,2); assert.equal(result.sourceHistory,2);
  const db=new DatabaseSync(f.database,{readOnly:true});
  try {
    const version=db.prepare('SELECT * FROM product_standard_versions').get();
    assert.equal(version.reviewed_by,''); assert.equal(version.submitted_by_id,''); assert.equal(version.assigned_reviewer_id,'');
    assert.equal(db.prepare('SELECT count(*) n FROM standard_publication_outbox').get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM standard_review_reminders').get().n,0);
    const history=db.prepare("SELECT * FROM product_standard_changes WHERE source_cell!='' ORDER BY seq").all();
    assert.deepEqual(history.map(r=>[r.changed_at,r.description]),[['2025-01-02','夏季120-160'],['2026-10-15','冬季100-140']]);
    assert.equal(db.prepare('SELECT count(*) n FROM product_standard_excel_comments').get().n,2);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode,'delete');
  } finally { db.close(); }
  assert.equal(verifyBaselineDatabase(f.database,f.records).records,1);
  assert.throws(()=>materializeBaseline(f.records,f.database),/存在|覆盖/);
});

test('read-back validates every field and archived comment rather than just counts', () => {
  const f=fixture();materializeBaseline(f.records,f.database);
  const db=new DatabaseSync(f.database);
  db.prepare("UPDATE product_standard_versions SET fields='{}'").run();db.close();
  assert.throws(()=>verifyBaselineDatabase(f.database,f.records),/字段|规格|匹配/);
});

test('read-back also verifies the standard master row and original comment text',()=>{
  const f=fixture();materializeBaseline(f.records,f.database);
  const db=new DatabaseSync(f.database);
  try{
    db.exec("UPDATE product_standards SET serial_no='WRONG'");
    assert.throws(()=>verifyBaselineDatabase(f.database,f.records),/主记录|字段/);
    db.prepare('UPDATE product_standards SET serial_no=?').run(f.records[0].serialNo);
    db.exec("UPDATE product_standard_excel_comments SET text='truncated' WHERE source_cell='F490'");
    assert.throws(()=>verifyBaselineDatabase(f.database,f.records),/批注/);
  }finally{db.close();}
});

test('initialization rejects duplicate identities and working statuses before making files', () => {
  const f=fixture();
  assert.throws(()=>materializeBaseline([...f.records,...f.records],f.database),/重复/);
  assert.equal(fs.existsSync(f.database),false);
  assert.throws(()=>materializeBaseline([{...f.records[0],initialStatus:'pending_review'}],f.database),/状态/);
  assert.equal(fs.existsSync(f.database),false);
});
