import { useEffect, useState } from "react";
import { Button, Checkbox, Descriptions, Input, Popover, Select, Space, Table, Tag, Tree, message } from "antd";
import type { DataNode } from "antd/es/tree";
import type { TableColumnsType } from "antd";
import type { ProductCategoryNode } from "../types/product";
import type { ScheduleLedger, ScheduleOrder, ScheduleStock } from "../types/assemblyScheduling";
import { api } from "../lib/api";
import archive from "./ProductArchivePage.module.css";
import styles from "./AssemblySchedulingPage.module.css";

const approval: Record<string,string> = {C:"已审核",Z:"未审核"};
const closure: Record<string,string> = {C:"未关闭",S:"已关闭",H:"手动关闭"};
const stockKey = (row:ScheduleStock) => JSON.stringify([row.materialId,row.warehouseId,row.variant,row.batch,row.locationId]);
const value = (item:unknown) => item === undefined || item === null || item === "" ? "—" : String(item);
const product = (row: ScheduleOrder) => [row.code,row.product,row.spec,row.customerCode].filter(Boolean).join(" / ");

function StatusTag({code,labels,color}:{code:string;labels:Record<string,string>;color:string}) {
  return <Tag color={code === "C" ? color : code === "Z" ? "orange" : undefined}>{labels[code] ?? (code ? `待核实 · ${code}` : "待核实")}</Tag>;
}

const stockColumns: TableColumnsType<ScheduleStock> = [
  {title:"仓库",dataIndex:"warehouse"},{title:"编码",dataIndex:"code"},{title:"商品",dataIndex:"product"},
  {title:"批号",dataIndex:"batch",render:value},{title:"库位",render:(_,r)=>r.location ?? (r.locationId === "0" ? "—" : r.locationId)},
  {title:"账面量",dataIndex:"onHand",render:value},{title:"可用量",dataIndex:"qty",render:value},{title:"单位",dataIndex:"unit",render:value},
];

function summarizeStock(rows:ScheduleStock[],warehouse:string) {
  const matched = rows.filter(row=>row.warehouse===warehouse);
  return matched.length && matched.every(row=>row.qty!==null) ? matched.reduce((sum,row)=>sum+(row.qty ?? 0),0) : null;
}

function InventoryCell({order}:{order:ScheduleOrder}) {
  const rows = order.inventory ?? [];
  return <Space orientation="vertical" size={2}>
    {["成品仓","半成品仓"].map(name=>{
      const qty = summarizeStock(rows,name);
      return <span key={name}>{name} <strong>{qty === null ? "待核实" : `${qty} ${order.unit}`}</strong></span>;
    })}
    {!!rows.length && <Popover title="匹配库存明细" trigger="click" content={
      <Table size="small" rowKey={stockKey} dataSource={rows} columns={stockColumns} pagination={false} scroll={{x:540,y:260}} />
    }><Button type="link" size="small">库存明细</Button></Popover>}
  </Space>;
}

export function AssemblySchedulingLedger({kind,snapshot,stockSnapshot,revision,onEdit}:{
  kind:"stock"|"orders";snapshot?:number;stockSnapshot?:number;revision?:number;onEdit?:(order:ScheduleOrder)=>void;
}) {
  const [page,setPage] = useState(1);
  const [q,setQuery] = useState("");
  const [warehouse,setWarehouse] = useState<string>();
  const [category,setCategory] = useState("");
  const [status,setStatus] = useState("");
  const [closed,setClosed] = useState("");
  const [columns,setColumns] = useState<string[]>([]);
  const [data,setData] = useState<ScheduleLedger>();
  const [loading,setLoading] = useState(false);
  const warehouseId = warehouse ?? data?.warehouses?.find(item=>item.name==="成品仓")?.id ?? "";
  useEffect(()=>{
    const controller = new AbortController();
    const params = new URLSearchParams({kind,q,page:String(page),warehouse:warehouseId,category,status,closed});
    const timer = window.setTimeout(()=>{
      setLoading(true);
      void api.get<ScheduleLedger>(`/api/assembly-scheduling/ledger?${params}`,{signal:controller.signal})
        .then(result=>{if(!controller.signal.aborted)setData(result);})
        .catch(error=>{if (!controller.signal.aborted) message.error(error.message);})
        .finally(()=>{if (!controller.signal.aborted)setLoading(false);});
    },0);
    return ()=>{controller.abort();window.clearTimeout(timer);};
  },[kind,q,page,snapshot,stockSnapshot,revision,warehouseId,category,status,closed]);
  const pagination = {current:page,pageSize:50,total:data?.total,showSizeChanger:false,onChange:setPage};
  const search = <Input.Search aria-label={kind==="orders" ? "搜索销售订单" : "搜索库存"} placeholder={kind==="orders" ? "单号、客户、型号或料号" : "商品编码或名称"}
    allowClear onSearch={text=>{setPage(1);setQuery(text);}} className={styles.search} />;
  if (kind === "stock") {
    const treeNodes = (nodes:ProductCategoryNode[]): DataNode[] =>
      nodes.map(node=>({key:node.id,title:<span className={archive.categoryLabel}>{node.name}<span className={archive.count}>{node.count}</span></span>,children:treeNodes(node.children)}));
    return <div className={styles.stockLayout}>
      <aside className={archive.categories}>
        <h3>商品分类</h3>
        <Select aria-label="仓库" className={styles.full} value={warehouseId} onChange={id=>{setWarehouse(id);setCategory("");setPage(1);}}
          options={[...(data?.warehouses ?? []).filter(w=>["成品仓","半成品仓"].includes(w.name)).map(w=>({value:w.id,label:w.name})),
            {label:"其他仓库",options:[{value:"",label:"全部仓库"},...(data?.warehouses ?? []).filter(w=>!["成品仓","半成品仓"].includes(w.name)).map(w=>({value:w.id,label:w.name}))]}]} />
        <Tree blockNode selectedKeys={[category]} treeData={[{key:"",title:"全部商品"},...treeNodes(data?.categories ?? []),{key:"unclassified",title:`未分类 · ${data?.unclassified ?? 0}`}]}
          onSelect={keys=>{if(keys.length){setPage(1);setCategory(String(keys[0]));}}} />
      </aside>
      <section className={styles.results}>{search}
        <Table size="small" loading={loading} rowKey={stockKey} scroll={{x:"max-content"}} dataSource={data?.rows as ScheduleStock[]} pagination={pagination} columns={stockColumns} />
      </section>
    </div>;
  }
  const optional = ["客户订单号","订单备注","行备注","审核时间","修改时间","业务员","部门","订单单位","出库仓库","退货量"];
  return <>
    <Space wrap className={styles.filters}>{search}
      <Select aria-label="审核状态" allowClear placeholder="审核状态" value={status || undefined} onChange={code=>{setPage(1);setStatus(code ?? "");}}
        options={Object.entries(approval).map(([value,label])=>({value,label}))} />
      <Select aria-label="关闭状态" allowClear placeholder="关闭状态" value={closed || undefined} onChange={code=>{setPage(1);setClosed(code ?? "");}}
        options={Object.entries(closure).map(([value,label])=>({value,label}))} />
      <Popover trigger="click" title="附加列" content={<Checkbox.Group className={styles.columnPicker} options={optional} value={columns} onChange={setColumns} />}>
        <Button>列设置</Button>
      </Popover>
    </Space>
    <Table<ScheduleOrder> rowKey="id" loading={loading} size="small" scroll={{x:"max-content"}} dataSource={data?.rows as ScheduleOrder[]}
      pagination={pagination}
      expandable={{expandedRowRender:row=><Descriptions size="small" column={{xs:1,sm:2,lg:3}} items={[
        ...Object.entries(row.details ?? {}).map(([label,item])=>({key:label,label,children:value(item)})),
        {key:"关闭原值",label:"行关闭原值",children:value(row.lineClosed)},
      ]} />}} columns={[
      {title:"销售单号",dataIndex:"orderNo",render:text=><strong>{text}</strong>},{title:"客户",dataIndex:"customer"},
      {title:"产品／规格／客户料号",render:(_,r)=>product(r)},
      {title:"审核",render:(_,r)=><StatusTag code={r.status} labels={approval} color="green" />},
      {title:"关闭",render:(_,r)=><StatusTag code={r.closed} labels={closure} color="blue" />},
      {title:"下单日期",dataIndex:"orderDate",render:value},{title:"交期",dataIndex:"due",render:value},
      {title:"订单量",render:(_,r)=>`${r.ordered} ${r.unit}`},
      {title:"已出库／实际出库",render:(_,r)=>`${value(r.out)} / ${value(r.realOut)}`},
      {title:"未交量",render:(_,r)=>r.qty ?? "待核实"},
      {title:"对应商品库存",render:(_,r)=><InventoryCell order={r} />},
      ...columns.map(label=>({title:label,render:(_:unknown,r:ScheduleOrder)=>value(r.details?.[label])})),
      {title:"操作",render:(_,r)=><Button type="link" onClick={()=>onEdit?.(r)}>维护需求</Button>},
    ]} />
  </>;
}
