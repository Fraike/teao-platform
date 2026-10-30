import assert from 'node:assert/strict';
import { filterProductArchives, productInCategory, safeProductListReturn } from '../src/lib/productCategoryFilters.ts';
import {usesGearDrawingStructure} from '../src/lib/productDrawingPresentation.ts';
import { buildProductCategoryTree, indexProductCategories, PRODUCT_CATEGORY_IDS as ids } from '../server/shared/product-classification.ts';
import type { ProductArchive } from '../src/types/product.ts';
const product=(id:string,categoryId:string,group:ProductArchive['group'],count=0):ProductArchive=>({id,internalNumber:id,kingdeeId:id,name:id,model:'',category:group,categoryId,group,unit:'个',material:null,kingdeeMissing:false,standards:[],issues:[],drawingCount:count,productionAvailable:true});
const rows=[product('gear',ids.gear,'finished'),product('barrel',ids.barrel,'finished',1),product('semi',ids.plastic,'semi')];
assert(usesGearDrawingStructure(rows[0]));
assert(!usesGearDrawingStructure({...rows[1],category:'齿轮阻尼器'}),'Kingdee category ID takes precedence over display name');
assert(!usesGearDrawingStructure(rows[2]));
assert(usesGearDrawingStructure({...rows[0],categoryId:'',category:'齿形阻尼器'}));
assert(!usesGearDrawingStructure({...rows[0],categoryId:'',category:'齿条阻尼器'}));
const tree=buildProductCategoryTree([]), index=indexProductCategories(tree);
assert(productInCategory(rows[0],ids.finished,index));assert(!productInCategory(rows[2],ids.finished,index));
assert.deepEqual(filterProductArchives(rows,{search:'',scope:'missing'}).map(p=>p.id),['gear']);
assert.deepEqual(filterProductArchives(rows,{search:'semi',scope:'all'}).map(p=>p.id),['semi']);
assert.equal(safeProductListReturn('/materials?category=x&q=客户&page=2'),'/materials?category=x&q=客户&page=2');
assert.equal(safeProductListReturn('/product-standards'),'/product-standards');
assert.equal(safeProductListReturn('/product-standards?category=gear_damper'),'/product-standards?category=gear_damper');
for(const value of ['https://example.com','//example.com/materials','/materials/123','/admin'])assert.equal(safeProductListReturn(value),'/materials');
console.log('product category filter tests passed');

const standard = {id:'s1',serialNo:'UNLINKED',customer:'甲',customerPartNo:'',model:'T001',categoryKey:'gear_damper',categoryName:'齿轮阻尼器',versionNo:1,fields:{}};
const queue = [
 {...rows[0],id:'never-linked',kingdeeId:null,standards:[standard, {...standard,id:'s2',customer:'乙'}]},
 {...rows[1],id:'no-longer-returned',kingdeeMissing:true,standards:[standard]},
 {...rows[0],id:'normal',standards:[standard]},
 {...rows[0],id:'history',kingdeeId:null,productionAvailable:false},
 {...rows[0],id:'missing-history',kingdeeMissing:true,productionAvailable:false},
 {...rows[0],id:'conflict',kingdeeId:null,standards:[standard],productionAvailable:false,issues:['关联冲突']},
];
assert.deepEqual(filterProductArchives(queue,{search:'',scope:'unlinked'}).map(p=>p.id),['never-linked','no-longer-returned','conflict']);
assert.deepEqual(filterProductArchives(queue,{search:'barrel',scope:'unlinked'}).map(p=>p.id),['no-longer-returned']);
