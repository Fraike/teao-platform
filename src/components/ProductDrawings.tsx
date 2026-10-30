import {usesGearDrawingStructure,drawingStructureLabel} from '../lib/productDrawingPresentation';
import {selectProductionDrawings} from '../../server/shared/product-drawing-selection';
import { lazy, Suspense, useMemo, useState, useEffect, useId, useContext } from 'react';
import { Alert, Button, Empty, Popconfirm, Select, Space, Spin, Table, Tag, message } from 'antd';
import { PrinterOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useTabState, useTabBusy, useTabDispose, useTabPage, TabPageContext } from '../lib/tabPageContext';
import { productPdfResources } from '../lib/productPdfResources';
import { api } from '../lib/api';
import { productBinary, saveProductBlob } from '../lib/productFiles';
import { ProductPrintPreview } from './ProductPrintPreview';
import { ProductDrawingUpload } from './ProductDrawingUpload';
import type { DrawingPanelProps, ProductDrawing } from '../types/product';
import styles from './ProductDrawings.module.css';

const ProductPdfViewer = lazy(() => import('./ProductPdfViewer').then(module => ({ default: module.ProductPdfViewer })));
const date = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
export function ProductDrawings(props:DrawingPanelProps) {
  return <ProductDrawingContext key={`${props.product.id}:${props.standardId}`} {...props} />;
}
function ProductDrawingContext({ product, drawings, standardId, canManage, onChanged }: DrawingPanelProps) {
  const [selection,setSelection]=useTabState<{id:string;context:string}|null>(`drawing:${product.id}:${standardId}:selection`,null);
  const context=`${product.id}:${standardId}`;
  const showStructure=usesGearDrawingStructure(product);
  const [printing, setPrinting] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false), [printBlob, setPrintBlob] = useState<Blob | null>(null);
  const applicable = useMemo(() => {
    if (!product.productionAvailable) return [];
    return selectProductionDrawings(drawings,standardId,product);
  }, [drawings, standardId, product]);
  const active = applicable.find(d => d.id === selection?.id&&selection.context===context) || applicable[0];
  const activeId = active?.id;
  const tabPage=useTabPage(),instance=useId();
  const tabContext=useContext(TabPageContext);
  const owner=tabContext?`${tabContext.record.scope}:${tabContext.record.key}`:instance;
  useEffect(()=>{
    productPdfResources.retain(owner,drawings.map(drawing=>`/api/products/${product.id}/files/${drawing.id}/content`));
    return ()=>{if(!tabPage.managed)productPdfResources.releaseOwner(owner);};
  },[owner,drawings,product.id,tabPage.managed]);
  const resourceKey=activeId ? `/api/products/${product.id}/files/${activeId}/content` : '';
  useTabBusy(printing||printOpen||uploadOpen);
  useTabDispose(()=>productPdfResources.releaseOwner(owner),'pdf:owner');
  async function print() {
    if (!active) return;
    setPrintBlob(null); setPrintOpen(true);
    setPrinting(true);
    try {
      const blob = await productBinary(`/api/products/${product.id}/files/${active.id}/print`, { method: 'POST' });
      setPrintBlob(blob);
    } catch (reason) { setPrintOpen(false); message.error(reason instanceof Error ? reason.message : '打印失败'); }
    finally { setPrinting(false); }
  }
  async function download() {
    if(!active)return;
    try{saveProductBlob(await productBinary(`/api/products/${product.id}/files/${active.id}/content`),active.filename);}
    catch(reason){message.error(reason instanceof Error?reason.message:'下载失败');}
  }
  return <div>
    <div className={styles.toolbar}><div>
      {active ? <><strong>{active.filename}</strong><div className={styles.meta}>图号 {active.drawingNo} · 版本 {active.version} <Tag color="green">已发布</Tag><Tag>{active.role==='supplement'?'补充图':'主图'}</Tag>{showStructure&&<Tag>{drawingStructureLabel(active.structure)}</Tag>}<Tag>{active.standardIds.length ? '客户专用图' : '通用图'}</Tag></div></> : <strong>生产图纸</strong>}
    </div><Space wrap><Button icon={<DownloadOutlined />} disabled={!active} onClick={()=>void download()}>下载图纸</Button><Button icon={<PrinterOutlined />} type="primary" disabled={!active} loading={printing} onClick={() => void print()}>打印图纸</Button>{canManage && <Button icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>上传图纸</Button>}</Space></div>
    {applicable.length > 1 && <Select className={styles.drawingSelect} aria-label="选择生产图纸" value={active?.id} onChange={id=>setSelection({id,context})} options={applicable.map(d => ({ value: d.id, label: `${d.role==='supplement'?'补充图':'主图'} · ${showStructure?`${drawingStructureLabel(d.structure)} · `:''}${d.drawingNo} · ${d.version} · ${d.filename}` }))} />}
    {!active ? <Empty description="缺少有效图纸，请联系工程人员补充并发布" className={styles.empty} /> : <>
      <Spin spinning={false}><Suspense fallback={<div className={styles.viewer}><Spin /></div>}>{resourceKey && <ProductPdfViewer key={resourceKey} src={resourceKey} title={`${active.drawingNo} ${active.version} PDF预览`} />}</Suspense></Spin>
      <div className={styles.footer}>发布人：{active.publishedBy} · 发布时间：{date(active.publishedAt)}。打印文件附料号、图号、版本和时间。</div>
    </>}
    {canManage && <ProductFileManagement product={product} drawings={drawings.filter(d => d.status === 'draft')} onChanged={onChanged} />}
    {printOpen && <ProductPrintPreview blob={printBlob} onClose={() => setPrintOpen(false)} />}
    {uploadOpen && <ProductDrawingUpload product={product} open={uploadOpen} onClose={() => setUploadOpen(false)} onSaved={onChanged} />}
  </div>;
}

export function ProductFileManagement({ product, drawings, onChanged }: Pick<DrawingPanelProps, 'product' | 'drawings' | 'onChanged'>) {
  const [busy, setBusy] = useState('');
  const [actionError,setActionError]=useState('');
  useTabBusy(Boolean(busy));
  async function action(file: ProductDrawing, verb: 'publish' | 'retire') {
    setBusy(file.id);setActionError('');
    try { await api.post(`/api/products/${product.id}/files/${file.id}/${verb}`); message.success(verb === 'publish' ? '已发布' : '已停用并保留历史'); productPdfResources.clear(); onChanged(); }
    catch (error) { const reason=error instanceof Error?error.message:'操作失败';setActionError(`${verb==='publish'?'发布':'停用'}失败：${reason}`); }
    finally { setBusy(''); }
  }
  if (!drawings.length) return null;
  return <div className={styles.management}><h3>图纸管理</h3>{actionError&&<Alert type="error" showIcon message={actionError} className={styles.notice} />}<Table<ProductDrawing> size="small" rowKey="id" dataSource={drawings} pagination={{ pageSize: 10 }} scroll={{ x: 700 }} columns={[
    { title: '文件 / 图号', render: (_, d) => <><div>{d.filename}</div><small>{d.drawingNo} · {d.version}</small></> },
    { title: '适用范围', render: (_, d) => d.standardIds.length ? d.standardIds.map(id => product.standards.find(s => s.id === id)?.customer || '已失效标准').join('、') : '通用' },
    { title: '状态', render: (_, d) => <Tag color={d.status === 'published' ? 'green' : 'default'}>{{ draft: '未发布', published: '已发布', retired: '已停用' }[d.status]}</Tag> },
    { title: usesGearDrawingStructure(product)?'主次 / 结构':'图纸主次', render: (_,d) => `${d.role==='supplement'?'补充图':'主图'}${usesGearDrawingStructure(product)?` · ${drawingStructureLabel(d.structure)}`:''}` },
    { title: '上传时间', render: (_, d) => date(d.uploadedAt) },
    { title: '操作', render: (_, d) => <Space wrap>{d.status === 'draft' && <Popconfirm title="确认直接发布？同图号、相同范围及结构的旧版本将停用。" onConfirm={() => action(d, 'publish')}><Button type="primary" size="small" loading={busy === d.id}>发布</Button></Popconfirm>}{d.status !== 'retired' && <Popconfirm title="停用后产线不可再查看此文件，历史保留。" onConfirm={() => action(d, 'retire')}><Button danger size="small" loading={busy === d.id}>停用</Button></Popconfirm>}</Space> },
  ]} /></div>;
}
