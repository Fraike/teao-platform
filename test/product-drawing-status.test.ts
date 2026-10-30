import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {createProductCatalog} from '../server/services/product-catalog.ts';import {createProductDrawings} from '../server/services/product-drawings.ts';import {productDrawingStatuses} from '../server/services/product-drawing-status.ts';
const require=createRequire(new URL('../server/package.json',import.meta.url));const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([842,595]);const bytes=Buffer.from(await pdf.save());
const store=createProductCatalog(mkdtempSync(path.join(os.tmpdir(),'drawing-status-')));const actor={id:'a',name:'管理',role:'admin',permissions:[]};
const refs=['s1','s2'].map(id=>({id,serialNo:'SP1',customer:id,customerPartNo:'',model:'M',categoryKey:'gear_damper',categoryName:'齿轮',versionNo:1,fields:{}}));store.reconcileStandards(refs);const products=store.list(refs),p=products[0],drawings=createProductDrawings(store);const items=refs.map(r=>({number:'SP1',standardId:r.id}));
try{
 const file=await drawings.upload(p,{drawingNo:'D',version:'A',filename:'d.pdf',kind:'pdf',standardIds:['s1']},bytes,actor);
 assert.deepEqual(productDrawingStatuses(store,products,items).map(s=>s.hasDrawing),[false,false]);drawings.publish(p,file.id,actor);
 assert.deepEqual(productDrawingStatuses(store,products,items).map(s=>s.hasDrawing),[true,false]);drawings.retire(p,file.id,actor);
 assert.deepEqual(productDrawingStatuses(store,products,items).map(s=>s.hasDrawing),[false,false]);
 const common=await drawings.upload(p,{drawingNo:'G',version:'A',filename:'g.pdf',kind:'pdf',standardIds:[]},bytes,actor);drawings.publish(p,common.id,actor);assert.deepEqual(productDrawingStatuses(store,products,items).map(s=>s.hasDrawing),[true,true]);
 console.log('drawing status respects customer scope, drafts, retire and common drawing');
}finally{store.close();}
