import {useEffect,useState} from 'react';
import {Alert,Button,Empty,Input,Modal,Progress,Select,Space,Table,Tag,message} from 'antd';
import {api} from '../lib/api';
import {productBinary} from '../lib/productFiles';
import {isFinishedPdfPath} from '../lib/productImportFiles';
import {ProductImportReview} from './ProductImportReview';
import type {ProductImportBatch,ProductImportEntry,ProductImportView} from '../types/productImport';
import styles from './ProductDrawingImport.module.css';
export function ProductDrawingImport({open,onClose}:{open:boolean;onClose:()=>void}) {
 const [batches,setBatches]=useState<ProductImportBatch[]>([]),[batchId,setBatchId]=useState('');
 const [view,setView]=useState<ProductImportView|null>(null),[active,setActive]=useState<ProductImportEntry|null>(null);
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState({done:0,total:0,skipped:0,failed:[] as string[]});
 const [error,setError]=useState(''),[name,setName]=useState('成品图纸导入');
 useEffect(()=>{if(!open)return;const abort=new AbortController();void api.get<{data:ProductImportBatch[]}>('/api/products/imports',{signal:abort.signal}).then(r=>{if(!abort.signal.aborted)setBatches(r.data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[open]);
 useEffect(()=>{if(!batchId)return;const abort=new AbortController();setView(null);void api.get<{data:ProductImportView}>(`/api/products/imports/${batchId}`,{signal:abort.signal}).then(r=>{if(!abort.signal.aborted)setView(r.data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[batchId]);
 async function reload(id=batchId){const r=await api.get<{data:ProductImportView}>(`/api/products/imports/${id}`);setView(r.data);}
 async function scan(files:File[]) {
  const selected=files.filter(f=>isFinishedPdfPath(f.webkitRelativePath||f.name));
  if(!selected.length){message.info('目录中没有本期可扫描的成品PDF');return;}
  setBusy(true);setError('');setProgress({done:0,total:selected.length,skipped:files.length-selected.length,failed:[]});
  try {
   let id=batchId;
   if(!id){const result=await api.post<{data:ProductImportBatch}>('/api/products/imports',{name});id=result.data.id;setBatches(old=>[result.data,...old]);}
   for(const file of selected){
    try {
     if(file.size>25*1024*1024)throw new Error('超过25MiB');
     const result=await productBinary(`/api/products/imports/${id}/scan?${new URLSearchParams({path:file.webkitRelativePath||file.name})}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
     const scanned=JSON.parse(await result.text()) as {data:ProductImportEntry};
     if(scanned.data.status==='invalid')throw new Error(scanned.data.error||'PDF无效');
    }catch(reason){setProgress(old=>({...old,failed:[...old.failed,`${file.webkitRelativePath||file.name}：${reason instanceof Error?reason.message:'扫描失败'}`]}));}
    setProgress(old=>({...old,done:old.done+1}));
   }
   setBatchId(id);await reload(id);
  }catch(reason){setError(reason instanceof Error?reason.message:'扫描失败');}
  finally{setBusy(false);}
 }
 return <Modal open={open} title="成品PDF批量导入" width={1200} footer={null} closable={!busy} maskClosable={!busy} onCancel={onClose} destroyOnHidden>
  <Alert type="info" showIcon message="目录扫描仅生成私有预览，不创建生产图纸。逐份核对料号、客户、图号和版本后，确认导入即直接发布。子件、3D、图片和隐藏文件跳过。" />
  {error&&<Alert className={styles.notice} type="error" message={error} />}
  <div className={styles.toolbar}>
   <Select className={styles.batchSelect} aria-label="导入批次" disabled={busy} value={batchId||undefined} placeholder="新建批次或选择已有批次重试" allowClear onChange={id=>{setBatchId(id||'');setView(null);}} options={batches.map(b=>({value:b.id,label:`${b.name} · ${new Date(b.createdAt).toLocaleString('zh-CN')}`}))} />
   {!batchId&&<Input aria-label="批次名称" value={name} onChange={e=>setName(e.target.value)} maxLength={200} />}
   <label>选择图纸目录<input aria-label="选择图纸目录" disabled={busy} type="file" multiple ref={node=>{node?.setAttribute('webkitdirectory','');}} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void scan(files);}} /></label>
  </div>
  {progress.total>0&&<><Progress percent={Math.round(progress.done/progress.total*100)} status={busy?'active':'normal'} /><p>已扫描 {progress.done}/{progress.total} · 跳过非本期文件 {progress.skipped} · 失败 {progress.failed.length}（可在同批次重新选择目录重试）</p></>}
  {progress.failed.length>0&&<Alert className={styles.notice} type="warning" message="扫描失败项" description={<div>{progress.failed.map(text=><div key={text} className={styles.path}>{text}</div>)}</div>} />}
  {!view?<Empty description={busy?'正在扫描':'请选择目录或已有批次'} />:<Table<ProductImportEntry> rowKey="id" dataSource={view.entries} pagination={false} size="small" scroll={{x:900}} columns={[
   {title:'原路径 / 文件',dataIndex:'sourcePath',render:value=><span className={styles.path}>{value}</span>},
   {title:'候选系列',dataIndex:'series',render:(_,entry)=>entry.sharedSeries?.join(' / ')||entry.series||'待确认'},
   {title:'用途',render:(_,e)=>e.scope==='customer'?'客户专用':'通用候选'},
   {title:'状态',render:(_,e)=><Tag color={e.status==='invalid'?'red':e.status==='imported'?'green':'orange'}>{{invalid:'校验失败',ready:'待核对',partial:'部分失败',imported:'已完成导入'}[e.status]}</Tag>},
   {title:'提示 / 失败原因',render:(_,e)=><span className={styles.path}>{[...e.hints,e.error].filter(Boolean).join('；')}</span>},
   {title:'操作',render:(_,e)=><Button disabled={busy||e.status==='invalid'} onClick={()=>setActive(e)}>预览 / 核对关联</Button>},
  ]} />}
  {active&&view&&<ProductImportReview entry={active} products={view.products} onClose={()=>setActive(null)} onSaved={()=>{setActive(null);void reload().catch(e=>setError(e.message));}} />}
  <Space className={styles.toolbar}><Button disabled={busy} onClick={onClose}>关闭</Button>{view&&<Button disabled={busy} onClick={()=>void reload().catch(e=>setError(e.message))}>刷新批次记录</Button>}</Space>
 </Modal>;
}
