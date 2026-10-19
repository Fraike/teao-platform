import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseStandardImportFile } from '../src/lib/standardImportFile.ts';
import { applyBaselinePolicy } from '../server/services/standard-baseline-policy.js';
import { materializeBaseline } from '../server/services/standard-baseline-build.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const MAIN='b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0';
const SANITARY='78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f';
const MAIN_SHEET='客户阻力值标准一览表-最新',SANITARY_SHEET='客户阻力值标准一览表（智能卫浴';
const fail=message=>{throw new Error(message);};
const bufferFor=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
const sheetSignature=sheet=>digest(JSON.stringify({range:sheet['!ref'],merges:sheet['!merges'],cells:Object.entries(sheet).filter(([key])=>!key.startsWith('!')).sort(([a],[b])=>a.localeCompare(b)).map(([cell,v])=>[cell,v.v??null,v.c?.map(c=>[c.a||'',c.t||''])||[]])}));

export async function buildOfficialBaseline({main,sanitary,output,createdAt}) {
  const buffers=[main,sanitary].map(file=>{
    if(!file||!fs.statSync(file).isFile()||fs.statSync(file).size>10*1024*1024) fail('需要不超过10MB的原始XLS');
    return fs.readFileSync(file);
  });
  if(digest(buffers[0])!==MAIN||digest(buffers[1])!==SANITARY) fail('正式来源hash不匹配，拒绝套用本次确认规则');
  const workbooks=buffers.map(buffer=>XLSX.read(buffer,{type:'buffer',cellHTML:false,cellFormula:false}));
  if(JSON.stringify(workbooks[0].SheetNames)!==JSON.stringify([MAIN_SHEET,SANITARY_SHEET])||JSON.stringify(workbooks[1].SheetNames)!==JSON.stringify([SANITARY_SHEET])) fail('发现未处理的工作表，拒绝遗漏');
  if(sheetSignature(workbooks[0].Sheets[SANITARY_SHEET])!==sheetSignature(workbooks[1].Sheets[SANITARY_SHEET])) fail('主文件内置卫浴与独立卫浴不同，不能去重');
  const parsed=await Promise.all([parseStandardImportFile(bufferFor(buffers[0]),'main'),parseStandardImportFile(bufferFor(buffers[1]),'sanitary')]);
  if(parsed.some(result=>result.errors.length)) fail(`来源解析失败：${parsed.flatMap(result=>result.errors).join('；')}`);
  const {records,transformations}=applyBaselinePolicy(parsed.flatMap(result=>result.records));
  const associations=records.reduce((n,r)=>n+r.comments.length,0);
  const unique=new Set(records.flatMap(r=>r.comments.map(c=>JSON.stringify([r.sourceHash,r.sourceSheet,c.cell,c.author,c.text]))));
  if(associations!==1264||unique.size!==1241) fail(`批注覆盖不匹配：${associations}关联／${unique.size}来源`);
  // Independent inventory of every commented cell: row count parity alone cannot prove coverage.
  const rawNotes=new Set();let emptyNotes=0;
  [workbooks[0].Sheets[MAIN_SHEET],workbooks[1].Sheets[SANITARY_SHEET]].forEach((sheet,index)=>{
    for(const [cell,value] of Object.entries(sheet)){
      if(cell.startsWith('!'))continue;
      for(const c of value.c||[]){
        const text=(c.t||'').split('\0')[0].trim();
        if(!text){emptyNotes++;continue;}
        if(index===0&&cell==='K1')continue;
        rawNotes.add(JSON.stringify([index?SANITARY:MAIN,index?SANITARY_SHEET:MAIN_SHEET,cell,c.a||'Excel',text]));
      }
    }
  });
  if(emptyNotes!==1||rawNotes.size!==1241||[...rawNotes].some(note=>!unique.has(note))||[...unique].some(note=>!rawNotes.has(note))) fail('逐单元格原始批注覆盖失败');
  const tableNotes=[];
  const sheet=workbooks[0].Sheets[MAIN_SHEET];
  for(const c of sheet.K1?.c||[]) if(c.t?.trim()) tableNotes.push({sourceHash:MAIN,sheet:MAIN_SHEET,cell:'K1',author:c.a||'Excel',text:c.t});
  if(tableNotes.length!==1) fail('表级批注必须完整保留');
  const sources=parsed.map((result,index)=>({file:index?'sanitary.xls':'main.xls',sha256:result.fileHash,bytes:buffers[index].length,sheet:result.source.sheetName,range:result.source.range}));
  const report=materializeBaseline(records,path.join(path.resolve(output),'standards.db'),{createdAt,transformations,tableNotes,sources});
  fs.mkdirSync(path.join(output,'sources'),{mode:0o700});
  sources.forEach((source,index)=>fs.writeFileSync(path.join(output,'sources',source.file),buffers[index],{flag:'wx',mode:0o600}));
  fs.writeFileSync(path.join(output,'source-records.json'),JSON.stringify(records),{flag:'wx',mode:0o600});
  return {...report,uniqueProductComments:unique.size,warnings:parsed.flatMap(result=>result.warnings),output:path.resolve(output)};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  try{
    for(let i=0;i<args.length;i++){
      const flag=args[i].slice(2),key=flag==='created-at'?'createdAt':flag;
      if(!['main','sanitary','output','created-at'].includes(flag)||!args[i].startsWith('--')||!args[i+1]||options[key]) fail('usage: node --import ./scripts/standard-source-loader.js scripts/standard-baseline-build.js --main XLS --sanitary XLS --output NEW_DIRECTORY [--created-at ISO_UTC_TIME]');
      const value=args[++i];
      if(key==='createdAt'&&(!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)) fail('构建时间必须为完整 ISO UTC 时间，例如 2026-10-19T00:00:00.000Z');
      options[key]=key==='createdAt'?value:path.resolve(value);
    }
    if(!options.output) fail('必须指定全新隔离输出目录');
    console.log(JSON.stringify(await buildOfficialBaseline(options),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
