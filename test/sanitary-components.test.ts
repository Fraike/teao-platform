import assert from 'node:assert/strict';
import {test} from 'node:test';
import XLSX from 'xlsx';
import {parseStandardImportFile} from '../src/lib/standardImportFile.ts';
const header=['序号','客户名','客户型号','产品型号','盖标准','实际扭矩(kg)','使用油号','盖下落速度','下座台阶','产品长度','印字','序号','座垫标准','实际扭矩(kg)','使用油号','座下落速度','下座台阶','产品长度','印字','备注'];
const encode=(rows:unknown[][],comments=false)=>{
 const s=XLSX.utils.aoa_to_sheet(rows);
 if(comments){s.B2.c=[{a:'工程',t:'客户说明'}];s.E2.c=[{a:'工程',t:'2024.1.2盖变更'}];s.M2.c=[{a:'工程',t:'2024.2.3座变更'}];}
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,s,'智能卫浴');return XLSX.write(w,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
};
test('two SP columns produce independent products with side-local parameters and shared comments',async()=>{
 const r=await parseStandardImportFile(encode([header,['SP9001-G','客户','001','RD-V088','盖CW30','30-32','油甲','5-8秒','3MM','40mm','LID','SP9002-G','座CCW20','20-22','油乙','6-9秒','5MM','41mm','SEAT','共同备注']],true),'sanitary');
 assert.deepEqual(r.errors,[]);assert.equal(r.records.length,2);
 const [lid,seat]=r.records;
 assert.equal(lid.serialNo,'SP9001-G');assert.equal(seat.serialNo,'SP9002-G');
 assert.equal(lid.fields.part_type,'盖');assert.equal(seat.fields.part_type,'座');
 assert.equal(lid.fields.actual_torque,'30-32');assert.equal(seat.fields.actual_torque,'20-22');
 assert.equal(lid.fields.oil_no,'油甲');assert.equal(seat.fields.oil_no,'油乙');
 assert.deepEqual(lid.comments?.map(c=>c.cell),['B2','E2']);
 assert.deepEqual(seat.comments?.map(c=>c.cell),['B2','M2']);
 assert.equal(lid.fields.remark,'共同备注');assert.equal(seat.fields.remark,'共同备注');
});
test('no seat product is invented from a merged explanation or 暂无, and supplied codes never become WY codes',async()=>{
 const r=await parseStandardImportFile(encode([header,['SP9001-G','客户','','RD-V088','CW8','7-9','','','','','','轴芯无铜无钢片'],['SP9003-G','客户','','RD-V088','CW32','','','','','','','','暂无']]),'sanitary');
 assert.deepEqual(r.errors,[]);assert.equal(r.records.length,2);
 assert.match(r.records[0].fields.import_note,/轴芯无铜无钢片/);
 assert(r.records.every(x=>x.serialNo.startsWith('SP')));
});

test('component import uses explicit code identity and atomically retires paired predecessors with rollback on stale IDs',async()=>{
 const{mkdtempSync}=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'sanitary-replacement-'));
 const s=await import('../server/services/standard-store.js');s.initDB();
 const user={id:'admin',name:'管理员',role:'admin'};
 const old={serialNo:'WY-legacy',customer:'客户',model:'RD-V088',categoryKey:'sanitary_damper',fields:{lid_standard:'CW30',seat_standard:'CCW20'}};
 try{
  let p=s.previewStandardImport([old],user);await s.confirmStandardImport([old],user,p.token);
  const legacy=s.listStandardPage({category:'sanitary_damper',pageSize:null}).data[0];
  const parsed=await parseStandardImportFile(encode([header,['SP9001-G','客户','','RD-V088','盖CW30','30-32']]),'sanitary');
  p=s.previewStandardImport(parsed.records,user);
  await assert.rejects(()=>s.confirmStandardImport(parsed.records,user,p.token,()=>{}, {retirePairedSanitaryIds:[legacy.id,'missing-id']}));
  assert.equal(s.listStandardPage({category:'sanitary_damper',pageSize:null}).data.length,1);
  assert.equal(s.getStandard(legacy.id).versions[0].status,'published');
  p=s.previewStandardImport(parsed.records,user);
  const result=await s.confirmStandardImport(parsed.records,user,p.token,()=>{}, {retirePairedSanitaryIds:[legacy.id]});
  assert.equal(result.inserted,1);assert.equal(result.retired,1);
  assert.equal(s.getStandard(legacy.id).versions[0].status,'obsolete');
  const amended=parsed.records.map(r=>({...r,model:'其他型号',fields:{...r.fields,actual_torque:'99-100'}}));
  assert.equal(s.previewStandardImport(amended,user).skipped,1,'same SP code must not create a second independent product during initialization');
  assert(s.listStandardPage({category:'sanitary_damper',excludeObsolete:true,pageSize:null}).data.every(r=>r.serialNo==='SP9001-G'));
 }finally{s.closeDB();}
});
