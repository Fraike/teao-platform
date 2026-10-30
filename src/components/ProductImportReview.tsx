import {filenameDrawingStructure} from '../../server/shared/product-drawing-selection';
import {lazy,Suspense,useEffect,useState} from 'react';
import {Alert,Button,Empty,Input,Modal,Select,Spin,message} from 'antd';
import {api} from '../lib/api';
import {productBinary} from '../lib/productFiles';
import type {ProductArchive} from '../types/product';
import type {ProductImportEntry,ProductImportTarget} from '../types/productImport';
import styles from './ProductDrawingImport.module.css';
const ProductPdfViewer=lazy(()=>import('./ProductPdfViewer').then(m=>({default:m.ProductPdfViewer})));
export function ProductImportReview({entry,products,onClose,onSaved}:{entry:ProductImportEntry;products:ProductArchive[];onClose:()=>void;onSaved:()=>void}) {
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const [drawingNo,setDrawingNo]=useState(entry.decision?.drawingNo||''),[version,setVersion]=useState(entry.decision?.version||''),[targets,setTargets]=useState<ProductImportTarget[]>((entry.decision?.targets||[]).map(t=>({...t,standardIds:t.standardIds.length?t.standardIds:['__general__']})));
 useEffect(()=>{const abort=new AbortController();let objectUrl='';void productBinary(`/api/products/imports/${entry.batchId}/entries/${entry.id}/content`,{signal:abort.signal}).then(blob=>{if(!abort.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>{abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};},[entry.batchId,entry.id]);
 const available=products.filter(p=>p.productionAvailable).sort((a,b)=>Number(entry.candidates.some(c=>c.productId===b.id))-Number(entry.candidates.some(c=>c.productId===a.id))||a.internalNumber.localeCompare(b.internalNumber,'zh-CN',{numeric:true}));
 async function confirm(){
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(drawingNo)||!/^[A-Za-z0-9_.-]{1,40}$/.test(version)||!targets.length){setError('请填写图号、版本（字母、数字、点、下划线或短横线），并选择适用料号');return;}
  if(targets.some(t=>!t.standardIds.length)){setError('每个料号都需要明确选择通用或客户标准范围');return;}
  setSaving(true);setError('');
  try{const r=await api.post<{data:ProductImportEntry}>(`/api/products/imports/${entry.batchId}/confirm`,{entryId:entry.id,drawingNo,version,targets:targets.map(t=>({...t,standardIds:t.standardIds.filter(id=>id!=='__general__')}))});
   if(r.data.status!=='imported'){setError(r.data.error||'部分关联失败，请保留范围重试');return;}
   message.success('图纸已关联并直接发布');onSaved();
  }catch(reason){setError(reason instanceof Error?reason.message:'导入失败');}finally{setSaving(false);}
 }
 return <Modal open title="核对成品图纸及适用范围" width={1200} onCancel={onClose} closable={!saving} maskClosable={!saving} footer={<><Button disabled={saving} onClick={onClose}>关闭</Button><Button type="primary" loading={saving} onClick={()=>void confirm()}>确认关联并发布</Button></>}>
  <p className={styles.path}>{entry.sourcePath}</p>
  <Alert type="warning" className={styles.notice} message="系列和客户匹配仅供参考。请查看图纸并明确选择适用料号及客户范围；未选择的商品不会关联。图号和版本需人工核准，日期不等于有效版本。" />
  {error&&<Alert type="error" className={styles.notice} message={error} />}
  {entry.links.length>0&&<Alert className={styles.notice} type="info" message={`已有 ${entry.links.length} 个料号关联。重试必须保持首次确认的图号、版本和全部范围。`} />}
  <div className={styles.editor}><div>{url?<Suspense fallback={<Spin />}><ProductPdfViewer src={url} title={entry.filename} /></Suspense>:<Empty description="正在加载PDF预览" />}</div><div>
   <div className={styles.fields}><label>图号<Input aria-label="导入图号" value={drawingNo} maxLength={100} onChange={e=>setDrawingNo(e.target.value)} /></label><label>版本<Input aria-label="导入版本" value={version} maxLength={40} onChange={e=>setVersion(e.target.value)} /></label></div>
   <p>{entry.hints.join('；')}</p>
   <label>适用成品料号<Select className={styles.targetSelect} mode="multiple" aria-label="适用成品料号" optionFilterProp="label" value={targets.map(t=>t.productId)} onChange={ids=>setTargets(ids.map(id=>targets.find(t=>t.productId===id)||{productId:id,standardIds:[],role:'primary',structure:filenameDrawingStructure(entry.filename)}))} options={available.map(p=>({value:p.id,label:`${entry.candidates.some(c=>c.productId===p.id)?'候选 · ':''}${p.internalNumber} · ${p.name}`}))} /></label>
   {targets.map(target=>{const p=products.find(p=>p.id===target.productId);if(!p)return <Alert key={target.productId} type="error" message="原关联商品已失效，请核对批次记录" />;const candidate=entry.candidates.find(c=>c.productId===p.id);return <div key={p.id} className={styles.target}>
    <strong>{p.internalNumber} · {p.name}</strong>
    <div className={styles.fields}><label>主次<Select aria-label={`${p.internalNumber}图纸主次`} className={styles.targetSelect} value={target.role||'primary'} onChange={role=>setTargets(old=>old.map(t=>t.productId===p.id?{...t,role}:t))} options={[{value:'primary',label:'主图'},{value:'supplement',label:'补充图'}]} /></label>
    <label>结构<Select aria-label={`${p.internalNumber}图纸结构`} className={styles.targetSelect} value={target.structure||filenameDrawingStructure(entry.filename)} onChange={structure=>setTargets(old=>old.map(t=>t.productId===p.id?{...t,structure}:t))} options={[{value:'geared',label:'有齿轮'},{value:'gearless',label:'无齿轮'},{value:'unspecified',label:'未区分结构'}]} /></label></div>
    <Select aria-label={`${p.internalNumber}适用客户范围`} className={styles.targetSelect} mode="multiple" optionFilterProp="label" placeholder="明确选择通用或客户标准" value={target.standardIds} onChange={ids=>{const selected=ids.includes('__general__')?(ids.at(-1)==='__general__'?['__general__']:ids.filter(id=>id!=='__general__')):ids;setTargets(old=>old.map(t=>t.productId===p.id?{...t,standardIds:selected}:t));}} options={[...(entry.scope==='general'?[{value:'__general__',label:'通用（所有客户）'}]:[]),...p.standards.map(s=>({value:s.id,label:`${candidate?.standardIds.includes(s.id)?'客户候选 · ':''}${s.customer} · ${s.customerPartNo||s.model}`}))]} />
   </div>;})}
  </div></div>
 </Modal>;
}
