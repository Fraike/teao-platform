import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {createProductCatalog} from '../server/services/product-catalog.ts';
import {createProductDrawings} from '../server/services/product-drawings.ts';
import {createProductImports} from '../server/services/product-imports.ts';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const Database=require('better-sqlite3');
const oldDirectory=mkdtempSync(path.join(os.tmpdir(),'legacy-batches-'));const oldDb=new Database(path.join(oldDirectory,'products.db'));
oldDb.exec("CREATE TABLE product_import_batches(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL); INSERT INTO product_import_batches VALUES('old','Old','2026','admin')");oldDb.close();
const migrated=createProductCatalog(oldDirectory);
assert.equal(migrated.db.prepare('PRAGMA table_info(product_import_batches)').all().length,4);
migrated.db.prepare('INSERT INTO product_import_batches VALUES(?,?,?,?)').run('rollback-created','旧代码新增','2026','admin');
migrated.close();
const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([842,595]);const bytes=Buffer.from(await pdf.save());
const directory=mkdtempSync(path.join(os.tmpdir(),'semi-imports-'));let store=createProductCatalog(directory);
const admin={id:'a',name:'工程',role:'admin',permissions:[]};
store.applySnapshot([{id:'s',number:'S1',parent_id:'2314559979366968320',name:'T001-齿轮-POM 9044'},{id:'s2',number:'S2',parent_id:'2314559979366968320',name:'T002-齿轮-POM 9044'},{id:'s3',number:'S3',parent_id:'2314559979366968320',name:'T003-齿轮-POM 9044'},{id:'s8',number:'S8',parent_id:'2314559979366968320',name:'RD-08-齿轮-POM 9044',model:'8圈'},{id:'f',number:'F1',parent_id:'2342097486262423552',name:'RD-T001-15'},{id:'o',number:'O1',parent_id:'unmanaged',name:'T001-齿轮'},{id:'ring',number:'RING1',parent_id:'2314560770664341504',name:'RD-T001-胶圈-2.65x0.65'}],[]);
const products=()=>store.list([]),drawings=createProductDrawings(store),imports=createProductImports(store,drawings,products);
try{
 const finished=imports.create('旧兼容',admin);assert.equal(finished.kind,'finished');
 const batch=imports.create('半成品',admin,'semi-parts');assert.equal(batch.kind,'semi-parts');
 assert.throws(()=>imports.create('bad',admin,'bad' as 'finished'),/类型/);
 const item=await imports.scan(batch.id,'RD-T001/子件图/T001-齿轮-POM.pdf',bytes,admin);
 assert.deepEqual(item.candidates.map(c=>c.internalNumber),['S1']);assert.equal(item.candidates[0].standardIds.length,0);assert.match(item.candidates[0].differences!.join(' '),/POM 9044/);
 assert.equal(drawings.list(products().find(p=>p.internalNumber==='S1')!.id,admin).length,0);
 const misplaced=await imports.scan(batch.id,'RD-T001/子件图/RD-T001-成品图.pdf',bytes,admin);
 assert.equal(misplaced.candidates.length,0);assert.match(misplaced.hints.join(' '),/成品|部件/);
 await assert.rejects(()=>imports.scan(batch.id,'RD-T001/成品图/T001.pdf',bytes,admin),/子件/);
 await assert.rejects(()=>imports.scan(finished.id,item.sourcePath,bytes,admin),/成品/);
 const ring=await imports.scan(batch.id,'RD-T001/子件图/RD-T001-胶圈.pdf',bytes,admin);assert.deepEqual(ring.candidates.map(candidate=>candidate.internalNumber),['RING1']);
 const semi=products().find(p=>p.internalNumber==='S1')!,full=products().find(p=>p.internalNumber==='F1')!;
 const decision={entryId:item.id,drawingNo:'T001',version:'A',targets:[{productId:semi.id,standardIds:[]}]};
 await assert.rejects(()=>imports.confirm(batch.id,{...decision,targets:[{productId:full.id,standardIds:[]}]},admin),/失效/);
 await assert.rejects(()=>drawings.upload({...semi,standards:full.standards},{drawingNo:'X',version:'A',filename:'x.pdf',kind:'pdf',standardIds:['s']},bytes,admin),/半成品/);
 const draft=await drawings.upload(semi,{drawingNo:'LEGACY',version:'A',filename:'old.pdf',kind:'pdf',standardIds:[]},bytes,admin);
 store.db.prepare('UPDATE product_files SET standard_ids=? WHERE id=?').run(JSON.stringify(['legacy']),draft.id);assert.throws(()=>drawings.publish(semi,draft.id,admin),/半成品/);
 const textPdf=await PDFDocument.create();textPdf.addPage([842,595]).drawText('POM');const textItem=await imports.scan(batch.id,'RD-T001/子件图/T001-齿轮.pdf',Buffer.from(await textPdf.save()),admin);assert.match(textItem.pdfText!,/POM/);assert.match(textItem.candidates[0].differences!.join(' '),/9044/);
 const withText=(text:string)=>{
  store.db.prepare('UPDATE product_import_entries SET data=? WHERE id=?').run(JSON.stringify({...textItem,pdfText:text}),textItem.id);
  return imports.view(batch.id,admin).entries.find(e=>e.id===textItem.id)!;
 };
 for(const clue of ['RD-T001/T002/T003共用','共用以下型号：RD-T001/T002/T003']){
  assert.deepEqual(withText(clue).candidates.map(c=>c.internalNumber),['S1','S2','S3']);
 }
 assert.deepEqual(withText('与RD-08共用').candidates.map(c=>c.internalNumber),['S1','S8']);
 assert.deepEqual(withText('RD03/08共用').sharedSeries,['T001','RD-03','RD-08']);
 assert.deepEqual(withText('尺寸08 数量3 圈数8 普通备注RD-T002').candidates.map(c=>c.internalNumber),['S1']);
 for(const clue of ['RED-T002共用','不适用RD-T002','RD-T002不共用','禁止与RD-T002共用']){
  assert.deepEqual(withText(clue).candidates.map(c=>c.internalNumber),['S1']);
 }
 assert.equal(withText('图纸名称：总装\n部件：齿轮 POM').candidates.length,0);
 const cavity=withText('与RD-08共用 材料：POM 日期2026 模穴：8');
 assert.match(cavity.candidates.find(c=>c.internalNumber==='S8')!.differences!.join(' '),/金蝶规格 未明确标注模穴/);
 assert.doesNotMatch(cavity.candidates[0].differences!.join(' '),/POM 日期/);
 const result=await imports.confirm(batch.id,decision,admin);assert.equal(result.status,'imported');assert.equal(result.links.length,1);
 assert.equal((await imports.confirm(batch.id,decision,admin)).links.length,1);
 await assert.rejects(()=>imports.confirm(finished.id,decision,admin),/不存在/);
 store.close();store=createProductCatalog(directory);assert.equal(store.db.prepare('SELECT kind FROM product_import_batch_types WHERE batch_id=?').get(batch.id)?.kind,'semi-parts');
 assert.equal(store.db.prepare('PRAGMA table_info(product_import_batches)').all().length,4);
 console.log('semi batch isolation, candidate staging, empty standards and confirmed idempotent import passed');
}finally{store.close();}
