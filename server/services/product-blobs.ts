import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {productError} from './product-catalog.ts';
export function productBlobStore(directory:string) {
  const root=path.join(directory,'product-blobs');fs.mkdirSync(root,{recursive:true,mode:0o700});
  function read(hash:string) {
    if(!/^[a-f0-9]{64}$/.test(hash)) throw productError('文件哈希无效');
    const bytes=fs.readFileSync(path.join(root,hash));
    if(createHash('sha256').update(bytes).digest('hex')!==hash) throw productError('文件校验失败',409);
    return bytes;
  }
  function put(bytes:Buffer) {
    const hash=createHash('sha256').update(bytes).digest('hex');
    try{fs.writeFileSync(path.join(root,hash),bytes,{flag:'wx',mode:0o600});}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;read(hash);}
    return hash;
  }
  return {put,read};
}
