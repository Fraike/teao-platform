import type { ProductMaterial } from '../../src/types/product.ts';
import type { ProductCatalog } from './product-catalog.ts';
interface SyncDependencies {
  materials: () => Promise<ProductMaterial[]>;
  categories: () => Promise<unknown[]>;
  writeCache: (key: string, data: unknown[]) => void;
}
interface Cron { schedule: (expression: string, callback: () => void, options?: {timezone:string}) => {stop:()=>void}; }
export function createProductSync(store: ProductCatalog, deps: SyncDependencies) {
  let pending: Promise<ReturnType<ProductCatalog['syncState']>>|null = null;
  let task: {stop:()=>void}|null = null;
  const previous = store.syncState();
  if (previous.running) store.setState('sync',{...previous,running:false,error:'上次同步中断，等待重新同步'});
  function run() {
    if (pending) return pending;
    store.setState('sync',{...store.syncState(),running:true,lastAttemptAt:new Date().toISOString(),error:null});
    pending = (async () => {
      try {
        const [materials,categories] = await Promise.all([deps.materials(),deps.categories()]);
        if (!Array.isArray(categories)) throw new Error('金蝶商品分类格式错误');
        const result = store.db.transaction(() => {
          const counts=store.applySnapshot(materials,categories);
          deps.writeCache('materials',materials); deps.writeCache('categories',categories);
          store.setState('sync',{...store.syncState(),...counts,running:false,lastSuccessAt:new Date().toISOString(),error:null});
          return counts;
        })();
        console.info(JSON.stringify({event:'product_sync',status:'success',...result}));
        return store.syncState();
      } catch (error) {
        store.setState('sync',{...store.syncState(),running:false,error:error instanceof Error?error.message:'同步失败'});
        throw error;
      } finally { pending = null; }
    })();
    return pending;
  }
  return {
    run,
    start(cron: Cron) {
      if (task) return;
      task=cron.schedule('0 * * * *',()=>{void run().catch(error=>console.error('[product-sync]',error.message));},{timezone:'Asia/Shanghai'});
      const last=store.syncState().lastSuccessAt;
      if ((!last || Date.now()-Date.parse(last)>=3600000) && process.env.KINGDEE_CLIENT_ID) {
        void run().catch(error=>console.error('[product-sync]',error.message));
      }
    },
    stop() { task?.stop(); task=null; },
  };
}
