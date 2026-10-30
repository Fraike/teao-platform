import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {ProductStandardReference} from '../../src/types/product.ts';
import {productBlobStore} from './product-blobs.ts';
import {productError} from './product-catalog.ts';

interface InheritedFile {id:string;drawing_no:string;kind:string;structure:string;sha256:string;blob_hash:string|null;}

export function inheritPublishedDrawings(db:Database.Database,directory:string,standards:ProductStandardReference[]) {
  const byId=new Map(standards.map(standard=>[standard.id,standard])),visited=new Set<string>();
  function inherit(standard:ProductStandardReference) {
    if(visited.has(standard.id))return;
    visited.add(standard.id);
    const parent=standard.drawingSourceStandardId?byId.get(standard.drawingSourceStandardId):undefined;
    if(parent)inherit(parent);
    if(!standard.drawingSourceNumber)return;
    const target=db.prepare('SELECT id FROM product_archives WHERE number=?').get(standard.serialNo) as {id:string}|undefined;
    const source=db.prepare("SELECT id FROM product_archives WHERE number=? AND issues='[]'").get(standard.drawingSourceNumber) as {id:string}|undefined;
    if(!target||!source||db.prepare('SELECT 1 FROM product_drawing_inheritance WHERE standard_id=? AND product_id=?').get(standard.id,target.id))return;
    db.transaction(()=>{
      if(target.id!==source.id)copyCommonFiles(db,directory,source.id,target.id,standard.id);
      db.prepare('INSERT INTO product_drawing_inheritance VALUES(?,?,?)').run(standard.id,target.id,new Date().toISOString());
    })();
  }
  for(const standard of standards)inherit(standard);
}

function copyCommonFiles(db:Database.Database,directory:string,sourceId:string,targetId:string,standardId:string) {
  const files=db.prepare(`SELECT f.*,b.sha256 blob_hash FROM product_files f LEFT JOIN product_file_blobs b ON b.file_id=f.id
    WHERE f.product_id=? AND f.status='published' AND f.standard_ids='[]'`).all(sourceId) as InheritedFile[];
  const blobs=productBlobStore(directory);
  for(const file of files) {
    // Explicit drawings on the target always win, including retired or draft versions.
    if(db.prepare("SELECT 1 FROM product_files WHERE product_id=? AND drawing_no=? AND kind=? AND structure=? AND standard_ids='[]'")
      .get(targetId,file.drawing_no,file.kind,file.structure))continue;
    const bytes=file.blob_hash?blobs.read(file.blob_hash):fs.readFileSync(path.join(directory,'product-files',file.id));
    if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw productError('来源图纸校验失败，请工程人员核对',409);
    const hash=blobs.put(bytes),id=randomUUID(),now=new Date().toISOString();
    db.prepare(`INSERT INTO product_files(id,product_id,drawing_no,version,filename,kind,standard_ids,scope_key,status,size,sha256,
      uploaded_by,uploaded_at,published_by,published_at,drawing_role,structure)
      SELECT ?,?,drawing_no,version,filename,kind,'[]',scope_key,'published',size,sha256,uploaded_by,uploaded_at,
      '复制标准沿用',?,drawing_role,structure FROM product_files WHERE id=?`).run(id,targetId,now,file.id);
    db.prepare('INSERT INTO product_file_blobs VALUES(?,?)').run(id,hash);
    db.prepare('INSERT INTO product_file_events VALUES(?,?,?,?,?,?)').run(randomUUID(),id,`inherit:${file.id}`,standardId,'复制标准沿用',now);
  }
}
