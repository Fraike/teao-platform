import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import express from "../server/node_modules/express/index.js";

const directory = mkdtempSync(join(tmpdir(),"teao-assembly-plan-"));
Object.assign(process.env,{DATA_DIR:directory,PRODUCTION_DB_PATH:join(directory,"production.db"),
  JWT_SECRET:"test-scheduling-secret-0123456789",INITIAL_ADMIN_PASSWORD:"TestAssembly2026",NODE_ENV:"production",
  KINGDEE_CLIENT_ID:"fixture",KINGDEE_CLIENT_SECRET:"fixture"});
const {registerAssemblySchedulingRoutes} = await import("../server/routes/assembly-scheduling.ts");
const users = await import("../server/services/users.js");
const store = await import("../server/services/production-store.js");
const {formatShanghaiDate} = await import("../server/config.js");
const {shiftDate} = await import("../server/services/assembly-scheduling-rules.ts");
const date = formatShanghaiDate();
const due = shiftDate(date,1);
const app = express();
app.use(express.json());
registerAssemblySchedulingRoutes(app);
const server = app.listen(0,"127.0.0.1");
await once(server,"listening");
const realFetch = globalThis.fetch;
const root = `http://127.0.0.1:${server.address().port}/api/assembly-scheduling`;
let admin, worker;
async function call(path,token=admin,method="GET",body) {
  const r = await realFetch(root+path,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  return {code:r.status,body:await r.json()};
}
const category = "2314557705978701824";
let detailFailure = false;
let finishedStock = "30";
let releaseDetail;
const initialDetailGate = new Promise(resolve=>{releaseDetail=resolve;});
const order = {id:"o",bill_date:date,bill_no:"ORDER-1",customer_name:"客户",bill_status:"C",bill_close_state:"C",material_entity:[
  {id:"l",material_id:"m",material_number:"M",material_name:"成品",stock_id:"w",base_unit_name:"个",unit_name:"个",base_qty:100,
    qty:100,out_base_qty:20,out_qty:20,real_out_qty:20,close_state:"1",delivery_date:due,cus_bill_no:"PO-1"},
  {id:"two",material_id:"m2",material_number:"M2",material_name:"直发成品",stock_id:"w",base_unit_name:"个",unit_name:"个",base_qty:10,
    qty:10,out_base_qty:0,out_qty:0,real_out_qty:0,close_state:"1",delivery_date:due},
  {id:"three",material_id:"m2",material_number:"M2",material_name:"后续成品",stock_id:"w",base_unit_name:"个",unit_name:"个",base_qty:10,
    qty:10,out_base_qty:0,out_qty:0,real_out_qty:0,close_state:"1",delivery_date:shiftDate(due,2)},
]};
const listed = rows => Response.json({errcode:0,data:{count:rows.length,rows}});
globalThis.fetch = async url => {
  const path = new URL(url).pathname;
  if (path.endsWith("push_app_authorize")) return Response.json({errcode:0,data:[{appKey:"k",appSecret:"s"}]});
  if (path.endsWith("kingdee_auth_token")) return Response.json({errcode:0,data:{"app-token":"t"}});
  if (path.endsWith("/material_group")) return listed(new URL(url).searchParams.has("parent") ? [] : [{id:category,level:1,name:"成品"}]);
  if (path.endsWith("/material")) return listed([{id:"m",parent_id:category,base_unit_name:"个"},{id:"m2",parent_id:category,base_unit_name:"个"}]);
  if (path.endsWith("/sal_order")) return listed([{id:"o"}]);
  if (path.endsWith("/sal_order_detail")) {
    await initialDetailGate;
    return Response.json(detailFailure ? {errcode:123} : {errcode:0,data:order});
  }
  if (path.endsWith("/inventory")) return listed([{material_id:"m",stock_id:"w",stock_name:"成品仓",qty:finishedStock,valid_qty:finishedStock},
    {material_id:"m",stock_id:"semi",stock_name:"半成品仓",qty:"3",valid_qty:"3"},
    {material_id:"m2",stock_id:"w",stock_name:"成品仓",qty:"10",valid_qty:"10"}]);
  throw new Error("Unexpected request: "+path);
};
async function syncUntilDone() {
  for (let i=0;i<75;i++) {
    const {body} = await call("");
    if (!body.sync.running && !body.stockSync.running) return body;
    await new Promise(resolve => setTimeout(resolve,50));
  }
  throw new Error("sync timed out");
}
try {
  store.initDB();
  await users.initDefaultAdmin();
  admin = (await users.loginUser({username:"admin",password:"TestAssembly2026"})).token;
  await users.registerUser({username:"worker",name:"Worker",password:"TestAssembly2026"});
  const id = users.listUsers().find(u=>u.username==="worker").id;
  await users.approveUser(id);
  await users.setUserPermission(id,"production",true);
  worker = (await users.loginUser({username:"worker",password:"TestAssembly2026"})).token;
  assert.equal((await call("/ledger",worker)).code,403);
  assert.equal((await call("/publish",worker,"POST",{})).code,403);
  assert.equal((await call("/sync",admin,"POST")).body.started,true);
  let partial;
  for (let i=0;i<50;i++) {
    partial = (await call("")).body;
    if (partial.stockSnapshot) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(partial.stockSnapshot.stocks,3);
  assert.equal(partial.sync.running,true);
  assert.equal(partial.snapshot,null);
  releaseDetail();
  const {snapshot,settings} = await syncUntilDone();
  assert.equal(snapshot.lines,3);
  const ledger = (await call("/ledger?kind=orders&status=C&closed=C")).body;
  assert.equal(ledger.rows.length,3);
  assert.equal(ledger.rows[0].details["客户订单号"],"PO-1");
  assert.deepEqual(ledger.rows[0].inventory.map(r=>r.qty),[30,3]);
  const warehouse = (await call("/ledger?kind=stock&warehouse=semi&category="+category)).body;
  assert.equal(warehouse.total,1);
  assert.equal(warehouse.categories[0].count,1);
  const report = store.createEntry({date,line:"1#",customer:"客户",productName:"成品",productId:"m",productionBatch:"B1",dailyQty:15},"fixture");
  assert.equal((await call("/settings",admin,"PUT",{revision:0,settings:{...settings,shipmentField:"out_qty",reconciliation:"fixture checked",
    warehouseIds:["w"],capacities:[{line:"1#",materialId:"m",hours:8,shiftHours:8,output:100,changeHours:0}]}})).code,200);
  assert.equal((await call("/override",admin,"PUT",{revision:1,id:"o:l",value:{ready:true,expected:[{reportId:report.id,qty:10,date:due}]}})).code,200);
  const draft = (await call("/preview?date="+due)).body;
  assert.equal(draft.progress[0].id,report.id);
  assert.equal(draft.rows[0].stock,30);
  assert.equal(draft.rows[0].expected,10);
  assert.equal(draft.rows[0].planned,40);
  assert.equal(draft.rows[0].actualState,"missing");
  assert.equal((await call("/publish",admin,"POST",{date:due,token:"old",reason:"试排",checked:true})).code,409);
  const published = await call("/publish",admin,"POST",{date:due,token:draft.token,reason:"试排",checked:true});
  assert.equal(published.code,200);
  const workRows = (await call("/published?date="+due,worker)).body.rows;
  assert.ok(workRows.some(r=>r.order.id==="o:two" && r.planned===0 && r.demand===10));
  assert.equal(workRows[0].order.details,undefined);
  assert.equal((await call("/published?date="+due,worker)).body.rows[0].planned,40);
  assert.equal((await call("/override",admin,"PUT",{revision:2,id:"o:l",value:{ready:true,maxQty:20}})).code,200);
  assert.equal((await call("/published?date="+due,worker)).body.rows[0].planned,40);
  const anotherDay = (await call("/preview?date="+shiftDate(due,1))).body;
  assert.deepEqual(anotherDay.rows,[]);
  assert.deepEqual((await call("/published?date="+shiftDate(due,1),worker)).body.rows,[]);
  assert.equal((await call("/published?date="+due,worker)).body.versions[0].version,1);
  store.createEntry({date:due,line:"1#",customer:"客户",productName:"成品",productId:"m",productionBatch:"B1",dailyQty:7,defects:2},"fixture");
  assert.equal((await call("/published?date="+due,worker)).body.rows[0].actual,5);
  store.createEntry({date:due,line:"2#",customer:"客户",productName:"直发成品",productId:"m2",productionBatch:"B2",dailyQty:0},"fixture");
  const completedRows = (await call("/published?date="+due,worker)).body.rows;
  assert.equal(completedRows.find(row=>row.order.id==="o:two").actual,0);
  detailFailure = true;
  finishedStock = "35";
  await call("/sync",admin,"POST");
  const failed = await syncUntilDone();
  assert.ok(failed.sync.error);
  assert.equal(failed.snapshot.id,snapshot.id);
  assert.equal(failed.stockSnapshot.id,2);
  const latest = (await call("/published?date="+due,worker)).body.rows.find(row=>row.order.id==="o:l");
  assert.equal(latest.availableStock,35);
  assert.equal(latest.stock,30);
  const next = (await call("/preview?date="+due)).body;
  assert.equal((await call("/publish",admin,"POST",{date:due,token:next.token,reason:"校准",checked:true})).code,409);
  const state = (await call("")).body;
  assert.deepEqual((await call("/ledger?kind=candidates&q="+encodeURIComponent("后续成品"))).body.rows.map(r=>r.id),["o:three"]);
  const add = {id:"o:three",date,qty:4,revision:state.revision,mode:"add"};
  assert.equal((await call("/daily-row",worker,"PUT",add)).code,403);
  assert.equal((await call("/daily-row",admin,"PUT",add)).code,200);
  assert.equal((await call("/preview?date="+date)).body.rows.find(r=>r.order.id==="o:three").demand,4);
  assert.equal((await call("/daily-row",admin,"PUT",{...add,revision:state.revision+1})).code,409);
  assert.equal((await call("/daily-row",admin,"PUT",{...add,revision:state.revision+1,mode:"edit",qty:6,note:"客户追加"})).code,200);
  const edited = (await call("/preview?date="+date)).body.rows.find(r=>r.order.id==="o:three");
  assert.equal(edited.demand,6);
  assert.equal(edited.note,"客户追加");
  assert.equal((await call("/daily-row",admin,"PUT",{...add,revision:state.revision+2,mode:"edit",qty:11})).code,400);
  assert.equal((await call("/published?date="+due,worker)).body.rows.find(r=>r.order.id==="o:two").demand,10);
} finally {
  releaseDetail();
  globalThis.fetch = realFetch;
  await new Promise(resolve=>server.close(resolve));
  store.closeDB();
  rmSync(directory,{recursive:true,force:true});
}
