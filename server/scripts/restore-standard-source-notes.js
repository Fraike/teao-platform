import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {parseStandardImportRows} from '../../src/lib/standardImport.ts';
import {initDB,getDB,closeDB,archiveStandardComments} from '../services/standard-store.js';
const root=path.resolve(import.meta.dirname,'../..');
const require=createRequire(new URL('../../package.json',import.meta.url)),XLSX=require('xlsx');
const filename=path.join(root,'客户标准参数一览表-整理版.xls'),hash=createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const w=XLSX.readFile(filename),sheet=w.Sheets[w.SheetNames[0]];
const comments=Object.entries(sheet).filter(([cell])=>!cell.startsWith('!')).flatMap(([cell,v])=>{
 const p=XLSX.utils.decode_cell(cell);return (v.c || []).map(c=>({row:p.r,column:p.c,cell,author:c.a || 'Excel',text:c.t || ''}));
});
const source=parseStandardImportRows(XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',range:0}),{mergedRanges:sheet['!merges'],comments}).records;
initDB();const db=getDB();
const clean=s=>String(s || '').replace(/[▲*\s]/g,'');
try{
 const versions=db.prepare('SELECT * FROM product_standard_versions WHERE version_no=1').all();
 const plans=[],unmatched=[];
 for(const r of source){
  const candidates=versions.filter(v=>v.serial_no===r.serialNo && v.model===r.model);
  const project=r.fields.marking?.match(/^(?:型号)?([A-Z]+\d[A-Z0-9\-/.]*)$/)?.[1] || '';
  const matching=candidates.filter(v=>clean(r.customer.replace(v.vehicle_model || '\u0000',''))===clean(v.customer) && (!project || !v.vehicle_model || project===v.vehicle_model));
  const matches=matching.length===1 ? matching : candidates.length===1 && !candidates[0].customer ? candidates : [];
  if(matches.length!==1){unmatched.push({serialNo:r.serialNo,customer:r.customer});continue;}
  const v=matches[0],fields=JSON.parse(v.fields),edits=[];
  if(!v.customer && r.customer)edits.push({key:'customer',label:'客户名',value:r.customer});
  if(!fields.import_note && r.fields.import_note)edits.push({key:'import_note',label:'附加说明',value:r.fields.import_note});
  if(v.serial_no==='SP0261-A' && v.standard_type==='formal' && r.standardType==='temporary')edits.push({key:'standard_type',label:'标准性质',value:'temporary'});
  plans.push({version:v,source:r,edits});
 }
 const existing=db.prepare('SELECT version_id,source_cell,author,text FROM product_standard_excel_comments').all();
 const keys=new Set(existing.map(c=>JSON.stringify([c.version_id,c.source_cell,c.author,c.text])));
 const archiveCount=plans.reduce((n,p)=>n+(p.source.comments || []).filter(c=>!keys.has(JSON.stringify([p.version.id,c.cell,c.author,c.text]))).length,0);
 const summary={matched:plans.length,unmatched,fieldEdits:plans.flatMap(p=>p.edits.map(e=>({id:p.version.standard_id,serialNo:p.version.serial_no,field:e.label,value:e.value}))),commentsToArchive:archiveCount};
 console.log(JSON.stringify(summary,null,2));
 fs.writeFileSync(path.join(root,'data',`source-note-restoration-preview-${Date.now()}.json`),JSON.stringify(summary,null,2));
 if(process.argv.includes('--apply')){
  if(unmatched.length)throw new Error('原表身份未全部匹配，停止写入');
  const backup=path.join(process.env.DATA_DIR || path.join(root,'data'),`standards.db.bak-source-notes-${Date.now()}`);await db.backup(backup);
  const now=new Date().toISOString();
  db.transaction(()=>{
   for(const p of plans){
    const v=db.prepare('SELECT * FROM product_standard_versions WHERE id=?').get(p.version.id);
    if(v.revision!==p.version.revision || v.status!==p.version.status)throw new Error('数据已修改，请重新预览');
    if(p.edits.length && (v.status!=='published' || db.prepare('SELECT count(*) n FROM product_standard_versions WHERE standard_id=?').get(v.standard_id).n!==1))throw new Error('存在修订或未发布版本，停止直接补录');
    if(p.edits.length){
     const fields=JSON.parse(v.fields);let customer=v.customer,type=v.standard_type;
     for(const edit of p.edits){if(edit.key==='customer')customer=edit.value;else if(edit.key==='standard_type')type=edit.value;else fields[edit.key]=edit.value;}
     db.prepare('UPDATE product_standard_versions SET customer=?,standard_type=?,fields=?,revision=revision+1 WHERE id=?').run(customer,type,JSON.stringify(fields),v.id);
     for(const edit of p.edits) db.prepare(`INSERT INTO product_standard_changes (id,standard_id,version_id,field_key,field_label,author,changed_at,description,sort_date,seq,created_at)
       VALUES (?,?,?,?,?,'Excel 原表复核',?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM product_standard_changes),?)`)
       .run(randomUUID(),v.standard_id,v.id,edit.key,edit.label,now.slice(0,10),`补回原 Excel 导入遗漏：${edit.value}`,Number(now.slice(0,10).replaceAll('-','')),now);
    }
    archiveStandardComments(db,v.standard_id,v.id,p.source.comments || [],hash);
    // 单一已发布 V1 的原 Excel 历史可安全关联发布快照；有修订稿时不推断。
    if(v.status==='published' && db.prepare('SELECT count(*) n FROM product_standard_versions WHERE standard_id=?').get(v.standard_id).n===1){
     db.prepare("UPDATE product_standard_changes SET version_id=? WHERE standard_id=? AND version_id='' ").run(v.id,v.standard_id);
    }
   }
  })();console.log(JSON.stringify({appliedFields:summary.fieldEdits.length,archivedComments:archiveCount,backup}));
 }
}finally{closeDB();}
