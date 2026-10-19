// Run with scripts/standard-source-loader.js against the CLOSED isolated baseline.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildStandardWorkbook } from '../src/lib/standardExcel.ts';
import { buildStandardPrintHtml } from '../src/lib/standardPrint.ts';
import { standardSpecificationFields,standardIdentityValues } from '../src/lib/standardOutputFields.ts';

const directory=process.argv[2];
if(!directory||!path.isAbsolute(directory))throw new Error('需要隔离基线绝对路径');
const db=new DatabaseSync(path.join(directory,'standards.db'),{readOnly:true});
let products,categories;
try{
  categories=db.prepare('SELECT * FROM standard_categories ORDER BY sort').all().map(c=>({...c,fields:JSON.parse(c.fields)}));
  const comments=db.prepare('SELECT * FROM product_standard_excel_comments').all();
  const byVersion=new Map();
  for(const c of comments){const list=byVersion.get(c.version_id)||[];list.push({versionId:c.version_id,fieldKey:c.field_key,fieldLabel:c.field_label,sourceCell:c.source_cell,author:c.author,text:c.text,changedAt:c.changed_at});byVersion.set(c.version_id,list);}
  products=db.prepare('SELECT * FROM product_standard_versions ORDER BY rowid').all().map(v=>{
    const version={id:v.id,versionNo:v.version_no,categoryKey:v.category_key,categoryName:categories.find(c=>c.key===v.category_key)?.name,standardType:v.standard_type,
      customer:v.customer,model:v.model,vehicleModel:v.vehicle_model,customerPartNo:v.customer_part_no,fields:JSON.parse(v.fields),status:v.status,
      createdBy:v.created_by,createdAt:v.created_at,publishedAt:v.published_at,updatedAt:v.updated_at,updatedBy:v.updated_by,
      submittedBy:v.submitted_by,reviewedBy:v.reviewed_by,reviewComment:v.review_comment};
    return {standard:{id:v.standard_id,serialNo:v.serial_no,sourceComments:byVersion.get(v.id)||[]},version};
  });
}finally{db.close();}
const generatedAt=new Date().toISOString(),book=await buildStandardWorkbook(products,categories,generatedAt);
const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true});
const roundtrip=XLSX.read(bytes,{type:'buffer'});
let fieldsChecked=0;
for(const category of categories){
  const group=products.filter(p=>p.version.categoryKey===category.key);
  if(!group.length)continue;
  const rows=XLSX.utils.sheet_to_json(roundtrip.Sheets[category.name],{header:1,defval:''});
  assert.equal(rows.length,group.length+1);
  const specs=standardSpecificationFields(group,category),offset=standardIdentityValues(group[0]).length;
  group.forEach((p,index)=>specs.forEach((field,col)=>{assert.equal(rows[index+1][offset+col],p.version.fields[field.key]??'',`${p.standard.serialNo}:${field.key}`);fieldsChecked++;}));
}
const notes=XLSX.utils.sheet_to_json(roundtrip.Sheets['原始批注'],{header:1,defval:''});
const expectedNotes=products.flatMap(p=>p.standard.sourceComments.map(c=>[p.standard.serialNo,p.version.customer,p.version.model,'V1',c.fieldLabel,c.sourceCell,c.author,c.text,c.changedAt,'1/1']));
assert.deepEqual(notes.slice(1),expectedNotes);
const published=products.filter(p=>p.version.status==='published');
const html=buildStandardPrintHtml(published,categories,{generatedAt,styleUrl:'./standardPrint.css'});
assert.equal((html.match(/class="product"/g)||[]).length,published.length);
for(const label of ['审核意见','指定审核人','提交人','审核与更新记录'])assert(!html.includes(`<th scope="row">${label}</th>`));
assert(html.includes('冬季测试标准'));assert(html.includes('100-140'));
const output=path.join(directory,'output-check');fs.mkdirSync(output,{mode:0o700});
fs.writeFileSync(path.join(output,'standards-full.xlsx'),bytes,{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(output,'standards-print.html'),html,{flag:'wx',mode:0o600});
fs.copyFileSync(new URL('../src/lib/standardPrint.css',import.meta.url),path.join(output,'standardPrint.css'),fs.constants.COPYFILE_EXCL);
console.log(JSON.stringify({excelProducts:products.length,fieldsChecked,archivedComments:expectedNotes.length,printProducts:published.length,output},null,2));
