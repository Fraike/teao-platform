import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import type { ScheduleOrder, ScheduleOverride, SchedulePreview, ScheduleRow, ScheduleSettings, ScheduleStatus } from "../types/assemblyScheduling";
import { AssemblySchedulingLedger } from "./AssemblySchedulingLedger";
import { AssemblyInstructionRowEditor } from "./AssemblyInstructionRowEditor";
import styles from "./AssemblySchedulingPage.module.css";

const base = "/api/assembly-scheduling";
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const product = (o: ScheduleOrder) => [o.code,o.product,o.spec,o.customerCode].filter(Boolean).join(" / ");
const err = (error: unknown) => message.error(error instanceof Error ? error.message : "操作失败");

export function AssemblySchedulingPage() {
  const [date,setDate] = useState(today);
  const [status,setStatus] = useState<ScheduleStatus>();
  const [preview,setPreview] = useState<SchedulePreview>();
  const [scheduled,setScheduled] = useState<SchedulePreview | null>(null);
  const [tab,setTab] = useState("plan");
  const [mode,setMode] = useState<"draft" | "published" | "scheduled">("draft");
  const [busy,setBusy] = useState(false);
  const [settingsEdit,setSettingsEdit] = useState<ScheduleStatus>();
  const [editing,setEditing] = useState<{order:ScheduleOrder;status:ScheduleStatus}>();
  const [rowEditor,setRowEditor] = useState<{date:string;revision:number;row?:ScheduleRow}>();
  const [publishing,setPublishing] = useState(false);
  const [printing,setPrinting] = useState(false);
  const [reason,setReason] = useState("");
  const [checked,setChecked] = useState(false);

  const refresh = useCallback(async () => {
    const state = await api.get<ScheduleStatus>(base);
    setStatus(state);
    return state;
  },[]);
  useEffect(() => {
    let active = true;
    void api.get<ScheduleStatus>(base).then(value=>{if(active)setStatus(value);}).catch(error=>{if(active)err(error);});
    return () => {active = false;};
  },[]);
  const canEdit = status?.canEdit;
  const reload = useCallback(async () => {
    const path = canEdit ? "preview" : "published";
    setPreview(await api.get<SchedulePreview>(`${base}/${path}?date=${date}`));
    if (canEdit) setScheduled(await api.get<SchedulePreview | null>(`${base}/scheduled?date=${date}`));
  },[canEdit,date]);
  useEffect(() => {
    if (canEdit === undefined) return;
    let cancelled = false;
    const path = canEdit ? "preview" : "published";
    void Promise.all([
      api.get<SchedulePreview>(`${base}/${path}?date=${date}`),
      canEdit ? api.get<SchedulePreview | null>(`${base}/scheduled?date=${date}`) : Promise.resolve(null),
    ]).then(([p,s]) => { if (!cancelled) {setPreview(p);setScheduled(s);} }).catch(error => {if (!cancelled) err(error);});
    return () => {cancelled = true;};
  },[canEdit,date,status?.snapshot?.id,status?.stockSnapshot?.id]);
  const syncing = !!(status?.sync?.running || status?.stockSync?.running);
  useEffect(() => {
    if (!syncing) return;
    const timer = window.setInterval(() => {void refresh().catch(err);},3000);
    return () => window.clearInterval(timer);
  },[syncing,refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); await refresh(); await reload(); }
    catch (error) { err(error); }
    finally { setBusy(false); }
  }

  const edit = (order: ScheduleOrder) => {if (status) setEditing({order,status});};
  const published = preview?.versions[0];
  const editable = !!canEdit && mode==="draft" && date>=today();
  const progressAt = mode === "scheduled" ? scheduled?.progressAt : preview?.progressAt;
  const visible = !canEdit ? preview : mode === "published" ? published : mode === "scheduled" ? scheduled : preview;
  const dailyRows = (visible?.rows ?? []).filter(row=>row.due === date);
  const rows = dailyRows.slice(0,20);
  const omitted = (visible?.omittedCount ?? 0) + Math.max(0,dailyRows.length-20);
  return <main className={styles.page}>
    <header className={styles.toolbar}>
      <Typography.Title level={4}>装配排单</Typography.Title>
      <Space wrap>
        {tab === "plan" && <DatePicker aria-label="计划日期" allowClear={false} value={dayjs(date)} onChange={d => {if (d) {setDate(d.format("YYYY-MM-DD"));setPreview(undefined);setScheduled(null);}}} />}
        {published && tab === "plan" && <Tag color="blue">V{published.version}</Tag>}
        <Button loading={busy} onClick={() => void run(async () => undefined)}>刷新</Button>
        {canEdit && <Button loading={syncing} disabled={busy} onClick={() => void run(() => api.post(base+"/sync"))}>同步金蝶</Button>}
        {canEdit && <Button loading={status?.stockSync?.running} disabled={busy} onClick={() => void run(() => api.post(base+"/sync-stock"))}>同步库存</Button>}
        {status?.canConfigure && <Button type="text" disabled={busy} onClick={() => setSettingsEdit(status)}>产能设置</Button>}
        <Link to="/production-entry">装配部生产日报</Link>
      </Space>
    </header>
    {canEdit && <div className={styles.syncStatus}>
      <Tag color={status?.sync.error ? "error" : status?.sync.running ? "processing" : "default"}>订单 {status?.sync.error || (status?.sync.running
        ? `同步中 ${status.sync.done}/${status.sync.total || "–"}` : status?.snapshot ? dayjs(status.snapshot.at).format("MM-DD HH:mm") : "待同步")}</Tag>
      <Tag color={status?.stockSync?.error ? "error" : status?.stockSync?.running ? "processing" : "default"}>库存 {status?.stockSync?.error || (status?.stockSync?.running
        ? "同步中" : status?.stockSnapshot ? dayjs(status.stockSnapshot.at).format("MM-DD HH:mm") : "待同步")}</Tag>
    </div>}
    <Tabs activeKey={tab} onChange={setTab} items={[
      {key:"plan",label:"出货指令单",children:<>
        {canEdit && !status?.settings.shipmentField && <Alert type="warning" message="请先核对出库口径及可用仓库，再发布出货指令单。" />}
        <div className={styles.planTools}>
        {canEdit && <Space wrap className={styles.actions}>
          <Select value={mode} onChange={setMode} options={[{value:"draft",label:"最新草案"},{value:"published",label:"已发布"},{value:"scheduled",label:"下午草案"}]} />
          {editable && <Button disabled={!status?.snapshot || !preview || rows.length>=20} onClick={()=>{
            if (status) setRowEditor({date,revision:status.revision});
          }}>新增行</Button>}
          {mode==="published" && date>=today() && <Button onClick={()=>setMode("draft")}>编辑草案</Button>}
          <Button type="primary" disabled={!preview || (!published && !preview.rows.some(r => r.planned > 0 || (r.demand > 0 && r.due === date && !r.issue))) || mode !== "draft" || !!preview?.conflicts?.length || date < today() || busy || syncing || !!(status?.sync.error || status?.stockSync?.error)}
            onClick={() => {setReason("");setChecked(false);setPublishing(true);}}>PMC 确认发布</Button>
          {mode === "scheduled" && scheduled?.scheduledAt && <Tag>{dayjs(scheduled.scheduledAt).format("MM-DD HH:mm")}</Tag>}
        </Space>}
        <Space className={styles.actions}>
          <Button disabled={canEdit ? mode !== "published" || !rows.length : !rows.length} onClick={() => printPlan(setPrinting)}>打印出货指令单</Button>
          <Button disabled={canEdit ? mode !== "published" || !rows.length : !rows.length} onClick={() => void exportPlan(date,rows,published?.version,preview?.progressAt).catch(err)}>导出 Excel</Button>
        </Space>
        </div>
        {canEdit && mode === "draft" && published && <PlanChanges current={rows} previous={published.rows} />}
        {!!preview?.conflicts?.length && <Alert type="error" showIcon message={`以下已开工任务不能在草案中减少数量或移动产线：${preview.conflicts.map(row => `${row.line} ${row.order.product}`).join("、")}`} />}
        {omitted > 0 && <Alert type="warning" showIcon message={`已列入 20 条，另有 ${omitted} 条未列入，请到销售订单核对并调整出货安排。`} />}
        <div className={styles.print}>
          <div className={styles.planHeading}><Typography.Title level={5}>出货指令单 · {date}{published && (mode==="published" || !canEdit) ? ` · V${published.version}` : ""}</Typography.Title>
          <Space wrap><strong>{rows.length} 条 · 当天出货需求 {demandSummary(rows,date)}</strong>
          {progressAt && <Typography.Text type="secondary">日报读取于 {dayjs(progressAt).format("MM-DD HH:mm")}</Typography.Text>}</Space></div>
          <PlanTable rows={rows} editable={editable} onAdjust={edit} onEdit={row=>{
            if (status) setRowEditor({date,revision:status.revision,row});
          }} printing={printing} />
        </div>
        {!!preview?.versions.length && <Typography.Paragraph className={styles.actions}>发布记录 · {preview.versions.map(v => `V${v.version} ${dayjs(v.at).format("MM-DD HH:mm")} ${v.reason}`).join(" ｜ ")}</Typography.Paragraph>}
      </>},
      ...(canEdit ? [
        {key:"orders",label:"销售订单",children:<AssemblySchedulingLedger kind="orders" snapshot={status?.snapshot?.id} stockSnapshot={status?.stockSnapshot?.id} revision={status?.revision} onEdit={edit} />},
        {key:"stock",label:"库存查询",children:<AssemblySchedulingLedger kind="stock" stockSnapshot={status?.stockSnapshot?.id} />},
      ] : []),
    ]} />
    {settingsEdit && <SettingsModal status={settingsEdit} close={() => setSettingsEdit(undefined)} save={async settings => {
      await api.put(base+"/settings",{settings,revision:settingsEdit.revision}); setSettingsEdit(undefined); await refresh(); await reload();
    }} />}
    {rowEditor && <AssemblyInstructionRowEditor date={rowEditor.date} row={rowEditor.row}
      existingIds={preview?.rows.map(row=>row.order.id) ?? []} close={()=>setRowEditor(undefined)}
      save={async input=>{
        await api.put(base+"/daily-row",{...input,revision:rowEditor.revision});
        setRowEditor(undefined);
        message.success("已保存到出货草案");
        await refresh();
        await reload();
      }} />}
    {editing && <DemandModal order={editing.order} status={editing.status} progress={preview?.progress ?? []} close={() => setEditing(undefined)} save={async value => {
      await api.put(base+"/override",{id:editing.order.id,value,revision:editing.status.revision});setEditing(undefined);await refresh();await reload();
    }} />}
    <Modal open={publishing} title="确认发布出货指令单" onCancel={() => setPublishing(false)} confirmLoading={busy}
      okButtonProps={{disabled:!checked || !reason.trim()}}
      onOk={() => void run(async () => {
        await api.post(base+"/publish",{date,token:preview?.token,reason,checked});setPublishing(false);setMode("published");message.success("已发布");
      })}>
      <Space orientation="vertical" className={styles.full}>
        <Checkbox checked={checked} onChange={e => setChecked(e.target.checked)}>已核实临时仓未测试产品、齐套及已开工任务</Checkbox>
        <Input.TextArea placeholder="填写发布或变更原因" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
      </Space>
    </Modal>
  </main>;
}

function printPlan(setPrinting: (value:boolean)=>void) {
  flushSync(()=>setPrinting(true));
  document.body.classList.add(styles.printMode);
  try { window.print(); }
  finally { document.body.classList.remove(styles.printMode); setPrinting(false); }
}

function finishedText(row: ScheduleRow) {
  if (row.actualState === "ambiguous") return "待关联";
  return row.actual ?? "暂无日报";
}

function demandSummary(rows:ScheduleRow[],date:string) {
  const units = new Map<string,number>();
  for (const row of rows) if (row.due === date && row.demand > 0) units.set(row.order.unit,(units.get(row.order.unit) ?? 0)+row.demand);
  return [...units].map(([unit,total])=>`${total.toLocaleString("zh-CN")} ${unit}`).join(" / ") || "—";
}

function PlanTable({rows,editable,onEdit,onAdjust,printing}:{rows:ScheduleRow[];editable:boolean;onEdit:(row:ScheduleRow)=>void;onAdjust:(order:ScheduleOrder)=>void;printing:boolean}) {
  return <Table rowKey="key" size="small" dataSource={rows} pagination={false} scroll={{x:"max-content",y:printing ? undefined : "min(62vh, 680px)"}}
    columns={[
      {title:"顺序",render:(_:unknown, _row:ScheduleRow,i:number)=>i+1},
      {title:"产线",dataIndex:"line"},{title:"客户",render:(_,r)=>r.order.customer},
      {title:"内部料号",render:(_,r)=>r.order.code || "—"},
      {title:"产品型号",render:(_,r)=>r.order.product || "—"},
      {title:"扭矩标准",render:(_,r)=>r.order.spec || "—"},
      {title:"客户料号",render:(_,r)=>r.order.customerCode || "—"},
      {title:"出货日期",dataIndex:"due"},
      {title:"当天出货需求",render:(_,r)=>r.demand > 0 ? `${r.demand} ${r.order.unit}` : "待核实"},
      {title:"参考成品库存",render:(_,r)=>r.availableStock === undefined ? "待核实" : `${r.availableStock} ${r.order.unit}`},{title:"本批库存覆盖",dataIndex:"stock"},
      {title:"计划装配",dataIndex:"planned"},{title:"已做好",render:(_,r)=>finishedText(r)},
      {title:"状态",render:(_,r)=>r.issue || (r.planned ? (r.actualState!=="ambiguous" && (r.actual ?? 0) >= r.planned ? "装配完成" : (r.actual ?? 0) > 0 ? "部分完成" : "待装配") : r.stock >= r.demand ? "库存直发" : "待预计完工")},
      {title:"备注",dataIndex:"note"},
      ...(editable ? [{title:"操作",render:(_:unknown,r:ScheduleRow)=><Space><Button type="link" onClick={()=>onEdit(r)}>编辑</Button><Button type="link" onClick={()=>onAdjust(r.order)}>排单设置</Button></Space>}] : []),
    ]} />;
}

function PlanChanges({current,previous}:{current:ScheduleRow[];previous:ScheduleRow[]}) {
  const before = new Map(previous.filter(r=>r.demand>0).map(r=>[r.order.id,r]));
  const after = new Map(current.filter(r=>r.demand>0).map(r=>[r.order.id,r]));
  const changes = [...new Set([...before.keys(),...after.keys()])].flatMap(key=>{
    const a = before.get(key), b = after.get(key);
    if (a?.planned === b?.planned && a?.line === b?.line && a?.due === b?.due && a?.demand === b?.demand && a?.stock === b?.stock) return [];
    return [`${(b ?? a)?.order.product}（${(b ?? a)?.order.customer}） ${a ? `需求 ${a.demand}、${a.line || "无产线"} ${a.planned}` : "未排"} → ${b ? `需求 ${b.demand}、${b.line || "无产线"} ${b.planned}` : "未排"}`];
  });
  return changes.length ? <Alert type="info" showIcon message="与上次发布的差异" description={changes.join(" ｜ ")} /> : null;
}

async function exportPlan(date:string, rows:ScheduleRow[], version?:number,progressAt?:string) {
  const xlsx = await import("xlsx");
  const book = xlsx.utils.book_new();
  const sheet = xlsx.utils.json_to_sheet(rows.map((r,i)=>({
    日期:date,版本:version ?? "",顺序:i+1,产线:r.line,客户:r.order.customer,内部料号:r.order.code,客户料号:r.order.customerCode,
    产品型号:r.order.product,扭矩标准:r.order.spec,当天出货需求:r.demand || "待核实",单位:r.order.unit,参考成品库存:r.availableStock ?? "待核实",本批库存覆盖:r.stock,装配量:r.planned,已做好:finishedText(r),日报取数时间:progressAt ? dayjs(progressAt).format("YYYY-MM-DD HH:mm") : "",出货日期:r.due,备注:r.note,风险:r.issue,
  })));
  xlsx.utils.book_append_sheet(book,sheet,"出货指令单");
  xlsx.writeFile(book,`出货指令单_${date}${version ? "_V"+version : ""}.xlsx`);
}

function SettingsModal({status,close,save}:{status:ScheduleStatus;close:()=>void;save:(value:Omit<ScheduleSettings,"overrides">)=>Promise<void>}) {
  const [form] = Form.useForm<ScheduleSettings>();
  const [saving,setSaving] = useState(false);
  const [products,setProducts] = useState<{value:string;label:string}[]>([]);
  const [productLoading,setProductLoading] = useState(true);
  useEffect(()=>{
    const controller = new AbortController();
    void api.get<typeof products>(base+"/products",{signal:controller.signal})
      .then(items=>{if (!controller.signal.aborted) setProducts(items);})
      .catch(error=>{if (!controller.signal.aborted) err(error);})
      .finally(()=>{if (!controller.signal.aborted) setProductLoading(false);});
    return ()=>controller.abort();
  },[]);
  return <Modal open title="产能与数据设置" width={850} className={styles.editor} okText="保存设置" cancelText="取消" onCancel={close} confirmLoading={saving}
    onOk={()=>void form.validateFields().then(async value=>{
      setSaving(true);
      try {await save(value);} catch(error){err(error);} finally {setSaving(false);}
    }).catch(()=>undefined)}>
    <Form form={form} layout="vertical" initialValues={status.settings} className={styles.formBody}>
      <section className={styles.formSection}>
      <Typography.Title level={5}>同步与出库口径</Typography.Title>
      <div className={styles.twoCols}>
        <Form.Item name="draftTime" label="生成草案时间（上海）" rules={[{required:true}]}><Input type="time" /></Form.Item>
        <Form.Item name="prepDays" label="出货准备天数" rules={[{required:true}]}><InputNumber min={0} max={30} precision={0} /></Form.Item>
        <Form.Item name="shipmentField" label="经对账确认的出库口径">
          <Select options={[{value:"",label:"待对账"},{value:"out_qty",label:"订单出库数量"},{value:"real_out_qty",label:"实际出库数量"}]} />
        </Form.Item>
      <Form.Item name="warehouseIds" label="可用于排单的仓库"><Select mode="multiple" showSearch optionFilterProp="label"
        options={selectOptions(status.settings.warehouseIds,(status.warehouses ?? []).map(w=>({label:w.name,value:w.id})))} /></Form.Item>
      </div>
      <Form.Item name="reconciliation" label="订单、出库单和可用库存对账记录"><Input.TextArea maxLength={500} /></Form.Item>
      </section>
      <section className={styles.formSection}>
      <Typography.Title level={5}>产线与产品产能</Typography.Title>
      <Form.List name="capacities">
        {(fields,{add,remove})=><>
          {fields.map(f=><div className={styles.configRow} key={f.key}>
            <Form.Item name={[f.name,"line"]} label="产线" rules={[{required:true}]}><Select placeholder="产线" options={status.lines.map(line=>({value:line,label:line}))} /></Form.Item>
            <Form.Item name={[f.name,"materialId"]} label="金蝶商品" rules={[{required:true}]}>
              <Select showSearch loading={productLoading} optionFilterProp="label" placeholder="搜索编码、型号或名称"
                options={selectOptions(status.settings.capacities.map(c=>c.materialId),products)} />
            </Form.Item>
            {([["hours","可用工时"],["shiftHours","班次工时"],["output","班次合格量"],["changeHours","换线工时"]] as const).map(([key,label])=>
              <Form.Item key={key} name={[f.name,key]} label={label} rules={[{required:true}]}><InputNumber min={0} /></Form.Item>
            )}
            <Button onClick={()=>remove(f.name)}>移除</Button>
          </div>)}
          <Button onClick={()=>add({hours:8,shiftHours:8,changeHours:0})}>添加产能</Button>
        </>}
      </Form.List>
      </section>
    </Form>
  </Modal>;
}

function selectOptions(existing:string[], options:{value:string;label:string}[]) {
  const values = new Set(options.map(item=>item.value));
  return [...options,...[...new Set(existing)].filter(value=>!values.has(value)).map(value=>({value,label:value}))];
}

function DemandModal({order,status,progress,close,save}:{order:ScheduleOrder;status:ScheduleStatus;progress:SchedulePreview["progress"];close:()=>void;save:(value:ScheduleOverride)=>Promise<void>}) {
  const [form] = Form.useForm<ScheduleOverride>();
  const [saving,setSaving] = useState(false);
  return <Modal open title={`调整需求 · ${order.orderNo}`} width={760} className={styles.editor} okText="保存需求" cancelText="取消" onCancel={close} confirmLoading={saving}
    onOk={()=>void form.validateFields().then(async value=>{
      setSaving(true);
      try {await save({...value,maxQty:value.maxQty ?? undefined});} catch(error){err(error);} finally {setSaving(false);}
    }).catch(()=>undefined)}>
    <Form form={form} layout="vertical" className={styles.formBody} initialValues={status.settings.overrides[order.id] ?? {ready:false,urgent:false,batches:[],expected:[]}}>
      <section className={styles.formSection}>
        <Typography.Title level={5}>订单信息</Typography.Title>
        <div className={styles.twoCols}><strong>{order.customer}</strong><span>未交 {order.qty ?? "待核实"} {order.unit}</span>
          <span>{product(order)}</span><span>交期 {order.due || "待核实"}</span></div>
      </section>
      <section className={styles.formSection}>
      <Typography.Title level={5}>排单安排</Typography.Title>
      <div className={styles.twoCols}>
        <Form.Item name="ready" valuePropName="checked"><Checkbox>已确认齐套</Checkbox></Form.Item>
        <Form.Item name="urgent" valuePropName="checked"><Checkbox>紧急</Checkbox></Form.Item>
        <Form.Item name="line" label="指定产线"><Select allowClear placeholder="自动安排" options={status.lines.map(line=>({value:line,label:line}))} /></Form.Item>
        <Form.Item name="maxQty" label="装配量上限"><InputNumber min={0} precision={0} placeholder="按缺口安排" /></Form.Item>
      </div>
      <Form.Item name="actualReportIds" label="确认实际产量归属的装配日报">
        <Select mode="multiple" allowClear options={progress.filter(p=>p.productId===order.materialId).map(p=>({value:p.id,label:`${p.date} ${p.line} ${p.productionBatch || p.productName} · ${p.dailyQty}`}))} />
      </Form.Item>
      <Form.Item name="note" label="调整原因及现场要求"><Input.TextArea maxLength={500} /></Form.Item>
      </section>
      {(["batches","expected"] as const).map(key=><section key={key} className={styles.formSection}>
      <Typography.Title level={5}>{key==="batches" ? "分批出货" : "预计完工"}</Typography.Title>
      <Form.List name={key}>
        {(fields,{add,remove})=><>
          {fields.map(f=><div key={f.key} className={styles.configRow}>
            {key === "expected" && <Form.Item name={[f.name,"reportId"]} label="装配日报批次" rules={[{required:true}]}>
              <Select placeholder="选择来源" options={progress.filter(p=>p.productId===order.materialId && p.productionBatch).map(p=>({value:p.id,label:`${p.date} ${p.line} ${p.productionBatch}`}))} />
            </Form.Item>}
            <Form.Item name={[f.name,"date"]} label={key === "batches" ? "出货日期" : "可交付日期"} rules={[{required:true}]}><Input type="date" /></Form.Item>
            <Form.Item name={[f.name,"qty"]} label="数量" rules={[{required:true}]}><InputNumber min={1} precision={0} /></Form.Item>
            <Button onClick={()=>remove(f.name)}>移除</Button>
          </div>)}
          <Button className={styles.actions} onClick={()=>add()}>{key === "batches" ? "添加分批出货" : "添加未入库且可按时交付的预计完工"}</Button>
        </>}
      </Form.List></section>)}
    </Form>
  </Modal>;
}
