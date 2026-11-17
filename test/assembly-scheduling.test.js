import assert from "node:assert/strict";
import test from "node:test";
import {buildSchedule, normalizeOrder, assertPublishable} from "../server/services/assembly-scheduling-rules.ts";

const date = "2026-11-15";
const order = (id, qty = 60) => ({id, materialId:"m", warehouseId:"w", variant:"0", unit:"个", due:date, qty, eligible:true});
const supply = {materialId:"m", warehouseId:"w", variant:"0", unit:"个", qty:30};
const capacity = {line:"1#", materialId:"m", hours:8, shiftHours:8, output:50, changeHours:0};
const settings = {prepDays:0, capacities:[capacity], overrides:{a:{ready:true}, b:{ready:true}}};

test("shared inventory and line capacity are only allocated once", () => {
  const result = buildSchedule(date, [order("a"),order("b")], [supply], settings, []);
  assert.deepEqual(result.map(r => [r.stock, r.planned, r.short]), [[30,30,0],[0,20,40]]);
});

test("split quantities replace order demand and late production cannot cover it", () => {
  const config = {...settings, overrides:{a:{ready:true, batches:[{date, qty:40}], expected:[{reportId:1, qty:10, date:"2026-11-16"}]}}};
  const result = buildSchedule(date, [{...order("a"),due:"2026-11-21"}], [supply], config, [{id:1,productId:"m",productionBatch:"B",line:"1#"}]);
  assert.deepEqual(result.map(r => [r.demand,r.expected,r.planned]), [[40,0,10]]);
});

test("unknown inventory and unverified quantity policy prevent release", () => {
  const rows = buildSchedule(date,[order("a")],[],settings,[]);
  assert.equal(rows[0].planned,0);
  assert.throws(() => assertPublishable(rows, false), /对账/);
});

test("sales order has a base-unit line identifier and cannot infer shipment before reconciliation", () => {
  const [row] = normalizeOrder({id:"o", bill_status:"C",bill_close_state:"C",material_entity:[{id:"l",material_id:"m",stock_id:"w",base_unit_name:"个",base_qty:100,qty:100,out_qty:15,real_out_qty:0,delivery_date:date}]}, "");
  assert.equal(row.id,"o:l");
  assert.equal(row.eligible,false);
  assert.equal(row.qty,null);
});


test("a published task reserves stock against other plan dates", () => {
  const first = buildSchedule(date,[order("a")],[supply],settings,[]);
  const next = buildSchedule(date,[order("b")],[supply],settings,[],first);
  assert.equal(next[0].stock,0);
  assert.equal(next[0].planned,50);
});

test("a stock-only shipment can be published", () => {
  const rows = buildSchedule(date,[order("a",30)],[supply],settings,[]);
  assert.equal(rows[0].planned,0);
  assert.doesNotThrow(() => assertPublishable(rows,true));
});

test("local shipping quantity takes precedence over the linked order on the same day", () => {
  const config = {...settings,overrides:{a:{batches:[{date,qty:10}]}}};
  const result = buildSchedule(date,[order("a"),order("b")],[supply],config,[]);
  assert.deepEqual(result.map(row=>[row.order.id,row.demand]),[["a",10],["b",60]]);
});

test("a daily instruction excludes overdue and advance assembly demands before allocating inventory", () => {
  const rows = buildSchedule(date,[
    {...order("overdue",30),due:"2026-11-14"},
    {...order("later",30),due:"2026-11-16"},
    order("today",30),
  ],[supply],{...settings,prepDays:2},[]);
  assert.deepEqual(rows.map(row=>[row.order.id,row.demand,row.stock]),[["today",30,30]]);
});

test("a daily instruction selects only its first 20 rows in priority order", async () => {
  const {limitDailyInstruction} = await import("../server/services/assembly-scheduling-rules.ts");
  const rows = Array.from({length:23},(_,index)=>({due:index===0 ? "2026-11-14" : date,key:String(index)}));
  const result = limitDailyInstruction(rows,date);
  assert.equal(result.rows.length,20);
  assert.equal(result.rows[0].key,"1");
  assert.equal(result.rows.at(-1).key,"20");
  assert.equal(result.omittedCount,2);
});

test("an explicit local row is visible while shipment reconciliation is pending", () => {
  const row = {...order("a"),openForScheduling:true,eligible:false,qty:null,due:"2026-11-17"};
  const config = {...settings,overrides:{a:{batches:[{date,qty:8,note:"本地安排"}]}}};
  const [local] = buildSchedule(date,[row],[],config,[]);
  assert.equal(local.demand,8);
  assert.equal(local.note,"本地安排");
  assert.equal(local.planned,0);
  assert.throws(()=>assertPublishable([local],false),/对账/);
});

test("a valid shipment cannot carry an unverified or overbooked row into publication", () => {
  const valid = buildSchedule(date,[order("valid",30)],[supply],settings,[])[0];
  const unverified = {...valid,order:{...valid.order,id:"unverified",qty:null},demand:0,issue:"订单数量或出库口径待核实"};
  const overbooked = buildSchedule(date,[order("a",30)],[],{...settings,overrides:{a:{batches:[{date,qty:40}]}}},[])[0];
  for (const row of [unverified,overbooked]) {
    assert.throws(()=>assertPublishable([valid,row],true),/出货数量/);
    assert.throws(()=>assertPublishable([valid,row],true,true),/出货数量/);
  }
});

test("confirmed shipments settle older batches before checking remaining demand", () => {
  const older = {date:"2026-11-14",qty:40};
  const current = {date,qty:60};
  const config = {...settings,shipmentField:"out_qty",overrides:{a:{ready:true,batches:[older,current]}}};
  const source = {...order("a"),ordered:100};
  const [settled] = buildSchedule(date,[source],[supply],config,[]);
  assert.equal(settled.demand,60);
  assert.equal(settled.stock,30);
  const [partlyShipped] = buildSchedule(date,[{...source,qty:45}],[supply],config,[]);
  assert.equal(partlyShipped.demand,45);
  const [notYetDue] = buildSchedule(date,[{...source,qty:45}],[supply],config,[],[],older.date);
  assert.equal(notYetDue.demand,60);
  assert.equal(notYetDue.quantityIssue,true);
  const [notSettled] = buildSchedule(date,[source],[supply],{
    ...config,overrides:{a:{...config.overrides.a,shipmentBaseline:{field:"out_qty",qty:40}}},
  },[]);
  assert.equal(notSettled.stock,0);
  assert.match(notSettled.issue,/超过当前订单余量/);
});
