import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {createProductCatalog} from '../server/services/product-catalog.ts';
import {createProductDrawings} from '../server/services/product-drawings.ts';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const {PDFDocument,degrees}=require('pdf-lib');
const store=createProductCatalog(mkdtempSync(path.join(os.tmpdir(),'landscape-pdf-')));
store.applySnapshot([{id:'k1',number:'P1',name:'产品'}],[]);const product=store.list([])[0];
const drawings=createProductDrawings(store),actor={id:'e',name:'工程',role:'admin',permissions:[]};
let sequence=0;
const upload=async(sizes:number[][],rotation=0,crop?:number[])=>{
 const pdf=await PDFDocument.create();
 for(const size of sizes){const page=pdf.addPage(size);page.setRotation(degrees(rotation));if(crop)page.setCropBox(...crop);}
 return drawings.upload(product,{drawingNo:`D${++sequence}`,version:'A1',filename:'drawing.pdf',kind:'pdf',standardIds:[]},Buffer.from(await pdf.save()),actor);
};
try {
 await assert.rejects(()=>upload([[595,842]]),/第.*1.*页.*横向/);
 await assert.rejects(()=>upload([[842,595],[595,842]]),/第.*2.*页.*横向/);
 await assert.rejects(()=>upload([[600,600]]),/横向/);
 await upload([[842,595]]);
 await upload([[595,842]],270);
 await assert.rejects(()=>upload([[842,595]],90),/横向/);
 await assert.rejects(()=>upload([[842,595]],0,[0,0,300,500]),/横向/);
 await assert.rejects(()=>drawings.upload(product,{drawingNo:'SOURCE',version:'A1',filename:'x.dwg',kind:'source',standardIds:[]},Buffer.from('CAD'),actor),/仅支持PDF/);
 assert.equal(drawings.list(product.id,actor).length,2,'rejected uploads must not create file records');
 console.log('PDF-only and every visible page landscape checks passed, including page rotation and cropping');
}finally{store.close();}
