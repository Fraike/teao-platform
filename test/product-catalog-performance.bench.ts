// Synthetic data only; baseline is read from Git without changing the checkout.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createProductCatalog} from '../server/services/product-catalog.ts';
const sourcePath=fileURLToPath(new URL('../server/services/product-catalog.ts',import.meta.url));
const require=createRequire(sourcePath);
let baseline=execFileSync('git',['show','HEAD:server/services/product-catalog.ts'],{encoding:'utf8'});
baseline=stripTypeScriptTypes(baseline).replace(/from '([^']+)'/g,(_match,specifier:string)=>{
 const resolved=specifier.startsWith('.')?pathToFileURL(path.resolve(path.dirname(sourcePath),specifier)).href:specifier.startsWith('node:')?specifier:pathToFileURL(require.resolve(specifier)).href;
 return `from '${resolved}'`;
});
const old=await import(`data:text/javascript;base64,${Buffer.from(baseline).toString('base64')}`) as {createProductCatalog:typeof createProductCatalog};
const refs=Array.from({length:1323},(_,i)=>({id:`s${i}`,serialNo:`P${i}`,customer:'C',customerPartNo:'',model:'M',categoryKey:'',categoryName:'',versionNo:1,fields:{}}));
for(const [label,create] of [['before',old.createProductCatalog],['after',createProductCatalog]] as const){
 const dir=mkdtempSync(path.join(os.tmpdir(),'catalog-bench-')),store=create(dir);
 try {
  store.reconcileStandards(refs);store.list(refs);
  const begin=performance.now();
  for(let i=0;i<100;i++){store.reconcileStandards(refs);store.findByNumber('P1000',refs);}
  console.log(`${label}: 1323 products, 100 reconcile+lookup reads: ${(performance.now()-begin).toFixed(2)} ms`);
 }finally {store.close();rmSync(dir,{recursive:true,force:true});}
}
