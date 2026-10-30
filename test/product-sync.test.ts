import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs"; import os from "node:os"; import path from "node:path";
import {createProductCatalog} from "../server/services/product-catalog.ts";
import {createProductSync} from "../server/services/product-sync.ts";
const store=createProductCatalog(mkdtempSync(path.join(os.tmpdir(),"product-sync-")));
let fail=false,calls=0;
const sync=createProductSync(store,{materials:async()=>{calls++;await new Promise(r=>setTimeout(r,10));if(fail)throw new Error("离线");return [{id:"1",number:"P1",name:"商品"}];},categories:async()=>[],writeCache:()=>{}});
try{
 const [a,b]=await Promise.all([sync.run(),sync.run()]);
 assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(store.syncState().running,false);
 assert.ok(store.syncState().lastSuccessAt);const success=store.syncState().lastSuccessAt;
 fail=true;await assert.rejects(()=>sync.run(),/离线/);
 assert.equal(store.list([]).length,1);assert.equal(store.syncState().lastSuccessAt,success);
 assert.equal(store.syncState().error,"离线");
 let expression="";const task={stop:()=>{}};
 sync.start({schedule:(expr)=>{expression=expr;return task;}});
 assert.equal(expression,"0 * * * *");sync.stop();
 const diskFail=createProductSync(store,{materials:async()=>[{id:'2',number:'P2',name:'不应提交'}],categories:async()=>[],writeCache:()=>{throw new Error('磁盘不可写');}});
 await assert.rejects(()=>diskFail.run(),/磁盘/);
 assert.equal(store.list([]).some(p=>p.internalNumber==='P2'),false,'缓存失败时目录事务必须回滚');
 console.log("product sync tests passed");
}finally{store.close();}
