import {filenameDrawingStructure} from '../shared/product-drawing-selection.ts';
import {sharedDrawingSeries} from '../shared/product-drawing-series.ts';
import {randomUUID,createHash} from 'node:crypto';
import {productError} from './product-catalog.ts';
import type {ProductCatalog} from './product-catalog.ts';
import {canManageDrawings,parsePdf} from './product-drawings.ts';
import type {createProductDrawings} from './product-drawings.ts';
import {productBlobStore} from './product-blobs.ts';
import type {ProductActor,ProductArchive} from '../../src/types/product.ts';
import type {ProductImportBatch,ProductImportEntry,ProductImportDecision,ProductImportLink} from '../../src/types/productImport.ts';
function manager(user:ProductActor){if(!canManageDrawings(user))throw productError('没有图纸管理权限',403);}
const confirming=new Set<string>();
function seriesOf(text:string):string|null {
 const matches=[...text.toUpperCase().matchAll(/RD-([A-Z]+\d+[A-Z]*|\d+)(?![A-Z0-9])/g)].map(m=>m[1]);
 if(new Set(matches).size!==1)return null;
 const direction=[...text.toUpperCase().matchAll(/(?:[-（(])(CCW|CW)(?=[-）) .]|$)|([左右])/g)].map(m=>m[1]||m[2]);
 return new Set(direction).size>1?null:matches[0]+(direction.length?`-${direction[0]}`:'');
}
const normalize=(s:string)=>s.toUpperCase().replace(/[\s（）()\-_./]/g,'');
export function createProductImports(store:ProductCatalog,drawings:ReturnType<typeof createProductDrawings>,products:()=>ProductArchive[]) {
 const blobs=productBlobStore(store.directory);
 function currentProduct(id:string){const product=products().find(p=>p.id===id);if(!product||product.group!=='finished'||!product.productionAvailable)throw productError('适用成品料号已失效，未发布',409);return product;}
 function batch(id:string):ProductImportBatch {
  const row=store.db.prepare('SELECT * FROM product_import_batches WHERE id=?').get(id) as {id:string;name:string;created_at:string;created_by:string}|undefined;
  if(!row)throw productError('导入批次不存在',404);
  return {id:row.id,name:row.name,createdAt:row.created_at,createdBy:row.created_by};
 }
 function entry(batchId:string,id:string):ProductImportEntry {
  batch(batchId);const row=store.db.prepare('SELECT data FROM product_import_entries WHERE batch_id=? AND id=?').get(batchId,id) as {data:string}|undefined;
  if(!row)throw productError('导入文件不存在',404);return JSON.parse(row.data);
 }
 function save(item:ProductImportEntry){store.db.prepare('UPDATE product_import_entries SET data=? WHERE id=?').run(JSON.stringify(item),item.id);}
 function enrich(item:ProductImportEntry):ProductImportEntry {
  const sharedSeries=sharedDrawingSeries(item.sourcePath,item.series);
  const candidates=products().filter(p=>p.group==='finished'&&p.productionAvailable&&sharedSeries.includes(seriesOf(p.material?.name||p.name)||'')).map(p=>({productId:p.id,internalNumber:p.internalNumber,model:p.material?.name||p.name,
   standardIds:p.standards.filter(s=>[s.customerPartNo,s.vehicleModel||'',s.customer].some(v=>v&&normalize(item.filename).includes(normalize(v)))).map(s=>s.id)}));
  return {...item,sharedSeries,candidates};
 }
 function create(name:string,user:ProductActor) {
  manager(user);if(typeof name!=='string'||!name.trim()||name.length>200)throw productError('批次名称无效');
  const id=randomUUID();store.db.prepare('INSERT INTO product_import_batches VALUES(?,?,?,?)').run(id,name.trim(),new Date().toISOString(),user.name);return batch(id);
 }
 function list(user:ProductActor){manager(user);return (store.db.prepare('SELECT id FROM product_import_batches ORDER BY created_at DESC LIMIT 100').all() as {id:string}[]).map(r=>batch(r.id));}
 function view(id:string,user:ProductActor){manager(user);return {batch:batch(id),entries:(store.db.prepare('SELECT data FROM product_import_entries WHERE batch_id=? ORDER BY source_path').all(id) as {data:string}[]).map(r=>enrich(JSON.parse(r.data))),products:products().filter(p=>p.group==='finished')};}
 async function scan(batchId:string,sourcePath:string,bytes:Buffer,user:ProductActor) {
  manager(user);batch(batchId);
  if(typeof sourcePath!=='string'||sourcePath.length>1000||sourcePath.includes('\\')||sourcePath.startsWith('/')||sourcePath.split('/').some(p=>!p||p.startsWith('.')||[...p].some(c=>c.charCodeAt(0)<32)))throw productError('相对路径无效');
  const parts=sourcePath.split('/'),filename=parts.at(-1)!;
  if(!/\.pdf$/i.test(filename)||filename.length>200||parts.some(p=>['子件图','3D'].includes(p))||(!parts.includes('成品图')&&!parts.includes('客户图纸')&&parts.length>3))throw productError('仅扫描成品PDF，子件和其他文件不在本期范围');
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>25*1024*1024)throw productError('PDF应为1字节至25MiB');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const existing=store.db.prepare('SELECT id,sha256 FROM product_import_entries WHERE batch_id=? AND source_path=?').get(batchId,sourcePath) as {id:string;sha256:string}|undefined;
  if(existing){if(existing.sha256===sha256)return enrich(entry(batchId,existing.id));if(entry(batchId,existing.id).status!=='invalid')throw productError('同一路径内容已变化，请创建新批次',409);}
  if((store.db.prepare('SELECT count(*) n FROM product_import_entries WHERE batch_id=?').get(batchId) as {n:number}).n>=1000)throw productError('每批次最多1000份成品PDF');
  let error:string|null=null;
  try{if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw productError('不是有效PDF');await parsePdf(bytes);}catch(reason){error=reason instanceof Error?reason.message:'PDF校验失败';}
  const series=seriesOf(filename),folderSeries=seriesOf(parts.slice(0,-1).reverse().find(p=>/^RD-/i.test(p))||'');
  const hints:string[]=[];
  if(!parts.includes('成品图')&&!parts.includes('客户图纸'))hints.push('根目录PDF：请确认属于成品图');
  if(!series)hints.push('文件名系列不明确，请手动确认');
  if(series&&folderSeries&&series!==folderSeries)hints.push('文件名与目录系列不同，以文件名候选为准，请核对');
  if(/未发|旧|新模|参考|无齿轮|左|右|CW|CCW/i.test(filename))hints.push('存在状态、结构或方向标记，请人工核对适用范围');
  const clues=filename.match(/\d{4}[.\-年]\d{1,2}(?:[.\-月]\d{1,2})?|A\d+(?:\.\d+)?版/g);if(clues)hints.push(`日期/版本线索：${clues.join('、')}（不代表有效版本）`);
  if(store.db.prepare('SELECT id FROM product_import_entries WHERE sha256=? LIMIT 1').get(sha256))hints.push('内容与已有扫描文件相同，原件将去重保存');
  const item:ProductImportEntry={id:existing?.id||randomUUID(),batchId,sourcePath,filename,sha256,size:bytes.length,series,scope:parts.includes('客户图纸')||/专用/.test(filename)?'customer':'general',hints,candidates:[],status:error?'invalid':'ready',error,links:[]};
  if(!error)blobs.put(bytes);
  const raced=store.db.prepare('SELECT id,sha256 FROM product_import_entries WHERE batch_id=? AND source_path=?').get(batchId,sourcePath) as {id:string;sha256:string}|undefined;
  if(raced){if(raced.sha256===sha256)return enrich(entry(batchId,raced.id));if(raced.id===existing?.id&&entry(batchId,raced.id).status==='invalid'){store.db.prepare('UPDATE product_import_entries SET sha256=?,data=? WHERE id=?').run(sha256,JSON.stringify(item),raced.id);return enrich(item);}throw productError('同一路径内容已变化，请创建新批次',409);}
  store.db.prepare('INSERT INTO product_import_entries VALUES(?,?,?,?,?)').run(item.id,batchId,sourcePath,sha256,JSON.stringify(item));return enrich(item);
 }
 function preview(batchId:string,id:string,user:ProductActor){manager(user);const item=entry(batchId,id);if(item.status==='invalid')throw productError('PDF校验未通过');return {filename:item.filename,bytes:blobs.read(item.sha256)};}
 async function importDecision(batchId:string,decision:ProductImportDecision,user:ProductActor) {
  manager(user);if(!decision||typeof decision.entryId!=='string'||!Array.isArray(decision.targets)||!decision.targets.length||decision.targets.length>1000)throw productError('请选择适用料号并确认范围');
  if(typeof decision.drawingNo!=='string'||!/^[A-Za-z0-9_.-]{1,100}$/.test(decision.drawingNo)||typeof decision.version!=='string'||!/^[A-Za-z0-9_.-]{1,40}$/.test(decision.version))throw productError('图号和版本格式无效');
  const item=entry(batchId,decision.entryId);if(item.status==='invalid')throw productError('PDF校验未通过');
  const byId=new Map(products().map(p=>[p.id,p]));const seen=new Set<string>();
  const targets=decision.targets.map(t=>{
   if(!t||typeof t.productId!=='string')throw productError('适用料号格式无效');
   const p=byId.get(t.productId);if(!p||p.group!=='finished'||!p.productionAvailable)throw productError('适用成品料号已失效');
   if(seen.has(p.id)||!Array.isArray(t.standardIds)||t.standardIds.some(id=>typeof id!=='string'||!p.standards.some(s=>s.id===id)))throw productError('适用料号重复或客户标准已失效');seen.add(p.id);
   const standardIds=[...new Set(t.standardIds)].sort();if(item.scope==='customer'&&!standardIds.length)throw productError('客户图必须明确选择适用客户标准');
   const structure=t.structure||filenameDrawingStructure(item.filename),role=t.role||'primary';
   if(!['geared','gearless','unspecified'].includes(structure)||!['primary','supplement'].includes(role))throw productError('图纸主次或结构类型无效');
   return {product:p,standardIds,structure,role};
  });
  const prior=store.db.prepare('SELECT product_id,file_id,decision FROM product_import_links WHERE entry_id=?').all(item.id) as {product_id:string;file_id:string;decision:string}[];
  const fingerprint=JSON.stringify({drawingNo:decision.drawingNo,version:decision.version,targets:targets.map(t=>({productId:t.product.id,standardIds:t.standardIds})).sort((a,b)=>a.productId.localeCompare(b.productId))});
  if(prior.some(p=>p.decision!==fingerprint))throw productError('本文件已导入部分关联，重试须保留原确认范围',409);
  for(const old of prior){
   const target=targets.find(t=>t.product.id===old.product_id)!;
   const metadata=store.db.prepare('SELECT structure,drawing_role FROM product_files WHERE id=?').get(old.file_id) as {structure:string;drawing_role:string};
   if(metadata.structure!==target.structure||metadata.drawing_role!==target.role)throw productError('已导入关联的主次或结构不可在重试时更改',409);
  }
  item.decision={...decision,targets:targets.map(t=>({productId:t.product.id,standardIds:t.standardIds,structure:t.structure,role:t.role}))};
  const links:ProductImportLink[]=prior.map(r=>({productId:r.product_id,fileId:r.file_id}));
  try{
   const bytes=blobs.read(item.sha256);
   for(const target of targets){
    const linked=links.find(l=>l.productId===target.product.id);
    if(linked){const file=drawings.read(target.product.id,linked.fileId,user).file;if(file.structure!==target.structure||file.role!==target.role)throw productError('已导入关联的主次或结构不可在重试时更改',409);if(file.status==='draft')drawings.publish(currentProduct(target.product.id),linked.fileId,user);else if(file.status!=='published')throw productError('关联图纸已停用，请建立新版本',409);continue;}
    const existing=drawings.findExisting(target.product.id,{drawingNo:decision.drawingNo,version:decision.version,filename:item.filename,kind:'pdf',standardIds:target.standardIds,structure:target.structure,role:target.role});
    if(existing&&existing.drawing_role!==target.role)throw productError('已存在图纸的主次设置不同，请核对',409);
    if(existing&&existing.sha256!==item.sha256)throw productError('相同图号版本范围已存在其他内容，请核对',409);
    const file=existing||await drawings.upload(target.product,{drawingNo:decision.drawingNo,version:decision.version,filename:item.filename,kind:'pdf',standardIds:target.standardIds,structure:target.structure,role:target.role},bytes,user);
    store.db.prepare('INSERT INTO product_import_links VALUES(?,?,?,?)').run(item.id,target.product.id,file.id,fingerprint);
    links.push({productId:target.product.id,fileId:file.id});
    const current=drawings.read(target.product.id,file.id,user).file;if(current.status==='draft')drawings.publish(currentProduct(target.product.id),file.id,user);else if(current.status!=='published')throw productError('关联图纸已停用，请建立新版本',409);
   }
   item.status='imported';item.error=null;
  }catch(error){item.status='partial';item.error=error instanceof Error?error.message:'导入失败';}
  item.links=links;save(item);return enrich(item);
 }
 async function confirm(batchId:string,decision:ProductImportDecision,user:ProductActor){
  manager(user);const key=`${store.directory}:${batchId}:${decision?.entryId}`;
  if(confirming.has(key))throw productError('此文件正在导入，请稍后刷新或重试',409);
  confirming.add(key);try{return await importDecision(batchId,decision,user);}finally{confirming.delete(key);}
 }
 return {create,list,view,scan,preview,confirm};
}
