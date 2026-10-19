import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { previewStandardReclassification, applyStandardReclassification } from '../services/standard-reclassification.js';
const require = createRequire(new URL('../../package.json', import.meta.url));
const XLSX = require('xlsx');
const {parseStandardImportRows}=await import('../../src/lib/standardImport.ts');
const root=path.resolve(import.meta.dirname,'../..');
const filename=process.env.STANDARDS_DB_PATH || path.join(process.env.DATA_DIR || path.join(root,'data'),'standards.db');
const workbook=XLSX.readFile(path.join(root,'客户标准参数一览表-整理版.xls'));
const sheet=workbook.Sheets[workbook.SheetNames[0]];
const source=parseStandardImportRows(XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',range:0}),{mergedRanges:sheet['!merges']}).records;
const apply=process.argv.includes('--apply');
const db=new Database(filename,{readonly:!apply,fileMustExist:true});
try {
  const preview=previewStandardReclassification(db,source);
  const output=path.join(root,'data',`standard-category-preview-${Date.now()}.json`);
  fs.writeFileSync(output,JSON.stringify(preview,null,2));
  console.log(JSON.stringify({toMove:preview.plans.length,conflicts:preview.conflicts,preview:output},null,2));
  if(apply){
    const backup=`${filename}.bak-rack-${Date.now()}`;
    await db.backup(backup);
    const {initDB,closeDB}=await import('../services/standard-store.js');
    initDB();closeDB();
    console.log(JSON.stringify({...applyStandardReclassification(db,source,preview),backup},null,2));
  }
} finally {db.close();}
