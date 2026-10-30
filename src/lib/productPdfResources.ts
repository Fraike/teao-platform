import type { PdfResourceDocument, PdfResourceLoader } from '../types/productPdfResource';
export function createProductPdfResourceCache<T extends PdfResourceDocument>(loader: PdfResourceLoader<T>, limits = { documents: 2, bytes: 50 * 1024 * 1024 }) {
 const blobs = new Map<string, Blob>(), documents = new Map<string, T>();
 const pending = new Map<string, Promise<T>>();
 const listeners = new Map<string, Set<()=>void>>();
 const owners=new Map<string,Set<string>>(), keyVersions=new Map<string,number>();
 let generation = 0;
 function remove(key:string){keyVersions.set(key,(keyVersions.get(key)||0)+1);blobs.delete(key);pending.delete(key);release(key);}
 function retain(owner:string,keys:readonly string[]){const owned=owners.get(owner)||new Set<string>();keys.forEach(key=>owned.add(key));owners.set(owner,owned);}
 function releaseOwner(owner:string){const keys=owners.get(owner);owners.delete(owner);for(const key of keys||[]){if(![...owners.values()].some(owned=>owned.has(key)))remove(key);}}

 function release(key: string) {
  const document = documents.get(key); documents.delete(key);
  if (document) { listeners.get(key)?.forEach(notify=>notify()); void document.destroy(); }
 }
 function clear() { generation++; for(const key of documents.keys()) release(key); blobs.clear(); pending.clear(); }
 async function document(key: string): Promise<T> {
  const existing = documents.get(key);
  if(existing){documents.delete(key);documents.set(key,existing);return existing;}
  const inflight=pending.get(key);if(inflight)return inflight;
  const version=generation,keyVersion=keyVersions.get(key)||0;
  const valid=()=>version===generation&&keyVersion===(keyVersions.get(key)||0);
  const task=(async()=>{
   let blob=blobs.get(key);
   if(!blob){blob=await loader.fetch(key);if(!valid())throw new Error('图纸资源已失效');blobs.set(key,blob);}
   else {blobs.delete(key);blobs.set(key,blob);}
   while([...blobs.values()].reduce((total,item)=>total+item.size,0)>limits.bytes&&blobs.size){blobs.delete(blobs.keys().next().value!);}
   const value=await loader.parse(blob);
   if(!valid()){void value.destroy();throw new Error('图纸资源已失效');}
   while(documents.size>=limits.documents)release(documents.keys().next().value!);
   documents.set(key,value);return value;
  })();
  pending.set(key,task);try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
 }
 return {document,retain,releaseOwner,release,reset(){clear();owners.clear();listeners.clear();keyVersions.clear();},releaseUnused(key:string){if(!listeners.get(key)?.size)release(key);},clear,remove,subscribe(key:string,notify:()=>void){const set=listeners.get(key)||new Set();set.add(notify);listeners.set(key,set);return()=>{set.delete(notify);if(!set.size)listeners.delete(key);};},stats:()=>({documents:documents.size,bytes:[...blobs.values()].reduce((sum,b)=>sum+b.size,0)})};
}
// Dynamic imports keep PDF workers out of initial page bundles and resource unit tests.
export const productPdfResources=createProductPdfResourceCache({
 fetch:async(key:string)=>(await import('./productFiles')).productBinary(key),
 parse:async(blob:Blob)=>{const task=(await import('./productPdf')).loadProductPdf(new Uint8Array(await blob.arrayBuffer()));return {document:await task.promise,destroy:()=>task.destroy()};},
});
