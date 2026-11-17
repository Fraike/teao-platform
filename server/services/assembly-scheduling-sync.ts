import { callApi, ensureToken, fetchAllPages, fetchAllMaterials, fetchCategories } from "./kingdee.js";
import { readKingdeeCache, writeKingdeeCache } from "./kingdee-cache.js";
import { splitProductionMaterials } from "./production-product.js";
import { quantity } from "./assembly-scheduling-rules.ts";
import type { ProductCategoryNode } from "../../src/types/product.ts";
import { buildProductCategoryTree } from "../shared/product-classification.ts";
import type { ScheduleStock } from "../../src/types/assemblyScheduling.ts";

type Detail = Parameters<typeof import("./assembly-scheduling-rules.ts").normalizeOrder>[0];
export interface ScheduleSnapshot {
  at: string;
  startedAt?: string;
  fullAt?: string;
  schema?: number;
  orders: Detail[];
  stock?: ScheduleStock[]; // Legacy combined snapshots.
}
export interface SyncProgress {running: boolean; done: number; total: number; error: string}
export interface StockSnapshot {at: string; stock: ScheduleStock[]; categories: ProductCategoryNode[]}

const batchSize = 50;
const defaultConcurrency = 4;
const requestsPerSecond = 6;

export async function readOrderBatches<T>(items: T[], work: (item:T, acquire:()=>Promise<void>, throttle:()=>void)=>Promise<void>) {
  let nextStart = 0;
  let concurrency = defaultConcurrency;
  let blockedUntil = 0;
  const delay = (ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms));
  const throttle = () => { concurrency = 1; blockedUntil = Math.max(blockedUntil,Date.now()+2000); };
  const acquire = async () => {
    for (;;) {
      const wait = Math.max(nextStart,blockedUntil)-Date.now();
      if (wait <= 0) {
        nextStart = Date.now()+Math.ceil(1000/(concurrency === 1 ? 2 : requestsPerSecond));
        return;
      }
      await delay(wait);
    }
  };
  for (let batch=0;batch<items.length;batch+=batchSize) {
    const end = Math.min(items.length,batch+batchSize);
    for (let index=batch;index<end;) {
      const group = items.slice(index,Math.min(end,index+concurrency));
      const results = await Promise.allSettled(group.map(item=>work(item,acquire,throttle)));
      const failed = results.find(result=>result.status === "rejected");
      if (failed) throw failed.reason;
      index += group.length;
    }
  }
}

export async function readScheduleSnapshot(progress: SyncProgress, previous: ScheduleSnapshot | undefined,
  readCheckpoint: (id: string, modifiedAfter: number) => Detail | undefined, writeCheckpoint: (detail: Detail) => void): Promise<ScheduleSnapshot> {
  const startedAt = new Date().toISOString();
  const { token, domain } = await ensureToken();
  const full = previous?.schema !== 2 || !previous?.fullAt || Date.now()-Date.parse(previous.fullAt) > 7*86400000;
  const list: {id: string}[] = await fetchAllPages("/jdy/v2/scm/sal_order");
  const byOrder = new Map(previous?.orders.map(order => [order.id,order]));
  const changed: {id:string}[] = full ? list : await fetchAllPages("/jdy/v2/scm/sal_order",{
    modify_start_time:String(Date.parse(previous.startedAt ?? previous.at)-300000),
  });
  const changedIds = new Set(changed.map(order => order.id));
  const pending = list.filter(order => full || changedIds.has(order.id) || !byOrder.has(order.id));
  if (new Set(list.map(o => o.id)).size !== list.length || list.some(o => !o.id)) throw new Error("销售订单列表包含重复或无效 ID");
  progress.total = pending.length;
  const resumeFloor = Date.now()-86400000;
  const recentlyChanged: {id:string}[] = !pending.length ? [] : await fetchAllPages("/jdy/v2/scm/sal_order",{modify_start_time:String(resumeFloor-300000)});
  const recentIds = new Set(recentlyChanged.map(order => order.id));
  await readOrderBatches(pending,async ({id},acquire,throttle) => {
    const checkpoint = !recentIds.has(id) ? readCheckpoint(id,resumeFloor) : undefined;
    if (checkpoint) {
      byOrder.set(id,checkpoint);
      progress.done++;
      return;
    }
    let response;
    for (let attempt=0;attempt<3;attempt++) {
      await acquire();
      try {
        response = await callApi("GET","/jdy/v2/scm/sal_order_detail",{id},null,{"app-token":token,"X-GW-Router-Addr":domain},1);
        if (response.errcode === 0) break;
        if (response.status_code === 429 || /限流|频率|too many|rate.limit/i.test(response.description ?? "")) throttle();
      } catch (error) {
        if (attempt === 2) throw error;
      }
      if (attempt < 2) await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
    }
    const order = response?.data as Detail | undefined;
    if (response?.errcode !== 0 || order?.id !== id || !Array.isArray(order.material_entity)) {
      throw new Error("销售订单详情读取不完整，请重试");
    }
    const ids = order.material_entity.map(row => row.id);
    if (ids.some(x => !x) || new Set(ids).size !== ids.length) throw new Error("销售订单包含无效或重复的明细 ID");
    const detail = stripOrder(order);
    byOrder.set(id,detail);
    writeCheckpoint(detail);
    progress.done++;
  });
  const orders = list.map(({id}) => {
    const order = byOrder.get(id);
    if (!order) throw new Error("销售订单详情缺失");
    return order;
  });
  return {at:new Date().toISOString(),startedAt,fullAt:full ? startedAt : previous?.fullAt,orders,schema:2};
}

export async function readStockSnapshot(): Promise<StockSnapshot> {
  const materials = await referenceData("materials",fetchAllMaterials);
  const categories = await referenceData("categories",fetchCategories);
  const finishedIds = new Set<string>(splitProductionMaterials(materials,categories).finishedProducts.map((m: {id:string}) => String(m.id)));
  if (!finishedIds.size) throw new Error("无法识别金蝶成品分类");
  const byId = new Map(materials.map(m => [m.id,m]));
  const balances = await fetchAllPages("/jdy/v2/scm/inventory");
  const stock: ScheduleStock[] = balances.map(row => {
    const material = byId.get(row.material_id);
    return {
      materialId:row.material_id, warehouseId:row.stock_id, warehouse:row.stock_name,
      variant:row.aux_prop_id || "0", batch:row.batch_no || "", locationId:row.sp_id || "0", location:row.sp_name, unit:material?.base_unit_name ?? "",
      categoryId:String(material?.parent_id || ""), code:row.material_number, product:row.material_name, qty:quantity(row.valid_qty),
      onHand:quantity(row.qty), finished:finishedIds.has(String(row.material_id)),
      restricted:!!row.valid_date || !!row.kf_date || !!row.sp_name,
    };
  });
  const keys = stock.map(row => JSON.stringify([row.materialId,row.warehouseId,row.variant,row.batch,row.locationId]));
  if (new Set(keys).size !== keys.length || stock.some(row => !row.materialId || !row.warehouseId)) throw new Error("库存包含重复或无效的明细");
  return {at:new Date().toISOString(),stock,categories:buildProductCategoryTree(categories)};
}

async function referenceData<T>(key: string, fetchData: () => Promise<T[]>) {
  const cached = readKingdeeCache(key);
  if (cached?.fetchedAt && Date.now()-Date.parse(cached.fetchedAt) < 86400000) return cached.data as T[];
  const rows = await fetchData();
  if (rows.length) writeKingdeeCache(key,rows);
  return rows;
}

function stripOrder(order: Detail): Detail {
  return {
    id:order.id, bill_no:order.bill_no, customer_name:order.customer_name,
    bill_status:order.bill_status,bill_close_state:order.bill_close_state,
    bill_date:order.bill_date,create_time:order.create_time,modify_time:order.modify_time,audit_time:order.audit_time,
    remark:order.remark,emp_name:order.emp_name,dept_name:order.dept_name,customer_number:order.customer_number,
    io_status:order.io_status,delivery_type_name:order.delivery_type_name,
    material_entity:order.material_entity.map(row => {
      const {id,material_id,material_number,outside_material_number,material_name,material_model,stock_id,aux_prop_id,
        base_unit_name,unit_name,delivery_date,base_qty,qty,out_qty,out_base_qty,real_out_qty,coefficient,
        close_state,is_dropship,return_qty,batch_no,cus_bill_no,comment,stock_name,aux_prop_name,un_out_qty,real_un_out_qty} = row;
      return {id,material_id,material_number,outside_material_number,material_name,material_model,stock_id,aux_prop_id,
        base_unit_name,unit_name,delivery_date,base_qty,qty,out_qty,out_base_qty,real_out_qty,coefficient,
        close_state,is_dropship,return_qty,batch_no,cus_bill_no,comment,stock_name,aux_prop_name,un_out_qty,real_un_out_qty};
    }),
  };
}
