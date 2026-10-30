import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
import { createProductCatalog } from '../server/services/product-catalog.ts';
import { PRODUCT_CATEGORY_IDS as ids, STANDARD_CATEGORY_NAMES, buildProductCategoryTree, countProductCategories } from '../server/shared/product-classification.ts';
const store=createProductCatalog(mkdtempSync(path.join(os.tmpdir(),'product-categories-')));
const ref=(id:string,key:string,name:string)=>({id,serialNo:id,customer:'客户',customerPartNo:'',model:'M',categoryKey:key,categoryName:name,versionNo:1,fields:{}});
const refs=[ref('standard-gear','gear_damper','齿形阻尼器'),ref('unresolved-lock','lock_sync','锁类·同步器'),ref('standard-barrel','barrel_damper','筒型阻尼器')];
try{
 const taxonomy=buildProductCategoryTree([]);
 store.reconcileStandards(refs);
 store.applySnapshot([
  {id:'k1',number:'gear',name:'成品',parent_id:ids.gear,parent_name:'齿轮阻尼器'},
  {id:'k2',number:'semi',name:'配件',parent_id:ids.plastic,parent_name:'塑胶配件'},
  {id:'k3',number:'wrong-name',name:'以ID为准',parent_id:ids.gear,parent_name:'齿形阻尼器'},
  {id:'k4',number:'no-category',name:'无分类',parent_name:'齿轮阻尼器'},
  {id:'k5',number:'direct-root',name:'直接挂成品',parent_id:ids.finished,parent_name:'成品'},
 ],[]);
 const products=store.list(refs),get=(number:string)=>products.find(p=>p.internalNumber===number)!;
 assert.equal(get('standard-gear').categoryId,ids.gear);assert.equal(get('standard-gear').category,'齿轮阻尼器');
 assert.equal(get('gear').categoryId,get('standard-gear').categoryId);
 assert.equal(get('wrong-name').category,'齿轮阻尼器');assert.equal(get('semi').group,'semi');
 assert.equal(get('unresolved-lock').group,'finished');assert.equal(get('unresolved-lock').categoryId,'finished:pending');
 assert.equal(get('standard-barrel').category,'圆筒阻尼器');assert.equal(get('no-category').group,'unclassified');
 assert.equal(get('direct-root').group,'finished');assert.equal(get('direct-root').categoryId,ids.finished);
 const counted=countProductCategories(taxonomy,products),gear=counted.flatMap(n=>n.children||[]).find(n=>n.id===ids.gear)!;
 assert.equal(countProductCategories(taxonomy,[...products,...products])[0].count,counted[0].count);assert.equal(gear.count,3);assert.equal(counted.find(n=>n.id===ids.finished)!.count,6);
 const customized=buildProductCategoryTree([{id:ids.finished,name:'成品',children:[{id:ids.gear,name:'金蝶齿轮分类新名'}]}]);
 assert.equal(customized[0].children![0].name,'金蝶齿轮分类新名');
 assert.equal(STANDARD_CATEGORY_NAMES.lock_sync,'其他锁扣.铰链 / 同步器');
 console.log('product classification tests passed');
}finally{store.close();}
