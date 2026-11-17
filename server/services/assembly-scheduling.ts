import { createHash } from "node:crypto";
import { getDB, getAssemblyEntriesForRange } from "./production-store.js";
import { formatShanghaiDate } from "../config.js";
import { ASSEMBLY_LINES } from "../shared/assembly-lines.ts";
import { assertPublishable, buildSchedule, normalizeOrder, shiftDate, validDate, limitDailyInstruction, pendingShipmentBatches } from "./assembly-scheduling-rules.ts";
import { defaultScheduleSettings, scheduleError, validateOverride, validateScheduleSettings } from "./assembly-scheduling-config.ts";
import { readScheduleSnapshot, readStockSnapshot } from "./assembly-scheduling-sync.ts";
import type { ScheduleSnapshot, StockSnapshot, SyncProgress } from "./assembly-scheduling-sync.ts";
import { buildProductCategoryTree, indexProductCategories, countProductCategories } from "../shared/product-classification.ts";
import type { ScheduleStock, AssemblyProgress, ScheduleRow, ScheduleOverride, SchedulePreview, ScheduleSettings, ScheduleVersion } from "../../src/types/assemblyScheduling.ts";

interface ConfigRow {revision: number; body: string}
interface SnapshotRow {id: number; at: string; orders: number; lines: number; stocks: number; body: string}
const sync: SyncProgress = {running:false,done:0,total:0,error:""};
const stockSync = {running:false,error:""};
let cachedStock: {id:number;value:StockSnapshot} | undefined;
let initialized: ReturnType<typeof getDB> | undefined;
let cachedSnapshot: {id:number; value:ScheduleSnapshot} | undefined;

function database() {
  const db = getDB();
  if (initialized === db) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS assembly_schedule_config (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_snapshot (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, orders INTEGER NOT NULL, lines INTEGER NOT NULL, stocks INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, before_value TEXT NOT NULL, after_value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_version (day TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(day,version));
    CREATE TABLE IF NOT EXISTS assembly_schedule_sync_state (id INTEGER PRIMARY KEY CHECK(id=1), error TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_stock_snapshot (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, stocks INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_stock_state (id INTEGER PRIMARY KEY CHECK(id=1), error TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_checkpoint (id TEXT PRIMARY KEY, at INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assembly_schedule_draft (day TEXT PRIMARY KEY, at TEXT NOT NULL, body TEXT NOT NULL);
  `);
  initialized = db;
  return db;
}

function config() {
  const row = database().prepare("SELECT revision,body FROM assembly_schedule_config WHERE id=1").get() as ConfigRow | undefined;
  return {revision:row?.revision ?? 0, settings:row ? JSON.parse(row.body) as ScheduleSettings : defaultScheduleSettings};
}

function snapshotMeta() {
  return (database().prepare("SELECT id,at,orders,lines,stocks FROM assembly_schedule_snapshot ORDER BY id DESC LIMIT 1").get() ?? null) as Omit<SnapshotRow,"body"> | null;
}

function snapshot(id: number) {
  if (cachedSnapshot?.id === id) return cachedSnapshot.value;
  const row = database().prepare("SELECT body FROM assembly_schedule_snapshot WHERE id=?").get(id) as {body:string} | undefined;
  if (!row) scheduleError("库存和订单快照已更新，请重新加载",409);
  const value = JSON.parse(row.body) as ScheduleSnapshot;
  cachedSnapshot = {id,value};
  return value;
}

function syncError() {
  const row = database().prepare("SELECT error FROM assembly_schedule_sync_state WHERE id=1").get() as {error:string} | undefined;
  return sync.running ? "" : sync.error || row?.error || "";
}
function stockMeta() {
  return database().prepare("SELECT id,at,stocks FROM assembly_schedule_stock_snapshot ORDER BY id DESC LIMIT 1").get() as {id:number;at:string;stocks:number} | undefined;
}

function inventory(meta = stockMeta()) {
  if (!meta) {
    const legacy = snapshotMeta();
    return {stock:legacy ? snapshot(legacy.id).stock ?? [] : [],categories:buildProductCategoryTree([])};
  }
  if (cachedStock?.id === meta.id) return cachedStock.value;
  const row = database().prepare("SELECT body FROM assembly_schedule_stock_snapshot WHERE id=?").get(meta.id) as {body:string};
  const value = JSON.parse(row.body) as StockSnapshot;
  cachedStock = {id:meta.id,value};
  return value;
}

function stockError() {
  const row = database().prepare("SELECT error FROM assembly_schedule_stock_state WHERE id=1").get() as {error:string} | undefined;
  return stockSync.running ? "" : stockSync.error || row?.error || "";
}

function warehouseList(rows: ScheduleStock[]) {
  return [...new Map(rows.map(row=>[row.warehouseId,row.warehouse])).entries()].map(([id,name])=>({id,name}));
}

export function scheduleStatus() {
  const stockSnapshot = stockMeta() ?? null;
  return {...config(),snapshot:snapshotMeta(),sync:{...sync,error:syncError()},lines:ASSEMBLY_LINES,
    stockSnapshot,stockSync:{...stockSync,error:stockError()},warehouses:warehouseList(inventory(stockSnapshot ?? undefined).stock)};
}

function audit(actor: string, action: string, before: unknown, after: unknown) {
  database().prepare("INSERT INTO assembly_schedule_audit(at,actor,action,before_value,after_value) VALUES(?,?,?,?,?)")
    .run(new Date().toISOString(),actor,action,JSON.stringify(before),JSON.stringify(after));
}

function saveConfig(next: ScheduleSettings, revision: number, actor: string, action: string) {
  const db = database();
  db.transaction(() => {
    const current = config();
    if (current.revision !== revision) scheduleError("设置已更新，请重新加载",409);
    db.prepare("INSERT INTO assembly_schedule_config VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body")
      .run(revision+1,JSON.stringify(next));
    audit(actor,action,current.settings,next);
  })();
}

export function saveScheduleSettings(input: Omit<ScheduleSettings,"overrides">, revision: number, actor: string) {
  const {prepDays,draftTime,shipmentField,reconciliation,warehouseIds,capacities} = input;
  const next = {...config().settings,prepDays,draftTime,shipmentField,reconciliation,warehouseIds,capacities};
  validateScheduleSettings(next);
  saveConfig(next,revision,actor,"设置");
}

function findScheduleOrder(id: string, field: ScheduleSettings["shipmentField"]) {
  const meta = snapshotMeta();
  const source = meta && snapshot(meta.id).orders.find(order => order.material_entity.some(row => `${order.id}:${row.id}` === id));
  return source ? normalizeOrder(source,field).find(row=>row.id===id) : undefined;
}

function shipmentBaseline(previous: ScheduleOverride, order: NonNullable<ReturnType<typeof findScheduleOrder>>, field: ScheduleSettings["shipmentField"]) {
  if (previous.batches?.length) return previous.shipmentBaseline;
  return order.qty === null ? undefined : {field,qty:order.ordered-order.qty};
}

export function saveScheduleOverride(id: string, value: ScheduleOverride, revision: number, actor: string) {
  validateOverride(value);
  const {settings} = config();
  const order = findScheduleOrder(id,settings.shipmentField);
  if (!order) scheduleError("订单行已不存在",404);
  const previous = settings.overrides[id] ?? {};
  const baseline = value.batches?.length ? shipmentBaseline(previous,order,settings.shipmentField) : undefined;
  saveConfig({...settings,overrides:{...settings.overrides,[id]:{...value,shipmentBaseline:baseline}}},revision,actor,`需求调整 ${id}`);
}

export function saveDailyInstructionRow(input: {id:string;date:string;qty:number;note?:string;revision:number;mode:"add"|"edit"}, actor:string) {
  const {id,date,qty,note,revision,mode} = input;
  const today = formatShanghaiDate();
  if (!validDate(date) || date < today || (mode !== "add" && mode !== "edit")) scheduleError("只能维护当天或未来日期的指令单草案");
  const {settings,revision:currentRevision} = config();
  if (revision !== currentRevision) scheduleError("出货安排已更新，请刷新后重试",409);
  const order = findScheduleOrder(id,settings.shipmentField);
  if (!order?.openForScheduling || (order.qty ?? order.ordered) <= 0) scheduleError("请选择仍可安排出货的销售订单商品行");
  const draft = schedulePreview(date);
  const existing = draft.rows.some(row=>row.order.id===id);
  if (mode === "add" && existing) scheduleError("该商品行已在当天指令单，请直接编辑",409);
  if (mode === "edit" && !existing) scheduleError("该商品行已不在当天草案，请刷新",409);
  if (mode === "add" && draft.rows.length >= 20) scheduleError("当天指令单已满 20 条，请先调整现有出货安排",409);
  const override = settings.overrides[id] ?? {};
  validateOverride({batches:[{date,qty,note}]});
  const field = settings.shipmentField;
  const previous = pendingShipmentBatches(order,override,field,today);
  const shippedOnDate = previous.find(batch=>batch.date === date)?.shipped ?? 0;
  const batches = [...(override.batches ?? []).filter(batch=>batch.date!==date),{date,qty:qty+shippedOnDate,note}];
  const next = {...override,batches,shipmentBaseline:shipmentBaseline(override,order,field)};
  validateOverride(next);
  const pending = pendingShipmentBatches(order,next,field,today);
  const byDate = new Map(pending.map(batch=>[batch.date,batch.qty]));
  for (const row of overlappingRows(date,today)) {
    if (row.order.id === id && !byDate.has(row.due)) byDate.set(row.due,row.demand);
  }
  if ([...byDate.values()].reduce((sum,quantity)=>sum+quantity,0) > (order.qty ?? order.ordered)) {
    scheduleError("本次及其他日期已安排的出货量超过订单可安排数量");
  }
  saveConfig({...settings,overrides:{...settings.overrides,[id]:next}},revision,actor,`出货指令单 ${date} ${id}`);
}

function startOrderSync(actor: string): Promise<void> | undefined {
  if (sync.running) return;
  const db = database();
  const meta = snapshotMeta();
  const read = db.prepare("SELECT body FROM assembly_schedule_checkpoint WHERE id=? AND at >= ?");
  const write = db.prepare("INSERT OR REPLACE INTO assembly_schedule_checkpoint VALUES(?,?,?)");
  const previousSnapshot = meta ? snapshot(meta.id) : undefined;
  const state = db.prepare("INSERT INTO assembly_schedule_sync_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET error=excluded.error");
  state.run("上次同步未完成，请重新同步");
  Object.assign(sync,{running:true,done:0,total:0,error:""});
  return readScheduleSnapshot(sync,previousSnapshot,
    (id, modifiedAfter) => {
      const row = read.get(id,modifiedAfter) as {body:string} | undefined;
      return row ? JSON.parse(row.body) : undefined;
    },detail => {write.run(detail.id,Date.now(),JSON.stringify(detail));}).then(value => {
    const db = database();
    db.transaction(() => {
      const previous = snapshotMeta();
      const result = db.prepare("INSERT INTO assembly_schedule_snapshot(at,orders,lines,stocks,body) VALUES(?,?,?,?,?)")
        .run(value.at,value.orders.length,value.orders.reduce((sum,order) => sum + order.material_entity.length,0),0,JSON.stringify(value));
      const id = Number(result.lastInsertRowid);
      db.prepare("DELETE FROM assembly_schedule_snapshot WHERE id NOT IN (SELECT id FROM assembly_schedule_snapshot ORDER BY id DESC LIMIT 2)").run();
      audit(actor,"金蝶同步",previous,{id,at:value.at});
      db.prepare("DELETE FROM assembly_schedule_checkpoint").run();
      state.run("");
      cachedSnapshot = {id,value};
    })();
  }).catch(error => {
    sync.error = error instanceof Error && /^(销售订单|库存包含|无法识别)/.test(error.message) ? error.message : "金蝶数据读取失败，请检查连接及权限后重试";
    state.run(sync.error);
  }).finally(() => {sync.running = false;});
}

export function startStockSync(actor: string): Promise<void> | undefined {
  if (stockSync.running) return;
  const db = database();
  const state = db.prepare("INSERT INTO assembly_schedule_stock_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET error=excluded.error");
  state.run("上次库存同步未完成，请重新同步");
  Object.assign(stockSync,{running:true,error:""});
  return readStockSnapshot().then(value => {
    const id = db.transaction(() => {
      const previous = stockMeta();
      const result = db.prepare("INSERT INTO assembly_schedule_stock_snapshot(at,stocks,body) VALUES(?,?,?)")
        .run(value.at,value.stock.length,JSON.stringify(value));
      db.prepare("DELETE FROM assembly_schedule_stock_snapshot WHERE id NOT IN (SELECT id FROM assembly_schedule_stock_snapshot ORDER BY id DESC LIMIT 2)").run();
      state.run("");
      audit(actor,"金蝶库存同步",previous ?? null,{at:value.at,stocks:value.stock.length});
      return Number(result.lastInsertRowid);
    })();
    cachedStock = {id,value};
  }).catch(() => {
    stockSync.error = "金蝶库存读取失败，请重试";
    state.run(stockSync.error);
  }).finally(() => {stockSync.running = false;});
}

export function startScheduleSync(actor:string, afterSync?:()=>void) {
  if (sync.running || stockSync.running) return false;
  const orders = startOrderSync(actor);
  const stock = startStockSync(actor);
  void Promise.allSettled([orders,stock]).then(() => {
    if (!syncError() && !stockError()) afterSync?.();
  }).catch(() => console.error("[assembly-scheduling] 次日草案生成失败"));
  return true;
}

function snapshotData() {
  const meta = snapshotMeta();
  const {settings} = config();
  const data = {orders:meta ? snapshot(meta.id).orders : [],...inventory()};
  return {meta,data,settings};
}

export function scheduleProducts() {
  const {data} = snapshotData();
  const products = new Map<string,string>();
  for (const row of data.stock) products.set(row.materialId,[row.code,row.product].filter(Boolean).join(" · "));
  for (const order of data.orders) for (const row of order.material_entity) {
    if (row.material_id) products.set(row.material_id,[row.material_number,row.material_name,row.material_model].filter(Boolean).join(" · "));
  }
  return [...products].map(([value,label])=>({value,label:label || value})).sort((a,b)=>a.label.localeCompare(b.label,"zh-CN"));
}

export function scheduleLedger(kind: string, query: string, page: number,
  filters: {warehouse?:string; category?:string; status?:string; closed?:string} = {}) {
  const {meta,data,settings} = snapshotData();
  const q = query.trim().toLowerCase();
  const start = (page-1)*50;
  if (kind === "stock") {
    const categories = indexProductCategories(data.categories);
    const matchesCategory = (row:ScheduleStock) => {
      let node = categories.get(row.categoryId ?? "");
      if (filters.category === "unclassified") return !node;
      while (node) {
        if (node.id === filters.category) return true;
        node = categories.get(node.parentId ?? "");
      }
      return !filters.category;
    };
    const scoped = data.stock.filter(row => (!filters.warehouse || row.warehouseId === filters.warehouse)
      && [row.code,row.product,row.warehouse].some(x => x?.toLowerCase().includes(q)));
    const classified = scoped.flatMap(row => {
      const node = categories.get(row.categoryId ?? "");
      return node ? [{id:row.materialId,categoryId:node.id,category:node.name,group:node.group}] : [];
    });
    const rows = scoped.filter(matchesCategory);
    return {total:rows.length,rows:rows.slice(start,start+50),categories:countProductCategories(data.categories,classified),
      unclassified:new Set(scoped.filter(row=>!categories.has(row.categoryId ?? "")).map(row=>row.materialId)).size,
      warehouses:warehouseList(data.stock)};
  }
  const orders = data.orders.flatMap(order=>normalizeOrder(order,settings.shipmentField)).filter(row =>
    (!filters.status || row.status === filters.status) && (!filters.closed || row.closed === filters.closed)
      && [row.orderNo,row.product,row.spec,row.customer,row.code,row.customerCode].some(x=>x.toLowerCase().includes(q)));
  if (kind === "candidates") {
    const candidates = orders.filter(order=>order.openForScheduling && (order.qty ?? order.ordered) > 0);
    return {total:candidates.length,rows:candidates.slice(start,start+50)};
  }
  const stocks = new Map<string,ScheduleStock[]>();
  for (const row of data.stock) {
    if (!stocks.has(row.materialId)) stocks.set(row.materialId,[]);
    stocks.get(row.materialId)?.push(row);
  }
  const rows = orders.slice(start,start+50).map(row=>({...row,inventory:(stocks.get(row.materialId) ?? [])
    .filter(stock=>!!row.unit && stock.unit === row.unit && stock.variant === row.variant && (!row.batch || stock.batch === row.batch))}));
  return {snapshotId:meta?.id ?? 0,total:orders.length,rows};
}

function versionsFor(day: string) {
  return (database().prepare("SELECT body FROM assembly_schedule_version WHERE day=? ORDER BY version DESC").all(day) as {body:string}[])
    .map(row => JSON.parse(row.body) as ScheduleVersion);
}

export function withProgress(rows: ScheduleRow[], reports: AssemblyProgress[], settings: ScheduleSettings) {
  const active = rows.filter(row => row.demand > 0);
  const byKey = new Map<string,number>();
  const ambiguous = new Set<string>();
  for (const report of reports) {
    if (!report.productId || !Number.isFinite(report.dailyQty)) continue;
    const candidates = active.filter(row => (!row.line || row.line === report.line) && row.order.materialId === report.productId);
    const assigned = candidates.filter(row => settings.overrides[row.order.id]?.actualReportIds?.includes(report.id));
    const matching = assigned.length ? assigned : candidates.filter(row => row.order.customer?.trim() && row.order.customer.trim() === report.customer?.trim());
    if (matching.length === 1) {
      const key = matching[0].key;
      byKey.set(key,(byKey.get(key) ?? 0) + Math.max(0,report.dailyQty-(report.defects || 0)));
    } else for (const row of matching.length ? matching : candidates) ambiguous.add(row.key);
  }
  return rows.map((row):ScheduleRow => ({...row,actual:byKey.get(row.key),
    actualState:ambiguous.has(row.key) ? "ambiguous" : byKey.has(row.key) ? "matched" : "missing"}));
}

function withFinishedStock(rows: ScheduleRow[], stock: ScheduleStock[]) {
  const totals = new Map<string, number | null>();
  const materialIds = new Set<string>();
  const codes = new Map<string,string | null>();
  const normalize = (code:string | undefined) => code?.trim().toUpperCase() ?? "";
  const keyFor = (materialId:string, variant:string, unit:string, batch:string) => JSON.stringify([materialId,variant,unit,batch]);
  for (const item of stock) {
    if (item.warehouse?.trim() !== "成品仓" || !item.unit) continue;
    materialIds.add(item.materialId);
    const code = normalize(item.code);
    if (code) {
      const existing = codes.get(code);
      codes.set(code,existing === undefined || existing === item.materialId ? item.materialId : null);
    }
    const keys = new Set(["",item.batch].map(batch=>keyFor(item.materialId,item.variant,item.unit,batch)));
    for (const key of keys) {
      const previous = totals.get(key);
      totals.set(key,item.qty === null || previous === null ? null : (previous ?? 0)+item.qty);
    }
  }
  return rows.map(row=>{
    const {materialId,variant,unit,batch} = row.order;
    const id = materialIds.has(materialId) ? materialId : codes.get(normalize(row.order.code));
    return {...row,availableStock:id ? totals.get(keyFor(id,variant,unit,batch ?? "")) ?? undefined : undefined};
  });
}

function overlappingRows(day: string, today: string) {
  const entries = database().prepare(`
    SELECT v.day,v.body FROM assembly_schedule_version v
    WHERE day >= ? AND day <> ?
      AND version = (SELECT MAX(version) FROM assembly_schedule_version WHERE day=v.day)
  `).all(today,day) as {day:string;body:string}[];
  return entries.flatMap(entry => limitDailyInstruction((JSON.parse(entry.body) as ScheduleVersion).rows,entry.day).rows.filter(row => row.demand > 0 && (row.planned > 0 || row.stock > 0 || row.expected > 0)));
}

export function schedulePreview(day: string): SchedulePreview {
  if (!validDate(day)) scheduleError("计划日期无效");
  const {meta,data,settings} = snapshotData();
  const today = formatShanghaiDate();
  const progress: AssemblyProgress[] = getAssemblyEntriesForRange(shiftDate(today,-7),today);
  const dayReports: AssemblyProgress[] = day >= shiftDate(today,-7) && day <= today ? progress.filter(p=>p.date===day) : getAssemblyEntriesForRange(day,day);
  const orders = data.orders.flatMap(order => normalizeOrder(order,settings.shipmentField));
  const stock = data.stock.filter(row => row.finished && settings.warehouseIds.includes(row.warehouseId));
  const reserved = overlappingRows(day,today);
  const {rows,omittedCount} = limitDailyInstruction(buildSchedule(day,orders,stock,settings,progress,reserved,today),day);
  const versions = versionsFor(day);
  const previous = versions[0];
  if (previous) {
    const limited = limitDailyInstruction(previous.rows,day);
    previous.omittedCount ??= limited.omittedCount;
    previous.rows = withFinishedStock(withProgress(limited.rows,dayReports,settings),data.stock);
  }
  const recentIds = new Set(dayReports.filter(p => p.dailyQty > 0).map(p => JSON.stringify([p.line,p.productId])));
  const conflicts = (versions[0]?.rows ?? []).filter(row => row.planned > 0 && recentIds.has(JSON.stringify([row.line,row.order.materialId]))
    && !rows.some(next => next.order.id === row.order.id && next.due === row.due && next.line === row.line && next.planned >= row.planned));
  const stockSnapshotId = stockMeta()?.id ?? 0;
  const token = createHash("sha256").update(JSON.stringify([day,meta?.id,stockSnapshotId,config().revision,versions[0]?.version,rows,omittedCount,conflicts])).digest("hex");
  return {snapshotId:meta?.id ?? 0,stockSnapshotId,token,omittedCount,rows:withFinishedStock(withProgress(rows,dayReports,settings),data.stock),progress,versions,conflicts,progressAt:new Date().toISOString()};
}

export function publishedSchedule(day: string): SchedulePreview {
  if (!validDate(day)) scheduleError("计划日期无效");
  const versions = versionsFor(day);
  const limited = limitDailyInstruction(versions[0]?.rows ?? [],day);
  const rows = withFinishedStock(withProgress(limited.rows,getAssemblyEntriesForRange(day,day),config().settings),inventory().stock)
    .map(row=>({...row,order:{...row.order,details:undefined}}));
  return {snapshotId:versions[0]?.snapshotId ?? 0,token:"",rows,omittedCount:versions[0]?.omittedCount ?? limited.omittedCount,progressAt:new Date().toISOString(),progress:[],versions:versions.slice(0,1).map(version => ({...version,rows:[]}))};
}

export function publishSchedule(day: string, token: string, reason: string, actor: string, checked: boolean) {
  const db = database();
  return db.transaction(() => {
    const preview = schedulePreview(day);
    const meta = snapshotMeta();
    const {settings} = config();
    if (day < formatShanghaiDate()) scheduleError("不能发布过去日期的计划",409);
    if (!checked || typeof reason !== "string" || !reason.trim() || reason.length > 500) scheduleError("请核实临时仓及生产状态并填写发布原因");
    if (preview.token !== token) scheduleError("数据或计划版本已变更，请重新生成草案",409);
    const stock = stockMeta();
    if (sync.running || stockSync.running || syncError() || stockError() || !meta || !stock || Date.now()-Math.min(Date.parse(meta.at),Date.parse(stock.at)) > 86400000) scheduleError("请先完成最新金蝶数据同步",409);
    const reconciled = Boolean(settings.shipmentField && settings.reconciliation.trim() && settings.warehouseIds.length);
    assertPublishable(preview.rows,reconciled,!!preview.versions.length);
    if (preview.conflicts?.length) scheduleError("草案会减少或移动已经开工的任务，请保留原任务",409);
    const version = (preview.versions[0]?.version ?? 0)+1;
    const value = {version,snapshotId:meta.id,stockSnapshotId:stock.id,at:new Date().toISOString(),actor,reason:reason.trim(),omittedCount:preview.omittedCount,rows:preview.rows};
    db.prepare("INSERT INTO assembly_schedule_version VALUES(?,?,?)").run(day,version,JSON.stringify(value));
    audit(actor,`计划发布 ${day}`,preview.versions[0]?.version ?? 0,version);
    return value;
  })();
}

export function scheduledDraft(day: string) {
  if (!validDate(day)) scheduleError("计划日期无效");
  const row = database().prepare("SELECT at,body FROM assembly_schedule_draft WHERE day=?").get(day) as {at:string;body:string} | undefined;
  if (!row) return null;
  const draft = JSON.parse(row.body) as SchedulePreview;
  const limited = limitDailyInstruction(draft.rows,day);
  return {...draft,rows:withFinishedStock(limited.rows,inventory().stock),
    omittedCount:draft.omittedCount ?? limited.omittedCount,scheduledAt:row.at};
}

export function generateScheduledDraft() {
  const time = new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Shanghai"}).format(new Date());
  if (time !== config().settings.draftTime || !snapshotMeta()) return;
  const day = shiftDate(formatShanghaiDate(),1);
  const saveDraft = () => {
    const preview = schedulePreview(day);
    database().prepare("INSERT INTO assembly_schedule_draft VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET at=excluded.at,body=excluded.body")
      .run(day,new Date().toISOString(),JSON.stringify({...preview,versions:[]}));
  };
  saveDraft();
  startScheduleSync("定时草案",saveDraft);
}
