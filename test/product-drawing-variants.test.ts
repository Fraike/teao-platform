import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {createProductCatalog} from '../server/services/product-catalog.ts';import {createProductDrawings,selectProductionDrawings} from '../server/services/product-drawings.ts';
const require=createRequire(new URL('../server/package.json',import.meta.url));const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([842,595]);const bytes=Buffer.from(await pdf.save());
const store=createProductCatalog(mkdtempSync(path.join(os.tmpdir(),'drawing-variants-'))),user={id:'a',name:'工程',role:'admin',permissions:[]};
const refs=[{id:'s',serialNo:'SP1',model:'T001',customer:'客户',customerPartNo:'',categoryKey:'gear_damper',categoryName:'齿轮',versionNo:1,fields:{gear_spec:'不装齿轮'}}];store.reconcileStandards(refs);const product=store.list(refs)[0],drawings=createProductDrawings(store);
try{
 const input={drawingNo:'D',version:'A1',filename:'drawing.pdf',kind:'pdf' as const,standardIds:[]};
 const geared=await drawings.upload(product,{...input,structure:'geared',role:'primary'},bytes,user);drawings.publish(product,geared.id,user);
 const none=await drawings.upload(product,{...input,structure:'gearless',role:'supplement'},bytes,user);drawings.publish(product,none.id,user);
 assert.equal(drawings.list(product.id,user).filter(d=>d.status==='published').length,2);
 assert.equal(selectProductionDrawings(drawings.list(product.id,user),'s',product)[0].id,none.id);
 const newer=await drawings.upload(product,{...input,version:'A2',structure:'geared'},bytes,user);drawings.publish(product,newer.id,user);
 assert.equal(drawings.read(product.id,geared.id,user).file.status,'retired');assert.equal(drawings.read(product.id,none.id,user).file.status,'published');
 await assert.rejects(()=>drawings.upload(product,{...input,structure:'bad' as 'geared'},bytes,user),/结构/);
 const old=store.db.prepare('SELECT id,sha256,version FROM product_files ORDER BY id').all();store.close();const reopened=createProductCatalog(store.directory);assert.deepEqual(reopened.db.prepare('SELECT id,sha256,version FROM product_files ORDER BY id').all(),old);reopened.close();
 console.log('same-number same-version variants coexist; versions only supersede matching structure');
}catch(error){try{store.close();}catch{/* already closed */}throw error;}
