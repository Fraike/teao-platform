import type {TabPageRecord} from '../types/tabPage';
const scopes=new Map<string,Map<string,TabPageRecord>>();
const listeners=new Set<()=>void>();
let version=0;
export const subscribeTabPages=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener)};};
export const getTabPagesVersion=()=>version;
export function notifyTabPages(){version++;listeners.forEach(listener=>listener());}
export function getTabPage(scope:string,key:string):TabPageRecord {
 let pages=scopes.get(scope);if(!pages){pages=new Map();scopes.set(scope,pages)}
 let record=pages.get(key);
 if(!record){record={scope,key,alive:true,instance:0,snapshot:new Map(),initialized:new Map(),adapted:false,busy:new Map(),dirty:new Map(),disposers:new Map(),lastUsed:0,scrollTop:0,scrollLeft:0};pages.set(key,record)}
 return record;
}
export function writeTabSnapshot(record:TabPageRecord,key:string,value:unknown,instance=record.instance){
 if(instance!==record.instance||!record.alive||scopes.get(record.scope)?.get(record.key)!==record)return false;
 record.snapshot.set(key,value);return true;
}
export function disposeTabPage(scope:string,key:string){
 const pages=scopes.get(scope);const record=pages?.get(key);if(!record)return;
 record.alive=false;pages?.delete(key);
 record.disposers.forEach(dispose=>{try{dispose()}catch(error){console.error('Tab page disposal failed',error)}});
 record.disposers.clear();record.snapshot.clear();record.initialized.clear();notifyTabPages();
}
export function clearTabScope(scope:string){
 const pages=scopes.get(scope);if(!pages)return;
 [...pages.keys()].forEach(key=>disposeTabPage(scope,key));scopes.delete(scope);
}
export function selectHotPages(pages:readonly TabPageRecord[],activeKey:string,maxHot=5){
 const canRecycle=(p:TabPageRecord)=>p.adapted||(p.adapterDeclared&&p.snapshot.size===0&&![...p.dirty.values()].some(Boolean));
 const protectedPages=pages.filter(p=>p.key===activeKey||!canRecycle(p)||[...p.busy.values()].some(Boolean));
 const eligible=pages.filter(p=>!protectedPages.includes(p)).sort((a,b)=>b.lastUsed-a.lastUsed);
 return [...protectedPages,...eligible.slice(0,Math.max(0,maxHot-protectedPages.length))];
}
export async function guardTabClose(scope:string,keys:readonly string[],confirmDirty:(keys:readonly string[])=>boolean|Promise<boolean>){
 const records=keys.map(key=>scopes.get(scope)?.get(key)).filter((p):p is TabPageRecord=>!!p);
 if(records.some(p=>[...p.busy.values()].some(Boolean)))return false;
 const dirty=records.filter(p=>[...p.dirty.values()].some(Boolean)).map(p=>p.key);
 if(dirty.length&&!await confirmDirty(dirty))return false;
 return !records.some(p=>[...p.busy.values()].some(Boolean));
}

/** Start a new mounted page, dropping registrations belonging to its cold predecessor. */
export function startTabInstance(record:TabPageRecord){
 record.instance++;record.busy.clear();record.dirty.clear();
 return record.instance;
}
export function invalidateTabInstance(record:TabPageRecord){record.instance++;}
