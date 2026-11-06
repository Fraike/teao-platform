import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ASSEMBLY_LINES,normalizeAssemblyLine} from '../server/shared/assembly-lines.ts';
import {previewAssemblyLineRepair,applyAssemblyLineRepair,previewAssemblyLineRollback,rollbackAssemblyLineRepair} from '../server/scripts/repair-assembly-lines.js';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'assembly-lines-'));
process.env.DATA_DIR=directory;
process.env.JWT_SECRET="assembly-tests-only-secret-longer-than-32-characters";
const store=await import('../server/services/production-store.js');store.initDB();
const db=store.getDB();
const entry=line=>({date:'2026-11-06',line,customer:'测试客户',productName:'测试商品',dailyQty:10,defects:1});

test('22 distinct choices, approved aliases and strict writes/import validation',()=>{
 assert.equal(new Set(ASSEMBLY_LINES).size,22);
 assert.deepEqual(ASSEMBLY_LINES.slice(0,3),['1#','2#','3#']);
 assert(ASSEMBLY_LINES.includes('1#')&&ASSEMBLY_LINES.includes('1#组装线'));
 for(const [from,to] of [['2#线组装','2#组装线'],['组装线','1#组装线'],['自动线','80#自动线'],['98#','98#自动线'],['12#组装线','12#']])assert.equal(normalizeAssemblyLine(from),to);
 assert.throws(()=>store.createEntry(entry('99#'),'test'),/未知装配产线/);
 const record=store.createEntry(entry('2组装线'),'test');
 assert.equal(db.prepare('SELECT line FROM assembly_records WHERE id=?').get(record.id).line,'2#组装线');
 assert.throws(()=>store.updateEntry(record.id,{line:'其他'},'test'),/未知装配产线/);
 assert.throws(()=>store.validateProductionImportRecords('assembly',[entry('未知')]),/第 1 行.*未知装配产线/);
 store.validateProductionImportRecords('injection',[{date:'2026-11-06',machine:'注塑机99',shift:'白班',productName:'商品',dailyQty:10}]);
});

test('read-only preview, verified backup, atomic audited repair and guarded rollback',async()=>{
 db.prepare('DELETE FROM assembly_records').run();
 const a=store.createEntry(entry('1#'),'test'),b=store.createEntry(entry('80#自动线'),'test');
 db.prepare('UPDATE assembly_records SET line=? WHERE id=?').run('2#线组装',a.id);
 db.prepare('UPDATE assembly_records SET line=? WHERE id=?').run('80#',b.id);
 const before=db.prepare('SELECT * FROM assembly_records ORDER BY id').all();
 const beforeAudit=db.prepare('SELECT COUNT(*) n FROM audit_log').get().n;
 let plan=previewAssemblyLineRepair(db);assert.equal(plan.affected,2);
 assert.deepEqual(db.prepare('SELECT * FROM assembly_records ORDER BY id').all(),before);
 await assert.rejects(applyAssemblyLineRepair(db,'outdated','test'),/重新预览/);
 db.exec("CREATE TRIGGER reject_line_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END");
 await assert.rejects(applyAssemblyLineRepair(db,plan.fingerprint,'repair-test'),/simulated audit failure/);
 assert.deepEqual(db.prepare('SELECT * FROM assembly_records ORDER BY id').all(),before,'审计失败时产线修改一并回滚');
 db.exec('DROP TRIGGER reject_line_audit');
 const applied=await applyAssemblyLineRepair(db,plan.fingerprint,'repair-test');
 assert(fs.existsSync(applied.backupPath));assert.equal(fs.statSync(applied.backupPath).mode&0o777,0o600);
 assert.deepEqual(db.prepare('SELECT id,line,daily_qty,defects FROM assembly_records ORDER BY id').all(),[
  {id:a.id,line:'2#组装线',daily_qty:10,defects:1},{id:b.id,line:'80#自动线',daily_qty:10,defects:1}]);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_log').get().n,beforeAudit+2);
 plan=previewAssemblyLineRepair(db);assert.equal((await applyAssemblyLineRepair(db,plan.fingerprint,'test')).affected,0);
 const manifest=JSON.parse(fs.readFileSync(applied.manifestPath));
 const rollback=previewAssemblyLineRollback(db,manifest);assert.equal(rollback.conflicts.length,0);
 db.prepare('UPDATE assembly_records SET daily_qty=11 WHERE id=?').run(a.id);
 await assert.rejects(rollbackAssemblyLineRepair(db,manifest,previewAssemblyLineRollback(db,manifest).fingerprint,'test'),/不能自动回退/);
 db.prepare('UPDATE assembly_records SET daily_qty=10 WHERE id=?').run(a.id);
 await rollbackAssemblyLineRepair(db,manifest,previewAssemblyLineRollback(db,manifest).fingerprint,'rollback-test');
 assert.deepEqual(db.prepare('SELECT line FROM assembly_records ORDER BY id').all().map(row=>row.line),['2#线组装','80#']);
 db.prepare('UPDATE assembly_records SET line=? WHERE id=?').run('未知',a.id);
 plan=previewAssemblyLineRepair(db);assert.equal(plan.unknown.length,1);
 await assert.rejects(applyAssemblyLineRepair(db,plan.fingerprint,'test'),/未知产线/);
});


test('assembly import preview reports normalization and rejects unknown lines',async()=>{
 const {previewProductionImport}=await import('../server/services/production-import.js');
 const preview=previewProductionImport('assembly',[entry('2组装线'),entry('98#')],'test');
 assert.deepEqual(preview.lineChanges,[{row:1,from:'2组装线',to:'2#组装线'},{row:2,from:'98#',to:'98#自动线'}]);
 assert.throws(()=>previewProductionImport('assembly',[entry('99#')],'test'),/第 1 行.*未知装配产线/);
});
