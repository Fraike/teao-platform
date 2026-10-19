import assert from 'node:assert/strict';
import test from 'node:test';
import type { StandardDetail, StandardListItem, StandardVersion } from '../src/types/standard.ts';
import { buildStandardPrintHtml, loadStandardPrintProducts } from '../src/lib/standardPrint.ts';
const version={id:'v',versionNo:1,status:'pending_review',categoryKey:'sanitary_damper',categoryName:'智能卫浴',customer:'客户<script>alert(1)</script>',model:'RD-V088',fields:{part_type:'盖',product_standard:'CCW25',unknown_extra:'完整额外字段\n第二行'},standardType:'formal',updatedAt:'2026-10-19',updatedBy:'工程',createdBy:'甲'} as StandardVersion;
const detail={id:'s',serialNo:'SP001-G',categoryKey:'sanitary_damper',categoryName:'智能卫浴',versions:[version],sourceComments:[{versionId:'v',fieldLabel:'标准',text:'原表批注<b>不执行</b>',author:'作者'}],changes:[]} as StandardDetail;
const row={id:'s',serialNo:detail.serialNo,versionNo:1,status:'pending_review'} as StandardListItem;
test('print retains complete values, correct category fields and safe text, with unapproved warning',()=>{
 const html=buildStandardPrintHtml([{standard:detail,version}], [{key:'sanitary_damper',name:'智能卫浴',fields:[{key:'part_type',label:'产品部位'},{key:'product_standard',label:'产品标准'}]}],{generatedAt:'2026-10-19T00:00:00Z',styleUrl:'/print.css'});
 for(const value of ['产品部位','盖','CCW25','待审核','尚未生效','SP001-G','V1','打印 / 保存 PDF'])assert(html.includes(value),value);
 for(const hidden of ['审核与更新记录','审核意见','提交人','原始批注','原表批注','完整额外字段'])assert(!html.includes(hidden),hidden);
 assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(!html.includes('<b>不执行</b>'));
 assert(!html.includes('客户料号'));assert(!html.includes('项目代号'));
});
test('bounded detail fetching preserves selection order and rejects changed or missing versions',async()=>{
 const controller=new AbortController();let active=0,max=0;
 const rows=Array.from({length:13},(_,i)=>({...row,id:String(i)}));
 const products=await loadStandardPrintProducts(rows,async(id)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return {...detail,id};},controller.signal);
 assert.equal(products.length,13);assert(max<=4);assert.deepEqual(products.map(p=>p.standard.id),rows.map(r=>r.id));
 await assert.rejects(loadStandardPrintProducts([row],async()=>({...detail,versions:[{...version,versionNo:2}]}),controller.signal),/已变化/);
 controller.abort();let reads=0;await assert.rejects(loadStandardPrintProducts(rows,async()=>{reads++;return detail;},controller.signal),{name:'AbortError'});assert.equal(reads,0);
});
