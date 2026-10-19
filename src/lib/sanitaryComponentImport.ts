import type {StandardImportRowRecord} from '../types/standardImport';
import { firstCommentDate } from './standardCommentDate.ts';

interface CellComment {row:number; column:number; cell:string; author:string; text:string}
interface Merge {s:{r:number;c:number};e:{r:number;c:number}}
interface Options {comments?:CellComment[];mergedRanges?:Merge[]}
const text=(value:unknown)=>String(value??'').trim();
const keys=['product_standard','actual_torque','oil_no','fall_time','step','length','marking'];
const labels:Record<string,string>={customer:'客户名',customer_model:'客户型号',model:'产品型号',serial_no:'序号',product_standard:'产品标准',actual_torque:'实际扭矩（kg，原表）',oil_no:'使用油号',fall_time:'下落时间',step:'下座台阶',length:'产品长度',marking:'印字',remark:'备注',import_note:'来源附加说明'};
export function isSanitaryComponentSheet(rows:unknown[][]){return rows.some(row=>text(row[0])==='序号'&&text(row[1])==='客户名'&&text(row[11])==='序号');}
function merged(rows:unknown[][],r:number,c:number,merges:Merge[]){
 const value=text(rows[r]?.[c]);if(value)return value;
 const range=merges.find(m=>m.s.c===c&&m.e.c===c&&m.s.r<=r&&r<=m.e.r);
 return range?text(rows[range.s.r]?.[c]):'';
}
function productComments(comments:CellComment[],r:number,side:'lid'|'seat'){
 const start=side==='lid'?4:12,serialColumn=side==='lid'?0:11;
 return comments.filter(c=>c.row===r&&(c.column>=1&&c.column<=3||c.column>=19||c.column===serialColumn||c.column>=start&&c.column<=start+6))
 .map(c=>{
  const key=c.column===1?'customer':c.column===2?'customer_model':c.column===3?'model':c.column===serialColumn?'serial_no':keys[c.column-start]||'remark';
  const body=c.text.split('\0')[0].trim();
  return {fieldKey:key,fieldLabel:labels[key],text:body,cell:c.cell,author:c.author,changedAt:firstCommentDate(body)};
 }).filter(c=>c.text);
}
export function parseSanitaryComponentRows(rows:unknown[][],options:Options={}){
 const records:StandardImportRowRecord[]=[],errors:string[]=[],warnings=['盖和座按各自SP序号分别导入；实际扭矩保留原表kg单位，不换算。'];
 let inData=false;
 for(const [r,row]of rows.entries()){
  if(text(row[0])==='序号'&&text(row[1])==='客户名'){inData=true;continue;}
  if(/^客户标准参数|^注[:：]/.test(text(row[0]))||/^注[:：]/.test(text(row[1]))){inData=false;continue;}
  if(!inData)continue;
  for(const side of ['lid','seat'] as const){
   const start=side==='lid'?4:12;
   // A and L are independent identifiers; never interpret a merged remark as a product.
   const serialNo=text(row[side==='lid'?0:11]);
   if(!/^SP\d+-G$/i.test(serialNo)){
    if(/^SP/i.test(serialNo))errors.push(`第${r+1}行${side==='lid'?'盖':'座'}序号格式无效：${serialNo}`);
    else if(text(row[start])&&!/暂无/.test(text(row[start]))&&text(row[start+1]))errors.push(`第${r+1}行${side==='lid'?'盖':'座'}有参数但缺少SP序号。`);
    continue;
   }
   const customer=merged(rows,r,1,options.mergedRanges||[]),model=merged(rows,r,3,options.mergedRanges||[]);
   if(!customer){errors.push(`第${r+1}行${serialNo}缺少客户名。`);continue;}
   const fields:Record<string,string>={part_type:side==='lid'?'盖':'座',customer_model:merged(rows,r,2,options.mergedRanges||[])};
   keys.forEach((key,index)=>{fields[key]=text(row[start+index]);});
   fields.remark=text(row[19]);
   fields.import_note=side==='lid'&&text(row[11])&&!/^SP/i.test(text(row[11]))?`原表L${r+1}：${text(row[11])}`:'';
   const tail=row.slice(20).map(text).filter(Boolean);if(tail.length)fields.import_note=[fields.import_note,...tail].filter(Boolean).join('\n');
   if(!model)warnings.push(`${serialNo}原表产品型号为空，需明确确认后补全。`);
   records.push({sourceRow:r+1,serialNo:serialNo.toUpperCase(),customer,model,customerPartNo:'',categoryKey:'sanitary_damper',standardType:'formal',fields,comments:productComments(options.comments||[],r,side)});
  }
 }
 const seen=new Set<string>();for(const record of records){if(seen.has(record.serialNo))errors.push(`独立产品序号重复：${record.serialNo}`);seen.add(record.serialNo);}
 if(!records.length)errors.push('未识别到带盖/座独立SP序号的卫浴产品。');
 return {records,errors,warnings};
}
