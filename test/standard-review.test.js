import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'standard-review-'));
const s = await import('../server/services/standard-store.js');
s.initDB();
const a = { id: 'a', name: '同名' }, b = { id: 'b', name: '同名' };
const input = { serialNo: 'SP-test', categoryKey: 'gear_damper', customer: '客户', model: 'RD-T001', fields: { torque_standard: '12-18' } };
const expected = d => ({ versionId: d.versions[0].id, revision: d.versions[0].revision });
try {
 for (const key of ['customer', 'model']) {
  for (const value of [undefined, '', '  ']) {
   assert.throws(() => s.createStandard({...input, [key]:value}, a), e => e.status === 400);
  }
 }
 assert.equal(s.listStandards().length, 0, 'invalid identity must not create a partial standard');
 let d = s.createStandard(input,a);
 for (const key of ['customer', 'model']) {
  for (const value of ['', '  ']) {
   assert.throws(() => s.updateStandard(d.id, {...expected(d), [key]: value}, a), e => e.status === 400,
    'editing must not erase required identity fields');
   assert.equal(s.getStandard(d.id).versions[0].revision, d.versions[0].revision);
  }
 }
 d = s.submitStandard(d.id,a,expected(d));
 assert.throws(()=>s.reviewStandard(d.id,{approve:true,...expected(d)},a),/自己/);
 d = s.reviewStandard(d.id,{approve:true,...expected(d)},b);
 assert.equal(s.listStandards({onlyPublished:true}).length,1);
 const prior = expected(d);
 d = s.updateStandard(d.id,{...input,fields:{torque_standard:'99-100'},...prior},a);
 assert.equal(s.listStandards({onlyPublished:true})[0].fields.torque_standard,'12-18');
 const visible = s.getStandard(d.id,{onlyPublished:true});
 assert.equal(visible.versions.length,1);
 assert(!visible.changes.some(c=>c.description.includes('99-100')));
 assert.throws(()=>s.updateStandard(d.id,{...input,...prior},b),e=>e.status===409);
 d = s.submitStandard(d.id,a,expected(d));
 const stale = expected(d);
 assert.throws(()=>s.reviewStandard(d.id,{approve:false,comment:' ',...stale},b),/意见/);
 d = s.reviewStandard(d.id,{approve:false,comment:'调整',...stale},b);
 d = s.updateStandard(d.id,{...input,...expected(d)},a);
 d = s.submitStandard(d.id,a,expected(d));
 assert.throws(()=>s.reviewStandard(d.id,{approve:true,...stale},b),e=>e.status===409);
 assert.throws(()=>s.reviewStandard(d.id,{approve:'false',...expected(d)},b),/布尔/);
 s.reviewStandard(d.id,{approve:true,...expected(d)},b);
 const p=s.previewStandardImport([{...input,serialNo:'import'}],a);
 assert(p.token);
 await assert.rejects(()=>s.confirmStandardImport([{...input,serialNo:'changed'}],a,p.token),e=>e.status===409);
 const result=await s.confirmStandardImport([{...input,serialNo:'import'}],a,p.token);
 assert.equal(result.inserted,1);
 assert(result.backupPath);
 console.log('standard review regression passed');
} finally {s.closeDB();}
