import type { AssemblyProgress, ScheduleOrder, ScheduleSettings, ScheduleOverride, ScheduleStock, ScheduleRow } from "../../src/types/assemblyScheduling.ts";

interface SourceLine {
  id: string; material_id: string; material_number?: string; outside_material_number?: string;
  material_name?: string; material_model?: string; stock_id: string; aux_prop_id?: string;
  base_unit_name?: string; unit_name?: string; delivery_date?: string; base_qty?: number;
  qty?: number; out_qty?: number; out_base_qty?: number; real_out_qty?: number; coefficient?: number;
  cus_bill_no?: string; comment?: string; stock_name?: string; aux_prop_name?: string; un_out_qty?: number; real_un_out_qty?: number;
  close_state?: string; is_dropship?: boolean; return_qty?: number; batch_no?: string;
}
interface SourceOrder {
  id: string; bill_no?: string; customer_name?: string; bill_status: string;
  bill_date?: string; create_time?: string; modify_time?: string; audit_time?: string; remark?: string; emp_name?: string; dept_name?: string; customer_number?: string; io_status?: string; delivery_type_name?: string;
  bill_close_state: string; material_entity: SourceLine[];
}

export function quantity(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeOrder(order: SourceOrder, field: ScheduleSettings["shipmentField"]): ScheduleOrder[] {
  return order.material_entity.map(item => {
    const ordered = quantity(item.base_qty);
    const out = quantity(item.out_qty);
    const realOut = quantity(item.real_out_qty);
    const factor = item.base_unit_name && item.base_unit_name === item.unit_name ? 1 : quantity(item.coefficient);
    const shipped = field === "out_qty" ? quantity(item.out_base_qty) ?? (out !== null && factor ? out * factor : null)
      : field === "real_out_qty" && realOut !== null && factor ? realOut * factor : null;
    const disputed = quantity(item.return_qty) !== null && Number(item.return_qty) > 0;
    const active = order.bill_status === "C" && order.bill_close_state === "C" && item.close_state !== "0" && !item.is_dropship;
    const valid = ordered !== null && shipped !== null && shipped <= ordered && !disputed;
    return {
      id: `${order.id}:${item.id}`, orderNo: order.bill_no ?? "", customer: order.customer_name ?? "",
      materialId: item.material_id, code: item.material_number ?? "", customerCode: item.outside_material_number?.trim() ?? "",
      product: item.material_name ?? "", spec: item.material_model ?? "", warehouseId: item.stock_id,
      variant: item.aux_prop_id || "0", unit: item.base_unit_name ?? "", due: item.delivery_date ?? "",
      batch: item.batch_no?.trim() ?? "", ordered: ordered ?? 0, qty: valid ? ordered - shipped : null, eligible: active && valid, openForScheduling:active,
      status: order.bill_status, closed: order.bill_close_state, out, realOut,
      orderDate:order.bill_date, lineClosed:item.close_state,
      details:{
        "客户编码":order.customer_number,"客户订单号":item.cus_bill_no,"订单备注":order.remark,"行备注":item.comment,
        "审核时间":order.audit_time,"创建时间":order.create_time,"修改时间":order.modify_time,"业务员":order.emp_name,
        "部门":order.dept_name,"订单单位":item.unit_name,"订单单位数量":item.qty,"基本单位":item.base_unit_name,
        "单位换算系数":item.coefficient,"出库仓库":item.stock_name,"辅助属性":item.aux_prop_name,"批号":item.batch_no,
        "退货量":item.return_qty,"已出库基本量":item.out_base_qty,"未出库原值":item.un_out_qty,
        "实际未出库原值":item.real_un_out_qty,"配送方式":order.delivery_type_name,"出库状态原值":order.io_status,
      },
    };
  });
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === value;
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

export function pendingShipmentBatches(order: ScheduleOrder, override: ScheduleOverride, field: ScheduleSettings["shipmentField"], through: string) {
  const confirmed = order.qty === null ? 0 : Math.max(0,(order.ordered ?? 0) - order.qty);
  const baseline = override.shipmentBaseline;
  let available = baseline && baseline.field !== field ? 0 : Math.max(0,confirmed - (baseline?.qty ?? 0));
  return [...(override.batches ?? [])].sort((a,b) => a.date.localeCompare(b.date)).map(batch => {
    const shipped = batch.date <= through ? Math.min(available,batch.qty) : 0;
    available -= shipped;
    return {...batch,qty:batch.qty-shipped,shipped};
  });
}

function batchesFor(order: ScheduleOrder, config: ScheduleSettings, day: string, through: string) {
  const override = config.overrides[order.id];
  const qty = order.qty ?? 0;
  if (!override?.batches?.length) {
    return [{date:order.due,qty,issue:"",note:undefined,local:false}];
  }
  const pending = pendingShipmentBatches(order,override,config.shipmentField,through);
  const issue = pending.reduce((sum,batch)=>sum+batch.qty,0) > qty
    ? "分批数量超过当前订单余量，请核对已发数量" : "";
  return pending.filter(batch=>batch.date === day && batch.qty > 0)
    .map(batch=>({...batch,issue,local:true}));
}

export function supplyKey(item: Pick<ScheduleOrder, "materialId" | "warehouseId" | "variant" | "unit" | "batch">) {
  return JSON.stringify([item.materialId,item.warehouseId,item.variant,item.unit,item.batch || ""]);
}

function usableSupply(stock: ScheduleStock[]) {
  const pool = new Map<string, number>();
  for (const item of stock) {
    if (item.qty === null || item.restricted || item.batch) continue;
    const key = supplyKey(item);
    pool.set(key, (pool.get(key) ?? 0) + item.qty);
  }
  for (const item of stock) if (item.qty === null) pool.delete(supplyKey(item));
  return pool;
}

function allocateExpected(row: ScheduleRow, reports: AssemblyProgress[], config: ScheduleSettings, used: Map<string, number>) {
  const {order,due} = row;
  const need = row.demand-row.stock;
  row.expectedBatches = [];
  for (const item of config.overrides[order.id]?.expected ?? []) {
    const report = reports.find(row => row.id === item.reportId && row.productId === order.materialId && row.productionBatch);
    if (!report || item.date > due || item.date < report.date) continue;
    const key = JSON.stringify([report.productId,report.productionBatch]);
    const taken = Math.min(need-row.expected,Math.max(0,item.qty-(used.get(key) ?? 0)));
    if (!taken) continue;
    used.set(key,(used.get(key) ?? 0)+taken);
    row.expected += taken;
    row.expectedBatches.push({key,qty:taken});
  }
}

export function buildSchedule(date: string, orders: ScheduleOrder[], stock: ScheduleStock[], config: ScheduleSettings, reports: AssemblyProgress[], reserved: ScheduleRow[] = [], today = date): ScheduleRow[] {
  const pool = usableSupply(stock);
  const safeOrder = (order: ScheduleOrder) => !order.batch && !!order.unit && !!order.materialId;
  const expectedUsed = new Map<string,number>();
  const reservedKeys = new Set(reserved.map(row=>row.key));
  for (const row of reserved) {
    const key = supplyKey(row.order);
    if (pool.has(key)) pool.set(key,Math.max(0,(pool.get(key) ?? 0)-row.stock));
    for (const batch of row.expectedBatches ?? []) expectedUsed.set(batch.key,(expectedUsed.get(batch.key) ?? 0)+batch.qty);
  }
  const hoursUsed = new Map<string,number>();
  const recent = new Map<string,string>();
  for (const report of reports) if (report.date >= shiftDate(date,-3) && !recent.has(report.line)) recent.set(report.line,report.productId);
  const running = new Set(recent.values());
  const demand = orders.filter(o => o.eligible && (o.qty ?? 0) > 0).flatMap(order =>
    batchesFor(order,config,date,date < today ? date : today).map(batch => ({order,batch,key:`${order.id}:${batch.date}:${batch.local ? "分批" : "余额"}`,
      finish:validDate(batch.date) ? shiftDate(batch.date,-config.prepDays) : ""})))
    .filter(item => item.batch.date === date)
    .sort((a,b) => Number(!!config.overrides[b.order.id]?.urgent) - Number(!!config.overrides[a.order.id]?.urgent)
      || (a.order.orderDate || "9999").localeCompare(b.order.orderDate || "9999")
      || Number(running.has(b.order.materialId)) - Number(running.has(a.order.materialId))
      || a.key.localeCompare(b.key));
  const blocked = orders.filter(order => order.openForScheduling && order.qty === null).flatMap(order => {
    const override = config.overrides[order.id];
    const batches = override?.batches ?? [];
    const local = batches.find(batch=>batch.date === date);
    if (!local && (batches.length || order.due !== date)) return [];
    return [{order,demand:local?.qty ?? 0,note:local?.note ?? override?.note ?? ""}];
  });
  const result = demand.map(({order,batch,key,finish}) => {
    const override = config.overrides[order.id];
    const row: ScheduleRow = {key,order,due:batch.date,finish,demand:batch.qty,stock:0,expected:0,
      planned:0,short:batch.qty,line:"",hours:0,note:batch.note ?? override?.note ?? "",issue:batch.issue,quantityIssue:!!batch.issue};
    if (reservedKeys.has(key)) {
      row.issue = "其他日期已有此批次的正式任务，请先核实是否需要转排";
      return row;
    }
    if (row.issue || !finish || !safeOrder(order)) {
      row.issue ||= "交期或商品资料待确认";
      return row;
    }
    const k = supplyKey(order);
    if (!pool.has(k)) {
      row.issue = "可用成品库存未知或规格待确认";
      return row;
    }
    const available = pool.get(k) ?? 0;
    row.stock = Math.min(batch.qty,available);
    pool.set(k,available-row.stock);
    allocateExpected(row,reports,config,expectedUsed);
    row.short = batch.qty-row.stock-row.expected;
    if (!row.short) return row;
    if (!override?.ready) {
      row.issue = "齐套待确认或缺料";
      return row;
    }
    const choices = config.capacities.filter(c => c.materialId === order.materialId && (!override.line || override.line === c.line))
      .map(c => {
        const change = recent.get(c.line) && recent.get(c.line) !== order.materialId ? c.changeHours : 0;
        const rate = c.output/c.shiftHours;
        const qty = Math.max(0,Math.floor((c.hours-(hoursUsed.get(c.line) ?? 0)-change)*rate));
        return {c,change,rate,qty};
      }).sort((a,b) => Math.min(b.qty,row.short)-Math.min(a.qty,row.short) || a.change-b.change || a.c.line.localeCompare(b.c.line));
    const choice = choices[0];
    if (!choice || !choice.qty) {
      row.issue = choice ? "产线可用工时不足" : "缺少适配产线产能";
      return row;
    }
    row.planned = Math.min(Math.floor(row.short),choice.qty,override.maxQty ?? Infinity);
    if (row.planned) {
      row.line = choice.c.line;
      row.hours = row.planned/choice.rate + choice.change;
      hoursUsed.set(row.line,(hoursUsed.get(row.line) ?? 0)+row.hours);
      recent.set(row.line,order.materialId);
    }
    row.short -= row.planned;
    if (row.short > 0) row.issue = "仍有装配缺口";
    return row;
  });
  return [...result,...blocked.map(({order,demand,note}) => ({
    key:order.id,order,due:date,finish:"",demand,stock:0,expected:0,planned:0,short:demand,line:"",hours:0,note,
    issue:"订单数量或出库口径待核实",quantityIssue:true,
  }))];
}

export function assertPublishable(rows: ScheduleRow[], reconciled: boolean, revising = false) {
  if (!reconciled) throw Object.assign(new Error("请先完成订单及库存口径对账"),{status:409});
  const invalid = rows.find(row=>row.quantityIssue || row.order.qty === null || !Number.isFinite(row.demand) || row.demand <= 0);
  if (invalid) {
    const order = invalid.order.orderNo || invalid.order.id;
    throw Object.assign(new Error(`出货数量待核实（${order}）：${invalid.issue || "数量无效"}`),{status:409});
  }
  if (!revising && !rows.some(row => row.planned > 0 || (row.demand > 0 && validDate(row.due) && !row.issue))) throw Object.assign(new Error("没有可下达的出货需求或装配任务"),{status:409});
}

export function limitDailyInstruction(rows: ScheduleRow[], day:string) {
  const matches = rows.filter(row=>row.due === day);
  return {rows:matches.slice(0,20),omittedCount:Math.max(0,matches.length-20)};
}
