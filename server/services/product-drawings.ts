import {pdfDisplaySize,assertLandscapePages} from '../shared/product-pdf-layout.ts';
import {DRAWING_NUMBER_PATTERN} from '../shared/product-drawing-input.ts';
import {filenameDrawingStructure} from '../shared/product-drawing-selection.ts';
export {selectProductionDrawings} from '../shared/product-drawing-selection.ts';
import {productBlobStore} from './product-blobs.ts';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PDFDocument,PDFName,PDFDict,StandardFonts,rgb,degrees} from 'pdf-lib';
import type {ProductActor,ProductArchive,ProductDrawing,ProductDrawingInput} from '../../src/types/product.ts';
import {productError} from './product-catalog.ts';
import type {ProductCatalog} from './product-catalog.ts';
interface FileRow {
  drawing_role:NonNullable<ProductDrawing['role']>;structure:NonNullable<ProductDrawing['structure']>;
  id:string;product_id:string;drawing_no:string;version:string;filename:string;kind:'pdf'|'source';
  standard_ids:string;scope_key:string;status:'draft'|'published'|'retired';size:number;sha256:string;
  uploaded_by:string;uploaded_at:string;published_by:string|null;published_at:string|null;
}
export const canManageDrawings = (user: ProductActor) => user.role==='admin'||user.permissions.includes('product_drawing_manage');
function requireManager(user: ProductActor) { if(!canManageDrawings(user)) throw productError('没有图纸管理权限',403); }
function toDrawing(row:FileRow):ProductDrawing {
  return {id:row.id,productId:row.product_id,drawingNo:row.drawing_no,version:row.version,filename:row.filename,
    kind:row.kind,role:row.drawing_role,structure:row.structure,standardIds:JSON.parse(row.standard_ids),status:row.status,size:row.size,
    uploadedBy:row.uploaded_by,uploadedAt:row.uploaded_at,publishedBy:row.published_by,publishedAt:row.published_at};
}
export async function parsePdf(bytes:Buffer) {
  try {
    const pdf=await PDFDocument.load(bytes,{updateMetadata:false});
    if(pdf.getPageCount()<1||pdf.getPageCount()>200) throw new Error('页数应为1–200');
    for(const [,object] of pdf.context.enumerateIndirectObjects()) {
      if(object instanceof PDFDict && (object.has(PDFName.of('JS')) || object.has(PDFName.of('JavaScript')) || object.has(PDFName.of('EmbeddedFiles')) || ['/JavaScript','/Launch','/RichMedia'].includes(String(object.get(PDFName.of('S')))))) {
        throw new Error('不允许包含脚本、启动操作或嵌入文件');
      }
    }
    return pdf;
  }catch(error){ throw productError(`PDF无法读取：${error instanceof Error?error.message:'格式错误'}`); }
}
function validateInput(product:ProductArchive,input:ProductDrawingInput,bytes:Buffer) {
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>25*1024*1024) throw productError('文件应为1字节至25MiB');
  if(typeof input.drawingNo!=='string'||!DRAWING_NUMBER_PATTERN.test(input.drawingNo)||!input.drawingNo.trim()) throw productError('图号应为1至100字的中文、字母、数字、空格、括号、点、下划线或短横线');
  if(typeof input.version!=='string'||!/^[A-Za-z0-9_.-]{1,40}$/.test(input.version)) throw productError('版本仅支持字母、数字、点、下划线和短横线');
  if(typeof input.filename!=='string'||input.filename.length>200||(/[\\/]/.test(input.filename)||[...input.filename].some(c=>c.charCodeAt(0)<32))) throw productError('文件名无效');
  if(product.group==='semi'&&(!Array.isArray(input.standardIds)||input.standardIds.length))throw productError('半成品图纸不允许关联客户标准');
  if(!Array.isArray(input.standardIds)||input.standardIds.some(id=>!product.standards.some(s=>s.id===id))) throw productError('适用客户标准不属于本产品或已失效');
  if(input.role!==undefined&&!['primary','supplement'].includes(input.role)||input.structure!==undefined&&!['geared','gearless','unspecified'].includes(input.structure))throw productError('图纸主次或结构类型无效');
  const ext=path.extname(input.filename).toLowerCase();
  if(input.kind!=='pdf')throw productError('当前图纸上传仅支持PDF格式');
  if(ext!=='.pdf'||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw productError('请上传有效PDF文件');
}
export function createProductDrawings(store:ProductCatalog,currentUser:(user:ProductActor)=>ProductActor|null=(user)=>user) {
  const directory=path.join(store.directory,'product-files'),blobs=productBlobStore(store.directory);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const event=(id:string,action:string,user:ProductActor)=>store.db.prepare('INSERT INTO product_file_events VALUES(?,?,?,?,?,?)').run(randomUUID(),id,action,user.id,user.name,new Date().toISOString());
  function row(productId:string,id:string) {
    const file=store.db.prepare('SELECT * FROM product_files WHERE id=? AND product_id=?').get(id,productId) as FileRow|undefined;
    if(!file) throw productError('图纸不存在',404);
    return file;
  }
  function read(productId:string,id:string,user:ProductActor) {
    const file=row(productId,id);
    if(!canManageDrawings(user)&&(file.kind!=='pdf'||file.status!=='published')) throw productError('没有访问此文件的权限',403);
    const shared=store.db.prepare('SELECT sha256 FROM product_file_blobs WHERE file_id=?').get(file.id) as {sha256:string}|undefined;
    const bytes=shared?blobs.read(shared.sha256):fs.readFileSync(path.join(directory,file.id));
    if(createHash('sha256').update(bytes).digest('hex')!==file.sha256) throw productError('文件校验失败，请联系工程人员',409);
    return {file:toDrawing(file),bytes};
  }
  function findExisting(productId:string,input:ProductDrawingInput){return store.db.prepare('SELECT * FROM product_files WHERE product_id=? AND drawing_no=? AND version=? AND kind=? AND standard_ids=? AND structure=?').get(productId,input.drawingNo,input.version,input.kind,JSON.stringify([...new Set(input.standardIds)].sort()),input.structure||filenameDrawingStructure(input.filename)) as FileRow|undefined;}
  async function upload(product:ProductArchive,input:ProductDrawingInput,bytes:Buffer,user:ProductActor) {
    requireManager(user);validateInput(product,input,bytes);
    const pdf=await parsePdf(bytes);
    try {assertLandscapePages(pdf.getPages().map(page=>pdfDisplaySize(page.getMediaBox(),page.getCropBox(),page.getRotation().angle)));}
    catch(error){throw productError(error instanceof Error?error.message:'PDF页面方向无法识别');}
    const live=currentUser(user);
    if(!live) throw productError('登录状态已失效',401);
    requireManager(live); user=live;
    const standardIds=[...new Set(input.standardIds)].sort(),structure=input.structure||filenameDrawingStructure(input.filename),scope=`${standardIds.join(',')}|${structure}`,id=randomUUID();
    const exists=findExisting(product.id,input);
    if(exists) throw productError('此图号、版本和适用范围已存在，请使用新版本',409);
    const hash=blobs.put(bytes);
    // Never overwrite files. A DB failure leaves an unreferenced file for recovery, not a broken published record.
    store.db.transaction(()=>{
      store.db.prepare(`INSERT INTO product_files(id,product_id,drawing_no,version,filename,kind,standard_ids,scope_key,size,sha256,uploaded_by,uploaded_at,drawing_role,structure)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,product.id,input.drawingNo,input.version,input.filename,input.kind,JSON.stringify(standardIds),scope,bytes.length,createHash('sha256').update(bytes).digest('hex'),user.name,new Date().toISOString(),input.role||'primary',structure);
      store.db.prepare('INSERT INTO product_file_blobs VALUES(?,?)').run(id,hash);
      event(id,'upload',user);
    })();
    return toDrawing(row(product.id,id));
  }
  function publish(product:ProductArchive,id:string,user:ProductActor) {
    requireManager(user);
    if(!product.productionAvailable) throw productError('商品当前无有效来源或存在关联冲突，不能发布生产文件',409);
    const file=row(product.id,id);
    if(file.status!=='draft') throw productError('仅未发布文件可以发布',409);
    const refs:string[]=JSON.parse(file.standard_ids);
    if(product.group==='semi'&&refs.length)throw productError('半成品图纸不允许关联客户标准');
    if(refs.some(key=>!product.standards.some(s=>s.id===key))) throw productError('适用客户标准已失效，不能发布');
    read(product.id,id,user);
    const current=store.db.prepare("SELECT * FROM product_files WHERE product_id=? AND drawing_no=? AND kind=? AND status='published'").all(product.id,file.drawing_no,file.kind) as FileRow[];
    if(current.some(other=>other.structure===file.structure&&other.standard_ids!==file.standard_ids&&refs.some(key=>(JSON.parse(other.standard_ids) as string[]).includes(key)))) throw productError('与现有客户图适用范围重叠，请先停用冲突图纸',409);
    store.db.transaction(()=>{
      for(const old of current.filter(r=>r.structure===file.structure&&r.standard_ids===file.standard_ids)) {
        store.db.prepare("UPDATE product_files SET status='retired' WHERE id=?").run(old.id);event(old.id,'superseded',user);
      }
      store.db.prepare("UPDATE product_files SET status='published',published_by=?,published_at=? WHERE id=?").run(user.name,new Date().toISOString(),id);event(id,'publish',user);
    })();
    return toDrawing(row(product.id,id));
  }
  function retire(product:ProductArchive,id:string,user:ProductActor) {
    requireManager(user);row(product.id,id);
    store.db.transaction(()=>{store.db.prepare("UPDATE product_files SET status='retired' WHERE id=?").run(id);event(id,'retire',user);})();
  }
  async function print(product:ProductArchive,id:string,user:ProductActor) {
    if(!product.productionAvailable) throw productError('商品当前无有效来源或存在关联冲突，不能打印生产图纸',409);
    const {file,bytes}=read(product.id,id,user);
    if(file.kind!=='pdf'||file.status!=='published') throw productError('只能打印已发布PDF',409);
    const output=await parsePdf(bytes);
    const font=await output.embedFont(StandardFonts.Helvetica),timestamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
    const ascii=(value:string)=>value.replace(/[^\x20-\x7E]/g,'?');
    const line=ascii(`Part: ${product.internalNumber} | Drawing: ${file.drawingNo} | Rev: ${file.version}`);
    const scope=file.standardIds.length?`Standards: ${file.standardIds.join(',')}`:'General drawing';
    for(const page of output.getPages()) {
      const media=page.getMediaBox(),crop=page.getCropBox();
      const left=Math.max(media.x,crop.x),bottom=Math.max(media.y,crop.y);
      const right=Math.min(media.x+media.width,crop.x+crop.width),top=Math.min(media.y+media.height,crop.y+crop.height);
      const box=right>left&&top>bottom?{left,bottom,right,top}:{left:media.x,bottom:media.y,right:media.x+media.width,top:media.y+media.height};
      const w=box.right-box.left,h=box.top-box.bottom,angle=((page.getRotation().angle%360)+360)%360;
      const width=angle===90||angle===270?h:w;
      const margin=angle===0?{x:box.left,y:box.bottom-40,width:w,height:40}:
        angle===90?{x:box.right,y:box.bottom,width:40,height:h}:
        angle===180?{x:box.left,y:box.top,width:w,height:40}:{x:box.left-40,y:box.bottom,width:40,height:h};
      const newLeft=Math.min(box.left,margin.x),newBottom=Math.min(box.bottom,margin.y);
      const newRight=Math.max(box.right,margin.x+margin.width),newTop=Math.max(box.top,margin.y+margin.height);
      const mx=Math.min(media.x,newLeft),my=Math.min(media.y,newBottom);
      page.setMediaBox(mx,my,Math.max(media.x+media.width,newRight)-mx,Math.max(media.y+media.height,newTop)-my);
      page.setCropBox(newLeft,newBottom,newRight-newLeft,newTop-newBottom);
      page.drawRectangle({...margin,color:rgb(1,1,1)});
      const fit=(text:string)=>Math.min(9,(width-24)/Math.max(font.widthOfTextAtSize(text,9),1)*9);
      const position=(offset:number)=>angle===0?{x:box.left+12,y:box.bottom-offset}:
        angle===90?{x:box.right+offset,y:box.bottom+12}:
        angle===180?{x:box.right-12,y:box.top+offset}:{x:box.left-offset,y:box.top-12};
      page.drawText(line,{...position(15),size:fit(line),font,rotate:degrees(angle),color:rgb(.1,.1,.1)});
      const footer=ascii(`${scope} | Printed Asia/Shanghai: ${timestamp} | ID: ${file.id}`);
      page.drawText(footer,{...position(28),size:fit(footer),font,rotate:degrees(angle)});
    }
    const result=Buffer.from(await output.save());
    // Verify release is still current after async rendering; reject a superseded drawing.
    if(row(product.id,id).status!=='published') throw productError('图纸版本已变化，请刷新后打印',409);
    event(id,'print',user);
    return result;
  }
  return {upload,publish,retire,read,print,findExisting,list:(productId:string,user:ProductActor)=>
    (store.db.prepare('SELECT * FROM product_files WHERE product_id=? ORDER BY uploaded_at DESC,id').all(productId) as FileRow[])
      .filter(r=>canManageDrawings(user)||(r.status==='published'&&r.kind==='pdf')).map(toDrawing)};
}
