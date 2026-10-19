import path from 'node:path';
import {initDB,getDB,closeDB,retireStandard} from '../services/standard-store.js';
initDB();const db=getDB();
try{
 const rows=db.prepare("SELECT * FROM product_standard_versions WHERE serial_no='SP0103-A' AND status='published'").all();
 if(rows.length!==1){console.log(JSON.stringify({toRetire:rows.length,reason:'若已停用，不重复操作'}));}
 else{
  const row=rows[0];if(!JSON.parse(row.fields).import_note?.includes('此行作废'))throw new Error('缺少原表作废依据，停止');
  console.log(JSON.stringify({toRetire:1,serialNo:row.serial_no,customer:row.customer,reason:JSON.parse(row.fields).import_note}));
  if(process.argv.includes('--apply')){
   const filename=path.join(process.env.DATA_DIR || path.resolve(import.meta.dirname,'../../data'),'standards.db');
   const backup=`${filename}.bak-retire-${Date.now()}`;await db.backup(backup);
   retireStandard(row.standard_id,{versionId:row.id,revision:row.revision,reason:'用户确认依据原 Excel“此行作废，放筒型阻尼器行内”停用，保留历史。'},{id:'excel-source-reconciliation',name:'Excel 原表复核'});
   console.log(JSON.stringify({retired:row.serial_no,backup}));
  }
 }
}finally{closeDB();}
