import {ProductDrawingGuide} from '../components/ProductDrawingGuide';
import {useTabState,useTabPage,useTabPageAdapter,useTabInitialEffect} from '../lib/tabPageContext';
import {resolveProductBusinessFields,formatProductWeight} from '../lib/productBusinessFields';
import {useTabStore} from '../lib/tabStore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Empty, Select, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { safeProductListReturn } from '../lib/productCategoryFilters';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/authStore';
import { ProductDrawings, ProductFileManagement } from '../components/ProductDrawings';
import type { ProductDetailResponse, ProductMaterial, ProductStandardReference } from '../types/product';
import styles from './ProductArchiveDetailPage.module.css';

export function ProductArchiveDetailPage() {
  useTabPageAdapter();
  const {managed,active}=useTabPage();
  const [innerTab,setInnerTab]=useTabState('product:innerTab','drawings');
  const location=useLocation(),renameTab=useTabStore(s=>s.renameTab);
  const { id } = useParams(); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [result, setResult] = useTabState<ProductDetailResponse | null>('product:result',null), [error, setError] = useTabState('product:error','');
  const [kingdee, setKingdee] = useTabState<{ data: ProductMaterial; fetchedAt: string; stale: boolean } | null>('product:kingdee',null);
  const [detailError, setDetailError] = useState('');
  const user = useAuthStore(s => s.user);
  const canReadKingdee = user?.role === 'admin' || user?.permissions.some(p => ['basic_data', 'business', 'production', 'product_drawing_manage'].includes(p));
  const standardId = params.get('standardId') || '';
  const returnTo = safeProductListReturn(params.get('returnTo'));
  const returnLabel=returnTo.split('?')[0]==='/product-standards'?'产品标准':'商品资料';
  const internalNumber = params.get('number') || '';
  const resolverQuery=id==='number'?params.toString():'';
  const detailQuery = JSON.stringify([id,internalNumber]);
  const kingdeeQuery = JSON.stringify([result?.data.id,result?.data.kingdeeId,result?.data.kingdeeMissing,canReadKingdee]);
  const [loadedDetailQuery,setLoadedDetailQuery] = useTabState<string|null>('product:loadedDetailQuery',null);
  const [loadedKingdeeQuery,setLoadedKingdeeQuery] = useTabState<string|null>('product:loadedKingdeeQuery',null);
  const requestVersion = useRef(0);
  const invalidateRequests = useCallback(() => { requestVersion.current++; }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    const version = ++requestVersion.current;
    setLoadedDetailQuery(null);
    try { const target = id === 'number' ? (await api.get<{ data: { id: string } }>(`/api/products/resolve?number=${encodeURIComponent(internalNumber)}`, { signal })).data.id : id;
      if(id==='number'){if(!signal?.aborted&&version===requestVersion.current)navigate(`/materials/${encodeURIComponent(target)}?${resolverQuery}`,{replace:true});return;}
      const response = await api.get<ProductDetailResponse>(`/api/products/${encodeURIComponent(target)}`, { signal }); if (!signal?.aborted && version === requestVersion.current) { setResult(previous => JSON.stringify(previous) === JSON.stringify(response) ? previous : response); setError(''); setLoadedDetailQuery(detailQuery); } }
    catch (reason) { if (!signal?.aborted && version === requestVersion.current) setError(reason instanceof Error ? reason.message : '获取商品详情失败'); }
  }, [id, internalNumber, navigate, resolverQuery,setError,setResult,detailQuery,setLoadedDetailQuery]);
  useTabInitialEffect('product:load',() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { void load(controller.signal); } });
    return () => { controller.abort(); invalidateRequests(); };
  }, [id,internalNumber],loadedDetailQuery===detailQuery);
  useEffect(() => {
    if(managed)return;
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === 'visible') void load(controller.signal); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load,managed]);
  useTabInitialEffect('product:kingdee',() => {
    setLoadedKingdeeQuery(null);
    if (!result?.data.kingdeeId || result.data.kingdeeMissing || !canReadKingdee) return;
    const controller = new AbortController();
    void api.get<{ data: ProductMaterial; fetchedAt: string; stale: boolean }>(`/api/products/${result.data.id}/kingdee`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setKingdee(value); setDetailError(''); setLoadedKingdeeQuery(kingdeeQuery); } })
      .catch(reason => { if (!controller.signal.aborted) setDetailError(reason.message); });
    return () => controller.abort();
  }, [result?.data.id, result?.data.kingdeeId, result?.data.kingdeeMissing, canReadKingdee],loadedKingdeeQuery===kingdeeQuery);
  useEffect(()=>{
    if(!result)return;
    renameTab(location.pathname,result.data.internalNumber,result.data.name);
    if(active)document.title=`${result.data.internalNumber} · ${result.data.name} | 特澳科技后台`;
  },[result,location.pathname,renameTab,active]);
  if (error && !result) return <div className={styles.page}><Alert type="error" message={error} /><Button onClick={() => void load()}>重试</Button></div>;
  if (!result) return <div className={styles.loading}><Spin aria-label="加载商品档案" /></div>;
  const product = result.data, material = kingdee?.data || product.material;
  const businessFields=resolveProductBusinessFields(kingdee?.data||null,product.material);
  const isSemi = product.group === 'semi';
  const selectedStandard = isSemi ? undefined : product.standards.find(s => s.id === standardId);
  const refresh = () => { void load(); };
  return <div className={styles.page}>
    <div className={styles.breadcrumb}><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(returnTo)} aria-label={`返回${returnLabel}`} /><Link to={returnTo}>{returnLabel}</Link><span>/ {product.internalNumber}</span></div>
    <header className={styles.header}><div><div className={styles.title}><Typography.Title level={3}>{product.internalNumber}</Typography.Title><Typography.Text type="secondary">内部料号</Typography.Text><Tag color={product.kingdeeId ? 'blue' : 'default'}>{product.kingdeeId ? '已关联金蝶' : '未关联金蝶'}</Tag></div><Typography.Text>{product.name}</Typography.Text></div><div className={styles.headerActions}><ProductDrawingGuide /><div className={styles.sync}>金蝶每小时同步<br />最近成功：{result.sync.lastSuccessAt ? new Date(result.sync.lastSuccessAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未同步'}<br /><Link to="/materials">查看同步状态</Link></div></div></header>
    {(error || result.sync.error) && <Alert type="warning" message={error || `金蝶同步异常：${result.sync.error}`} className={styles.notice} />}
    {product.issues.map(issue => <Alert key={issue} type="warning" message={issue} className={styles.notice} />)}
    {product.kingdeeMissing && <Alert type="warning" message="金蝶最近一次完整同步未返回该商品，已保留原档案及图纸，请核对。" className={styles.notice} />}
    <div className={styles.layout}><aside className={styles.aside}>
      <h3>产品资料</h3><Descriptions column={1} size="small" items={[
        { key: 'number', label: '内部料号', children: product.internalNumber }, { key: 'name', label: '产品名称', children: product.name },
        { key: 'model', label: '规格型号', children: product.model || (isSemi ? '未维护' : '按客户标准查看') }, { key: 'category', label: '产品分类', children: product.category },
        { key: 'unit', label: '基本单位', children: product.unit || '未维护' },
        { key: 'package', label: '最小包装量', children: businessFields.packageQuantity!==null ? `${businessFields.packageQuantity.toLocaleString('zh-CN')} ${material?.base_unit_name || product.unit}` : '未维护 / 未获取' },
        { key: 'warehouse', label: '默认仓库', children: businessFields.warehouseName || '未维护 / 未获取' },
        { key: 'weight', label: '重量', children: formatProductWeight(businessFields) },
      ]} />
      <div className={styles.sourceNote}>经营资料来源：金蝶<br />{kingdee && <>详情更新时间：{new Date(kingdee.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}{kingdee.stale && <Tag color="orange">离线缓存</Tag>}</>}{detailError && <span>{detailError}</span>}</div>
      {!isSemi && <div className={styles.customer}><h3>适用客户</h3><Select className={styles.customerSelect} aria-label="适用客户标准" value={selectedStandard?.id || ''} onChange={value => { const next = new URLSearchParams(params); if (value) next.set('standardId', value); else next.delete('standardId'); setParams(next, { replace: true }); }} options={[{ value: '', label: '通用图纸（全部客户）' }, ...product.standards.map(s => ({ value: s.id, label: `${s.customer} · ${s.customerPartNo || s.model}` }))]} /><p>无客户专用图时使用通用图；均无则提示缺图。</p>{standardId && !selectedStandard && <Alert type="warning" message="链接中的客户标准已失效，当前显示通用图。" />}</div>}
      {!isSemi && <Link to={`/product-standards${selectedStandard ? `?standardId=${selectedStandard.id}` : ''}`}>查看关联产品标准（{product.standards.length}）</Link>}
    </aside><main className={styles.main}><Tabs activeKey={isSemi && innerTab === 'standards' ? 'drawings' : innerTab} onChange={setInnerTab} destroyOnHidden items={[
      { key: 'drawings', label: '生产图纸', children: <ProductDrawings product={product} drawings={result.drawings} standardId={selectedStandard?.id || ''} canManage={result.canManage} onChanged={refresh} /> },
      ...(!isSemi ? [{ key: 'standards', label: `客户标准（${product.standards.length}）`, children: <ProductStandards standards={product.standards} /> }] : []),
      { key: 'sources', label: '工程源文件', children: result.canManage ? <><Alert type="info" message="DWG / 三维等原件仅供授权工程人员下载，第一期不提供在线预览。" /><ProductFileManagement product={product} drawings={result.drawings.filter(d => d.kind === 'source' && d.status !== 'retired')} onChanged={refresh} />{!result.drawings.some(d => d.kind === 'source') && <Empty description="暂无工程源文件，可在生产图纸页签上传" />}</> : <Empty description="工程源文件仅向授权工程人员开放" /> },
      { key: 'history', label: '历史版本', children: result.canManage ? <><Alert type="info" message="停用版本仅供工程追溯，不作为产线生产依据。" /><ProductFileManagement product={product} drawings={result.drawings.filter(d => d.status === 'retired')} onChanged={refresh} /><ProductFileManagement product={product} drawings={result.drawings.filter(d => d.status === 'published')} onChanged={refresh} /></> : <Empty description="历史文件仅供授权工程人员追溯；生产请使用当前有效版本" /> },
      { key: 'kingdee', label: '金蝶资料', children: <Descriptions column={1} bordered size="small" items={[
        { key: 'barcode', label: '条码', children: material?.barcode || '未维护' }, { key: 'stock', label: '仓库', children: businessFields.warehouseName || '未维护 / 未获取' },
        { key: 'unit', label: '基本单位', children: material?.base_unit_name || '未维护' }, { key: 'purchase', label: '采购单位', children: String(material?.purchase_unit_name || '未维护') },
        { key: 'prices', label: '价格资料', children: <KingdeePrices material={kingdee?.data || null} /> },
      ]} /> },
    ]} /></main></div>
  </div>;
}
function ProductStandards({ standards }: { standards: ProductStandardReference[] }) {
  return <Table<ProductStandardReference> rowKey="id" dataSource={standards} size="small" scroll={{ x: 600 }} pagination={{ pageSize: 10 }} columns={[
    { title: '客户', dataIndex: 'customer' }, { title: '客户料号', dataIndex: 'customerPartNo' }, { title: '型号', dataIndex: 'model' },
    { title: '有效标准', render: (_, s) => <Link to={`/product-standards?standardId=${s.id}`}>查看 V{s.versionNo}</Link> },
  ]} />;
}
function KingdeePrices({ material }: { material: ProductMaterial | null }) {
  const prices = Array.isArray(material?.price_entity) ? material.price_entity as Record<string, unknown>[] : [];
  return prices.length ? <Table size="small" rowKey={(_, i) => String(i)} pagination={false} scroll={{ x: 500 }} dataSource={prices} columns={[
    { title: '单位', dataIndex: 'price_unit_name' }, { title: '采购价', dataIndex: 'price_purchase_price' }, { title: '成本价', dataIndex: 'price_cost_price' }, { title: '零售价', dataIndex: 'price_retail_price' },
  ]} /> : '未获取价格资料';
}
