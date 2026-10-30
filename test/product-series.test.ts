import assert from 'node:assert/strict';
import { identifyProductSeries, groupProductSeries } from '../src/lib/productSeries.ts';
import type { ProductArchive } from '../src/types/product.ts';
const p = (name: string, id=name): ProductArchive => ({id,internalNumber:id,name,model:'12-18',categoryId:'gear',category:'齿轮',group:'finished',kingdeeId:id,material:null,unit:'',standards:[],issues:[],drawingCount:0,productionAvailable:true});
for (const [name, expected] of [['RD-T001-15','T001'],['RD-V109-0.5','V109'],['RD-T010A-80','T010A'],['RD-V112-25-CW','V112-CW'],['RD-V112-25-CCW','V112-CCW'],['RD-10右','10右']]) assert.equal(identifyProductSeries(p(name)).name,expected);
assert(identifyProductSeries(p('EAE0-042017-1000')).pending);
const standardOnly={...p('未命名'),kingdeeId:null,standards:['RD-T001-80','RD-T001-15'].map(model=>({id:model,serialNo:'SP',model,customer:'',customerPartNo:'',categoryKey:'gear_damper',categoryName:'齿轮',versionNo:1,fields:{}}))} as ProductArchive;
assert.equal(identifyProductSeries(standardOnly).name,'T001');
assert(identifyProductSeries({...standardOnly,standards:[{model:'RD-T001-15'},{model:'RD-T002-30'}]} as ProductArchive).pending);
const rows=[p('RD-T001-15'),p('RD-T001-80'),p('RD-T001-15'),{...p('RD-T001-15','other'),categoryId:'barrel'}];
assert.equal(groupProductSeries(rows).length,2);
assert.equal(groupProductSeries(rows).find(g=>g.key==='gear:T001')!.products.length,2);
assert.equal(groupProductSeries([...rows,p('RD-T001-120')]).find(g=>g.key==='gear:T001')!.models.length,3);
assert.equal(groupProductSeries([...rows,p('RD-T999-10')]).length,3);
console.log('product series grouping passed');
const { SERIES_CATEGORY_IDS, productSpecification } = await import('../src/lib/productSeries.ts');
assert.equal(SERIES_CATEGORY_IDS.length,4);
for (const categoryId of SERIES_CATEGORY_IDS) {
 const group=groupProductSeries([{...p('RD-T001-15'),categoryId},{...p('RD-T001-80'),categoryId}]);
 assert.equal(group.length,1);assert.equal(group[0].name,'T001');
}
assert.equal(productSpecification({...standardOnly, standards:[{...standardOnly.standards[0],fields:{test_standard:'实际范围'}}]}),'实际范围');
assert.equal(productSpecification({...standardOnly,standards:[]}), '未维护');
const { filterProductArchives } = await import('../src/lib/productCategoryFilters.ts');
assert.equal(filterProductArchives([standardOnly],{search:'RD-T001-80',scope:'all'}).length,1);
assert.equal(filterProductArchives([standardOnly],{search:'T001',scope:'all'}).length,1);
assert.equal(groupProductSeries(filterProductArchives([p('RD-T001-15'),{...p('RD-T001-80'),drawingCount:1}],{search:'',scope:'missing'}))[0].products.length,1);
assert.deepEqual(groupProductSeries(['RD-V109-1.0','RD-T010A-80','RD-T002-20','RD-T0012-50','RD-T010-40','RD-T001-15','特殊商品'].map(name=>p(name))).map(g=>g.name), ['T001','T002','T010','T010A','T0012','V109','特殊商品']);
assert.deepEqual(groupProductSeries([p('RD-T001-100'),p('RD-T001-15'),p('RD-T001-80')])[0].products.map(p=>p.name),['RD-T001-15','RD-T001-80','RD-T001-100']);
