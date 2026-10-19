import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {parseStandardImportRows} from '../../src/lib/standardImport.ts';
import {getDB,initDB,closeDB,previewStandardImport,confirmStandardImport} from '../services/standard-store.js';
const require=createRequire(new URL('../../package.json',import.meta.url)), XLSX=require('xlsx');
const root=path.resolve(import.meta.dirname,'../..');
const w=XLSX.readFile(path.join(root,'客户标准参数一览表-整理版.xls'));
const sheet=w.Sheets[w.SheetNames[0]];
const comments=Object.entries(sheet).filter(([cell])=>!cell.startsWith('!')).flatMap(([cell,v])=>{
  const p=XLSX.utils.decode_cell(cell);return (v.c || []).map(c=>({row:p.r,column:p.c,cell,author:c.a || 'Excel',text:c.t || ''}));
});
const source=parseStandardImportRows(XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',range:0}),{mergedRanges:sheet['!merges'],comments}).records
  .filter(r=>r.serialNo==='SP0024-D' && r.customer==='成都瑞博▲' && ['型号E115','A02'].includes(r.fields.marking));
if(source.length!==2)throw new Error('原表项目行数量不符，停止');
initDB();
try {
 const actor={id:'excel-source-reconciliation',name:'Excel 原表复核'};
 const preview=previewStandardImport(source,actor);
 console.log(JSON.stringify({total:preview.total,skipped:preview.skipped,toInsert:preview.valid-preview.skipped,projects:source.map(r=>r.fields.marking)}));
 if(process.argv.includes('--apply')){
  if(preview.valid>preview.skipped) console.log(JSON.stringify(await confirmStandardImport(source,actor,preview.token)));
  const db=getDB();
  const record=db.prepare("SELECT * FROM product_standard_versions WHERE serial_no='SP0024-D' AND customer='成都瑞博▲' AND vehicle_model='' AND status='published'").all().find(r=>JSON.parse(r.fields).marking==='型号E115');
  if(record){
   const filename=path.join(process.env.DATA_DIR || path.join(root,'data'),'standards.db');
   const backup=`${filename}.bak-project-${Date.now()}`;await db.backup(backup);
   const now=new Date().toISOString();
   db.transaction(()=>{
    const result=db.prepare("UPDATE product_standard_versions SET vehicle_model='E115',revision=revision+1 WHERE id=? AND revision=?").run(record.id,record.revision);
    if(result.changes!==1)throw new Error('数据已变更，请重新核对');
    db.prepare(`INSERT INTO product_standard_changes (id,standard_id,version_id,field_key,field_label,author,changed_at,description,sort_date,seq,created_at)
      VALUES (?,?,?,'vehicle_model','项目代号',?, ?, '依据原 Excel 打点内容补充 E115 项目标识，A02 项目独立保留。',?,(SELECT COALESCE(MAX(seq),0)+1 FROM product_standard_changes),?)`)
      .run(randomUUID(),record.standard_id,record.id,actor.name,now.slice(0,10),Number(now.slice(0,10).replaceAll('-','')),now);
   })();console.log(JSON.stringify({projectCorrected:'E115',backup}));
  }
 }
} finally {closeDB();}
