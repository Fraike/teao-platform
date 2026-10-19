import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../server/services/standard-baseline-policy.js';
import { formalMainSource, formalSanitarySource } from './fixtures/standard-source.ts';

const MAIN='b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0';
const SANITARY='78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f';
const counts={gear_damper:345,barrel_damper:129,rack_damper:34,lock_sync:113,air_pull_cord:111,air_pull_handle:32,sanitary_damper:45};
const approvals=[['SP0009-G',7,'盖'],['SP0010-G',7,'座'],['SP0024-G',8,'盖'],['SP0025-G',8,'座'],['SP0011-G',9,'盖'],['SP0012-G',9,'座']];
function fixture() {
 const records=Object.entries(counts).flatMap(([categoryKey,count])=>Array.from({length:count},(_,i)=>({
  serialNo:`TEST-${categoryKey}-${i}`,customer:'客户',model:'RD-TEST',categoryKey,standardType:'formal',
  sourceHash:categoryKey==='sanitary_damper'?SANITARY:MAIN,
  sourceSheet:categoryKey==='sanitary_damper'?'客户阻力值标准一览表（智能卫浴':'客户阻力值标准一览表-最新',
  sourceRow:i+15,fields:categoryKey==='sanitary_damper'?{part_type:i<25?'盖':'座'}:{},comments:[],
 })));
 records.slice(1,69).forEach(r=>r.standardType='new_pending');
 records.slice(69,80).forEach(r=>r.standardType='temporary');
 Object.assign(records[0],{serialNo:'SP0103-A',customer:'芜湖中生▲',model:'RD-T020-800',sourceRow:196,fields:{import_note:'此行作废\n放筒型阻尼器行内'}});
 Object.assign(records.find(r=>r.categoryKey==='rack_damper'),{serialNo:'SP0006-C',customer:'常州新泉▲',model:'RD-V128-170',customerPartNo:'2010.0431.0805',sourceRow:490,
  fields:{test_standard:'100-140',torque_standard:'120-160'},comments:[{cell:'F490',fieldKey:'test_standard',fieldLabel:'测试范围',author:'asus',changedAt:'2022-07-09',
   text:'2022.7.09原始标准\n2022.10.05调整\n2023.1.10调整\n2023.2.10调整\n2024.1.2调整\n2024.6.19调整\n2024.11.23调整\n2024.12.13调整\n2025.2.18夏季120-160\n2025.11.01冬季100-140\n2026.10.15扭矩120-160改为100-140冬季标准'}]});
 const sanitary=records.filter(r=>r.categoryKey==='sanitary_damper');
 // Preserve 25 lids / 20 seats while assigning the six individually approved identities.
 const picked=[sanitary[0],sanitary[25],sanitary[1],sanitary[26],sanitary[2],sanitary[27]];
 approvals.forEach(([serialNo,sourceRow,part],i)=>Object.assign(picked[i],{serialNo,sourceRow,customer:'欧陆',model:'RD-V088',fields:{part_type:part}}));
 return records;
}
const seasonal=rows=>rows.find(r=>r.serialNo==='SP0006-C');

test('approved baseline is deeply cloned, normalized, published and carries raw seasonal evidence',()=>{
 const input=fixture();input[100].customer='利民FS11-A2▲';input[100].fields.marking='FS11-A2';
 const before=structuredClone(input);const result=policy.applyBaselinePolicy(input);
 assert.deepEqual(input,before);
 assert.equal(result.records.length,809);
 assert.equal(result.records.filter(r=>r.initialStatus==='published').length,808);
 assert.equal(result.records.filter(r=>r.initialStatus==='obsolete').length,1);
 assert.equal(result.records.filter(r=>r.standardType==='new_pending'&&r.initialStatus==='published').length,68);
 assert.equal(result.records[100].customer,'利民▲');assert.equal(result.records[100].vehicleModel,'FS11-A2');
 const transformed=seasonal(result.records);
 assert.deepEqual(transformed.fields,{test_standard:'120-160',torque_standard:'120-160',winter_test_standard:'100-140'});
 assert.deepEqual(transformed.comments,seasonal(input).comments);
 assert.equal(result.transformations.length,1);
 const evidence=result.transformations[0];
 assert.equal(evidence.sourceHash,MAIN);assert.equal(evidence.sourceRow,490);assert.equal(evidence.sourceCell,'F490');
 assert.equal(evidence.before.test_standard,'100-140');assert.equal(evidence.after.test_standard,'120-160');
 assert.deepEqual(evidence.comments,seasonal(input).comments);
 transformed.comments[0].text='changed';evidence.comments[0].text='changed evidence';
 assert.deepEqual(input,before);
});

const invalids={
 'wrong count':rows=>rows.pop(),
 'wrong category count':rows=>rows[5].categoryKey='barrel_damper',
 'unknown category':rows=>rows[5].categoryKey='unknown',
 'wrong main hash':rows=>rows[5].sourceHash='a'.repeat(64),
 'wrong sanitary hash':rows=>rows.at(-1).sourceHash=MAIN,
 'wrong main sheet':rows=>rows[5].sourceSheet='其他表',
 'wrong sanitary sheet':rows=>rows.at(-1).sourceSheet='其他表',
 'invalid row':rows=>rows[5].sourceRow=0,
 'missing customer':rows=>rows[5].customer=' ',
 'missing model':rows=>rows[5].model='',
 'duplicate identity':rows=>Object.assign(rows[5],{serialNo:rows[6].serialNo}),
 'wrong standard type count':rows=>rows[5].standardType='formal',
 'unknown type':rows=>rows[5].standardType='pending',
 'working initial status':rows=>rows[5].initialStatus='pending_review',
 'working status':rows=>rows[5].status='draft',
 'unknown obsolete':rows=>rows[5].fields.import_note='作废',
 'missing obsolete marker':rows=>rows[0].fields={},
 'seasonal row mismatch':rows=>seasonal(rows).sourceRow=489,
 'seasonal identity mismatch':rows=>seasonal(rows).model='OTHER',
 'seasonal raw mismatch':rows=>seasonal(rows).fields.test_standard='120-160',
 'seasonal torque mismatch':rows=>seasonal(rows).fields.torque_standard='90-130',
 'seasonal conflicting winter':rows=>seasonal(rows).fields.winter_test_standard='90-130',
 'seasonal cell mismatch':rows=>seasonal(rows).comments[0].cell='F489',
 'seasonal field mismatch':rows=>seasonal(rows).comments[0].fieldKey='remark',
 'seasonal missing winter note':rows=>seasonal(rows).comments[0].text='2025.11.01冬季100-140',
 'seasonal missing winter value':rows=>seasonal(rows).comments[0].text='2026.10.15冬季120-160',
 'missing approved sanitary':rows=>rows.find(r=>r.serialNo==='SP0009-G').serialNo='OTHER-G',
 'sanitary approved model mismatch':rows=>rows.find(r=>r.serialNo==='SP0009-G').model='OTHER',
 'sanitary approved customer mismatch':rows=>rows.find(r=>r.serialNo==='SP0009-G').customer='其他',
 'sanitary approved row mismatch':rows=>rows.find(r=>r.serialNo==='SP0009-G').sourceRow=8,
 'sanitary part count mismatch':rows=>rows.at(-1).fields.part_type='盖',
};
for(const [name,mutate] of Object.entries(invalids))test(`rejects ${name} without mutating caller`,()=>{
 const rows=fixture();mutate(rows);const before=structuredClone(rows);
 assert.throws(()=>policy.applyBaselinePolicy(rows),error=>error.status===400);
 assert.deepEqual(rows,before);
});
test('rejects malformed payloads',()=>{
 for(const rows of [null,{},[],[null],new Array(809).fill(null)])assert.throws(()=>policy.applyBaselinePolicy(rows));
});

test('normalizes parser rows without optional comments to empty lists',()=>{
 const rows=fixture();delete rows[100].comments;
 const result=policy.applyBaselinePolicy(rows);
 assert.deepEqual(result.records[100].comments,[]);
 assert.equal(Object.hasOwn(rows[100],'comments'),false);
});

test('allows null optional comments but rejects malformed supplied comments',()=>{
 const rows=fixture();rows[100].comments=null;
 assert.deepEqual(policy.applyBaselinePolicy(rows).records[100].comments,[]);
 rows[100].comments={};assert.throws(()=>policy.applyBaselinePolicy(rows),/批注/);
});

test('specification text is not an approval workflow marker',()=>{
 const rows=fixture();rows[100].fields={import_note:'轴芯热熔待确认\n06.26',remark:'打点颜色待定，待审核规格'};
 const result=policy.applyBaselinePolicy(rows);
 assert.deepEqual(result.records[100].fields,rows[100].fields);
 assert.equal(result.records[100].initialStatus,'published');
});

test('real approved XLS sources satisfy the policy and preserve all 1264 comment associations',{
 skip:formalMainSource().skip || formalSanitarySource().skip,
},async()=>{
 const {spawnSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const script=`
  import fs from 'node:fs';
  import assert from 'node:assert/strict';
  import {parseStandardImportFile} from './src/lib/standardImportFile.ts';
  import {applyBaselinePolicy} from './server/services/standard-baseline-policy.js';
  import {parseCommentHistory} from './server/services/standard-comment-repair.js';
  const rows=[];
  for(const [name,scope] of [['客户标准参数一览表-整理版.xls','main'],['客户标准参数一览表-整理版-卫浴.xls','sanitary']]){
   const bytes=fs.readFileSync(name);
   const parsed=await parseStandardImportFile(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),scope);
   assert.deepEqual(parsed.errors,[]);rows.push(...parsed.records);
  }
  const before=structuredClone(rows);const result=applyBaselinePolicy(rows);
  assert.deepEqual(rows,before);
  assert.deepEqual(result.records.map(r=>r.comments),rows.map(r=>r.comments??[]));
  const counts=key=>result.records.reduce((acc,r)=>(acc[r[key]]=(acc[r[key]]||0)+1,acc),{});
  assert.equal(result.records.length,809);
  assert.deepEqual(counts('categoryKey'),{gear_damper:345,barrel_damper:129,rack_damper:34,lock_sync:113,air_pull_cord:111,air_pull_handle:32,sanitary_damper:45});
  assert.deepEqual(counts('standardType'),{formal:730,new_pending:68,temporary:11});
  assert.deepEqual(counts('initialStatus'),{published:808,obsolete:1});
  assert.equal(result.records.reduce((n,r)=>n+r.comments.length,0),1264);
  const row=result.records.find(r=>r.serialNo==='SP0209-A');
  assert.equal(row.customer,'惠州比亚迪▲');assert.equal(row.vehicleModel,'UFEA');
  assert.equal(row.fields.import_note,'轴芯热熔待确认\\n06.26');
  const seasonal=result.records.find(r=>r.serialNo==='SP0006-C');
  const note=seasonal.comments.find(c=>c.cell==='F490');
  assert.equal(parseCommentHistory(note.text,note.author).length,11);
  assert.equal(seasonal.fields.test_standard,'120-160');assert.equal(seasonal.fields.winter_test_standard,'100-140');
  assert.equal(result.transformations[0].before.test_standard,'100-140');
 `;
 const child=spawnSync(process.execPath,['--import','./scripts/standard-source-loader.js','--input-type=module'],{
  cwd:fileURLToPath(new URL('..',import.meta.url)),input:script,encoding:'utf8',timeout:30000,
 });
 assert.equal(child.status,0,child.stderr||child.error?.message);
});
