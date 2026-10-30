import assert from 'node:assert/strict';
import {resolveProductBusinessFields,formatProductWeight} from '../src/lib/productBusinessFields.ts';
import type {ProductMaterial} from '../src/types/product.ts';
const snapshot:ProductMaterial={id:'k',number:'SP0001-A',name:'RD-T001-15',stock_id:'w1',stock_name:'成品仓',base_unit_name:'个'};
const detail:ProductMaterial={id:'k',number:'SP0001-A',name:'RD-T001-15',stock_id:'w1',min_package_qty:0,custom_field:{custom_field__1__5s8xx4pvvzzjia:'2000',custom_field__2__5ug7lp875jr2:'0.38'}};
const fields=resolveProductBusinessFields(detail,snapshot);
assert.equal(fields.packageQuantity,2000);assert.equal(fields.warehouseName,'成品仓');assert.equal(fields.weight,0.38);assert.equal(formatProductWeight(fields),'0.380 g');
assert.equal(resolveProductBusinessFields({...detail,stock_id:'w2'},snapshot).warehouseName,null);
assert.equal(resolveProductBusinessFields({...detail,stock_name:'新仓',stock_id:'w2'},snapshot).warehouseName,'新仓');
assert.equal(resolveProductBusinessFields({...detail,custom_field:{},min_package_qty:'100'},snapshot).packageQuantity,100);
assert.equal(resolveProductBusinessFields({...detail,custom_field:{},min_package_qty:0},snapshot).packageQuantity,null);
assert.equal(resolveProductBusinessFields({...detail,custom_field:{custom_field__1__5s8xx4pvvzzjia:'',custom_field__2__5ug7lp875jr2:'bad'}},snapshot).weight,null);
assert.equal(resolveProductBusinessFields(null,snapshot).warehouseName,'成品仓');
console.log('Kingdee custom package/weight and matching warehouse fallback passed');

assert.equal(resolveProductBusinessFields({...detail,stock_id:''},snapshot).warehouseName,null);
assert.equal(resolveProductBusinessFields({...detail,id:'other',stock_id:'w1'},snapshot).warehouseName,null);
