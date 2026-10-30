import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProductCatalog} from '../server/services/product-catalog.ts';
import {selectProductionDrawings} from '../server/shared/product-drawing-selection.ts';
import {createProductDrawings} from '../server/services/product-drawings.ts';
import {productDrawingStatuses} from '../server/services/product-drawing-status.ts';

const store=createProductCatalog(mkdtempSync(path.join(os.tmpdir(),'drawing-applicability-')));
const refs=['B','C'].map(id=>({id,serialNo:'SP1',customer:id,customerPartNo:'',model:'M',categoryKey:'gear_damper',categoryName:'齿轮',versionNo:1,fields:{}}));
try {
 store.applySnapshot([{id:'kd1',number:'SP1',name:'Product'}],[]);
 const product=store.list(refs)[0];
 const insert=store.db.prepare(`INSERT INTO product_files(id,product_id,drawing_no,version,filename,kind,standard_ids,scope_key,status,size,sha256,uploaded_by,uploaded_at) VALUES(?,?,?,'A','d.pdf',?,?,?, ?,1,'hash','test','today')`);
 function check(ids:string[],status:string,kind:string,count:number,badges:boolean[]) {
  const id=String((store.db.prepare('SELECT count(*) n FROM product_files').get() as {n:number}).n);
  insert.run(id,product.id,id,kind,JSON.stringify(ids),id,status);
  const products=store.list(refs);
  assert.equal(products[0].drawingCount,count,`${status} ${kind} ${JSON.stringify(ids)} aggregate`);
  const drawings=createProductDrawings(store).list(products[0].id,{id:'test',name:'Test',role:'admin',permissions:[]});
  assert.deepEqual(['','A','B','C'].map(standardId=>selectProductionDrawings(drawings,standardId,products[0]).length>0),badges);
  assert.deepEqual(productDrawingStatuses(store,products,['','A','B','C'].map(standardId=>({number:'SP1',standardId}))).map(s=>s.hasDrawing),badges);
 }
 check(['A'],'published','pdf',0,[false,false,false,false]);
 check(['B'],'draft','pdf',0,[false,false,false,false]);
 check(['B'],'retired','pdf',0,[false,false,false,false]);
 check(['B'],'published','step',0,[false,false,false,false]);
 check(['B'],'published','pdf',1,[false,false,true,false]);
 check(['A','C'],'published','pdf',2,[false,false,true,true]);
 check(['A','retired'],'published','pdf',2,[false,false,true,true]);
 check([],'published','pdf',3,[true,true,true,true]);
 assert.equal(store.list([])[0].drawingCount,1,'only common remains when all references retire');
 console.log('drawing applicability counts only common or current customer PDF scopes and keeps badges scoped');
} finally {store.close();}
