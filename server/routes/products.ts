import {productDrawingStatuses} from '../services/product-drawing-status.ts';
import {createProductImports} from '../services/product-imports.ts';
import express from 'express';
import type {Express,Request,Response,NextFunction} from 'express';
import {jwtAuth} from '../middleware/jwt-auth.js';
import {getDB as getStandardDB} from '../services/standard-store.js';
import {getTokenSessionUser,getUserById} from '../services/users.js';
import {DATA_DIR} from '../config.js';
import {fetchAllMaterials,fetchCategories,fetchMaterialDetail} from '../services/kingdee.js';
import {readKingdeeCache,writeKingdeeCache} from '../services/kingdee-cache.js';
import {createProductCatalog,productError} from '../services/product-catalog.ts';
import {createProductSync} from '../services/product-sync.ts';
import {publishedProductReferences} from '../services/product-reference.ts';
import {createProductDrawings,canManageDrawings} from '../services/product-drawings.ts';
import type {ProductCatalog} from '../services/product-catalog.ts';
import type {ProductActor,ProductDrawingInput,ProductMaterial} from '../../src/types/product.ts';

interface ProductRequest extends Request { user:ProductActor; }
interface RouteOptions {
  store?:ProductCatalog; references?:()=>ReturnType<typeof publishedProductReferences>;
  fetchMaterials?:()=>Promise<ProductMaterial[]>; fetchCategoryList?:()=>Promise<unknown[]>;
  fetchDetail?:(id:string)=>Promise<ProductMaterial>;
  writeCache?:(key:string,data:unknown[])=>void;
}
function userOf(req:Request) {
  const actor=(req as ProductRequest).user,account=getUserById(actor.id);
  return {...actor,name:account?.name||account?.username||actor.id};
}
function handleError(res:Response,error:unknown) {
  const status=error&&typeof error==='object'&&'status' in error?Number(error.status):500;
  console.error('[products]',error instanceof Error?error.message:'failed');
  res.status(status).json({error:status===500?'商品资料操作失败，请稍后重试':error instanceof Error?error.message:'操作失败'});
}
export function registerProductRoutes(app:Express,options:RouteOptions={}) {
  let store:ProductCatalog|undefined=options.store;
  let services:ReturnType<typeof initialize>|undefined;
  const references=options.references||(()=>publishedProductReferences(getStandardDB()));
  function initialize() {
    store ||= createProductCatalog(DATA_DIR);
    if(!store.getState<ProductMaterial[]|null>('materials',null)) {
      const cached=readKingdeeCache('materials');
      if(cached) {
        try {
          store.applySnapshot(cached.data,readKingdeeCache('categories')?.data||[]);
          store.setState('sync',{...store.syncState(),lastSuccessAt:cached.fetchedAt});
        } catch { store.setState('sync',{...store.syncState(),error:'现有金蝶缓存无效，请重新同步；产品标准及工程历史保留'}); }
      }
    }
    const sync=createProductSync(store,{materials:options.fetchMaterials||fetchAllMaterials,categories:options.fetchCategoryList||fetchCategories,writeCache:options.writeCache||writeKingdeeCache});
    return {store,sync,drawings:createProductDrawings(store,user=>{ const live=getTokenSessionUser(user);return live?{...user,...live,name:getUserById(live.id)?.name||live.username}:null; })};
  }
  const get=()=>services ||= initialize();
  function catalog() {
    const refs=references(),svc=get();svc.store.reconcileStandards(refs);return {svc,refs};
  }
  function product(id:string) {
    const {svc,refs}=catalog(),data=svc.store.find(id,refs);
    if(!data) throw productError('商品不存在或没有已发布产品标准',404);
    return {svc,data};
  }
  const route=(handler:(req:Request,res:Response)=>unknown)=>(req:Request,res:Response)=>Promise.resolve().then(()=>handler(req,res)).catch(error=>handleError(res,error));
  const manager=(req:Request,_res:Response,next:NextFunction)=>{
    if(!canManageDrawings(userOf(req))) return next(productError('没有图纸管理权限',403));next();
  };
  app.get('/api/products',jwtAuth,route((req,res)=>{
    const {svc,refs}=catalog(),data=svc.store.list(refs).filter(p=>p.productionAvailable||canManageDrawings(userOf(req)));
    res.json({ok:true,data,categories:svc.store.categoryTree(data),sync:svc.store.syncState()});
  }));
  app.get('/api/products/resolve',jwtAuth,route((req,res)=>{
    const {svc,refs}=catalog(),data=svc.store.findByNumber(String(req.query.number||''),refs);
    if(!data) throw productError('未找到此内部料号的商品档案',404);
    res.json({ok:true,data});
  }));
  app.get('/api/products/sync',jwtAuth,route((_req,res)=>res.json({ok:true,sync:get().store.syncState()})));
  app.post('/api/products/sync',jwtAuth,route(async(req,res)=>{
    const u=userOf(req);
    if(u.role!=='admin'&&!u.permissions.some(p=>['basic_data','product_drawing_manage'].includes(p))) throw productError('没有同步金蝶的权限',403);
    res.json({ok:true,sync:await get().sync.run()});
  }));
  const importServices=()=>{const {svc}=catalog();return createProductImports(svc.store,svc.drawings,()=>svc.store.list(references()));};
  app.post('/api/products/imports',jwtAuth,manager,route((req,res)=>res.status(201).json({ok:true,data:importServices().create(req.body?.name,userOf(req))})));
  app.post('/api/products/imports/:batchId/scan',jwtAuth,manager,express.raw({type:'application/octet-stream',limit:'25mb'}),route(async(req,res)=>{
    const data=await importServices().scan(String(req.params.batchId),String(req.query.path||''),req.body,userOf(req));
    res.json({ok:true,data});
  }));
  app.post('/api/products/imports/:batchId/confirm',jwtAuth,manager,route(async(req,res)=>{
    const data=await importServices().confirm(String(req.params.batchId),req.body,userOf(req));
    res.json({ok:true,data});
  }));
  app.get('/api/products/imports',jwtAuth,manager,route((req,res)=>res.json({ok:true,data:importServices().list(userOf(req))})));
  app.get('/api/products/imports/:batchId',jwtAuth,manager,route((req,res)=>res.json({ok:true,data:importServices().view(String(req.params.batchId),userOf(req))})));
  app.get('/api/products/imports/:batchId/entries/:entryId/content',jwtAuth,manager,route((req,res)=>{
    const {bytes,filename}=importServices().preview(String(req.params.batchId),String(req.params.entryId),userOf(req));
    res.set({'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(filename)}`}).send(bytes);
  }));
  app.post('/api/products/drawing-status',jwtAuth,route((req,res)=>{const {svc,refs}=catalog();res.json({ok:true,data:productDrawingStatuses(svc.store,svc.store.list(refs),req.body?.items)});}));
  app.get('/api/products/:id',jwtAuth,route((req,res)=>{
    const {svc,data}=product(String(req.params.id));
    res.json({ok:true,data,drawings:data.productionAvailable||canManageDrawings(userOf(req))?svc.drawings.list(data.id,userOf(req)):[],canManage:canManageDrawings(userOf(req)),sync:svc.store.syncState()});
  }));
  const detailPending=new Map<string,Promise<ProductMaterial>>();
  app.get('/api/products/:id/kingdee',jwtAuth,route(async(req,res)=>{
    const {svc,data}=product(String(req.params.id));
    const viewer=userOf(req);
    if(viewer.role!=='admin'&&!viewer.permissions.some(p=>['basic_data','business','production','product_drawing_manage'].includes(p))) throw productError('没有金蝶经营详情查看权限',403);
    if(!data.kingdeeId||data.kingdeeMissing||data.issues.some(i=>i.includes('关联冲突'))) throw productError('商品未关联有效金蝶档案',409);
    const key=`detail:${data.kingdeeId}`;
    const cached=svc.store.getState<{data:ProductMaterial;fetchedAt:string}|null>(key,null);
    if(cached&&Date.now()-Date.parse(cached.fetchedAt)<3600000) return res.json({ok:true,...cached,stale:false});
    try {
      let pending=detailPending.get(key);
      if(!pending) { pending=(options.fetchDetail||fetchMaterialDetail)(data.kingdeeId);detailPending.set(key,pending); }
      const detail=await pending;
      if(String(detail.id)!==data.kingdeeId||detail.number!==data.internalNumber) throw productError('金蝶详情与内部料号不一致',409);
      const result={data:detail,fetchedAt:new Date().toISOString()};svc.store.setState(key,result);
      res.json({ok:true,...result,stale:false});
    }catch(error){if(cached)res.json({ok:true,...cached,stale:true});else throw error;}
    finally{detailPending.delete(key);}
  }));
  app.post('/api/products/:id/files',jwtAuth,manager,express.raw({type:'application/octet-stream',limit:'25mb'}),route(async(req,res)=>{
    const {svc,data}=product(String(req.params.id));
    let input:ProductDrawingInput;
    try{input=JSON.parse(String(req.query.metadata||''));}catch{throw productError('文件资料格式错误');}
    if(!input||typeof input!=='object')throw productError('文件资料格式错误');
    const uploaded=await svc.drawings.upload(data,input,req.body,userOf(req));
    const latest=product(String(req.params.id)).data;
    res.status(201).json({ok:true,data:svc.drawings.publish(latest,uploaded.id,userOf(req))});
  }));
  for(const action of ['publish','retire'] as const) app.post(`/api/products/:id/files/:fileId/${action}`,jwtAuth,manager,route((req,res)=>{
    const {svc,data}=product(String(req.params.id));svc.drawings[action](data,String(req.params.fileId),userOf(req));res.json({ok:true});
  }));
  app.get('/api/products/:id/files/:fileId/content',jwtAuth,route((req,res)=>{
    const {svc,data}=product(String(req.params.id));
    if(!data.productionAvailable&&!canManageDrawings(userOf(req))) throw productError('商品已无有效来源，不能用于生产',409);
    const {file,bytes}=svc.drawings.read(data.id,String(req.params.fileId),userOf(req));
    res.set({'Content-Type':file.kind==='pdf'?'application/pdf':'application/octet-stream','Content-Disposition':`${file.kind==='pdf'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(bytes);
  }));
  app.post('/api/products/:id/files/:fileId/print',jwtAuth,route(async(req,res)=>{
    const {svc,data}=product(String(req.params.id));const bytes=await svc.drawings.print(data,String(req.params.fileId),userOf(req));
    // jwtAuth checked the live account before rendering; read the live session again before delivery.
    const live=getTokenSessionUser(userOf(req));
    if(!live) throw productError('登录状态已失效',401);
    (req as ProductRequest).user={...userOf(req),...live};
    const latest=product(String(req.params.id)).data;
    if(!latest.productionAvailable) throw productError('商品当前已无有效来源，不能打印生产图纸',409);
    svc.drawings.read(data.id,String(req.params.fileId),userOf(req));
    res.set({'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(bytes);
  }));
  app.use('/api/products',(error:unknown,_req:Request,res:Response,next:NextFunction)=>{ if(res.headersSent) { next(error); return; } handleError(res,error); });
  return {start:(cron:Parameters<ReturnType<typeof createProductSync>['start']>[0])=>get().sync.start(cron),stop:()=>services?.sync.stop()};
}
