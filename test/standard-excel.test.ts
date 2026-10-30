import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { buildStandardWorkbook } from '../src/lib/standardExcel.ts';
import type { StandardPrintProduct } from '../src/types/standardPrint.ts';
const product={standard:{id:'a',serialNo:'SP-A',categoryKey:'gear_damper',sourceComments:[{versionId:'v',fieldKey:'gear_spec',fieldLabel:'齿轮规格',author:'原作者',text:'原始批注\n完整保留',sourceCell:'I7',changedAt:''}]},version:{id:'v',versionNo:2,categoryKey:'gear_damper',categoryName:'齿形阻尼器',customer:'客户',model:'RD-A',status:'published',standardType:'formal',fields:{gear_spec:'齿轮A\n齿轮B',import_note:'来源附加说明',remark:'=HYPERLINK("https://invalid")',extra:'未知属性完整值'},submittedBy:'提交人甲',reviewComment:'审核通过意见'}} as StandardPrintProduct;
test('Excel preserves every specification, audit and source comments as typed text',async()=>{
 const wb=await buildStandardWorkbook([product],[{key:'gear_damper',name:'齿形阻尼器',fields:[{key:'gear_spec',label:'齿轮规格'},{key:'remark',label:'备注'},{key:'import_note',label:'附加说明'}]}],'2026-10-19T00:00:00Z');
 const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});const parsed=XLSX.read(bytes,{type:'buffer'});
 const sheet=parsed.Sheets['齿轮阻尼器'];const rows=XLSX.utils.sheet_to_json<string[]>(sheet,{header:1});
 const all=rows.flat().join('\n');
 for(const expected of ['齿轮A\n齿轮B','来源附加说明','未知属性完整值','提交人甲','审核通过意见'])assert(all.includes(expected),expected);
 const gear=rows[0].findIndex(label=>label==='齿轮规格');assert.equal(sheet[XLSX.utils.encode_cell({r:1,c:gear})].c?.[0].t,'原始批注\n完整保留');
 const remark=rows[0].findIndex(label=>label==='备注');const cell=sheet[XLSX.utils.encode_cell({r:1,c:remark})];assert.equal(cell.t,'s');assert.equal(cell.f,undefined);assert.equal(cell.v,product.version.fields.remark);
 const notes=XLSX.utils.sheet_to_json<string[]>(parsed.Sheets['原始批注'],{header:1});assert(notes.flat().includes('原始批注\n完整保留'));
 assert.equal(sheet['!autofilter']?.ref,`A1:${XLSX.utils.encode_cell({r:1,c:rows[0].length-1})}`);
});
test('Excel creates independent category sheets, and sanitary has no unrelated identity columns',async()=>{
 const sanitary={...product,standard:{...product.standard,serialNo:'SP-G',sourceComments:[]},version:{...product.version,categoryKey:'sanitary_damper',categoryName:'智能卫浴',fields:{part_type:'盖',product_standard:'CCW25'}}};
 const wb=await buildStandardWorkbook([product,sanitary],[{key:'sanitary_damper',name:'智能卫浴',fields:[{key:'part_type',label:'产品部位'},{key:'product_standard',label:'产品标准'}]}],'2026-10-19');
 assert(wb.SheetNames.includes('齿轮阻尼器'));const rows=XLSX.utils.sheet_to_json<string[]>(wb.Sheets['马桶座盖'],{header:1});
 assert(!rows[0].includes('客户料号'));assert(!rows[0].includes('项目代号'));assert(rows[1].includes('盖'));assert(rows[1].includes('CCW25'));
});
test('long source comments are split losslessly within Excel cell limits',async()=>{
 const text='长批注😀'.repeat(9000);
 const source={...product,standard:{...product.standard,sourceComments:[{...product.standard.sourceComments![0],text}]}};
 const wb=await buildStandardWorkbook([source],[],'2026-10-19');
 const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});const parsed=XLSX.read(bytes,{type:'buffer'});
 const rows=XLSX.utils.sheet_to_json<string[]>(parsed.Sheets['原始批注'],{header:1});const column=rows[0].indexOf('批注内容');
 assert(rows.slice(1).every(row=>row[column].length<=30000));assert.equal(rows.slice(1).map(row=>row[column]).join(''),text);
});
