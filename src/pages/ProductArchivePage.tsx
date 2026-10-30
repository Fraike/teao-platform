import {useTabState,useTabPage,useTabPageAdapter,useTabInitialEffect,useTabBusy} from '../lib/tabPageContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Space, Spin, Table, Tag, Tree, Typography, message } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/authStore';
import type { ProductArchive, ProductCategoryNode, ProductListResponse } from '../types/product';
import { PRODUCT_CATEGORY_IDS, buildProductCategoryTree, countProductCategories, indexProductCategories } from '../../server/shared/product-classification';
import { filterProductArchives, needsKingdeeEntry, productInCategory } from '../lib/productCategoryFilters';
import { groupProductSeries, SERIES_CATEGORY_IDS, productFullModels, productSpecification } from '../lib/productSeries';
import styles from './ProductArchivePage.module.css';

export function ProductArchivePage() {
  useTabPageAdapter();
  const {managed}=useTabPage();
  const [result, setResult] = useTabState<ProductListResponse | null>('products:result',null);
  const [loading, setLoading] = useTabState('products:loading',true), [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams(), location = useLocation();
  const category = params.get('category') || PRODUCT_CATEGORY_IDS.gear;
  const search = params.get('q') || '', requestedScope = params.get('scope') || 'all';
  const [expanded, setExpanded] = useTabState<string[]>('products:expanded',[PRODUCT_CATEGORY_IDS.finished, ...(indexProductCategories(buildProductCategoryTree([])).get(category)?.group === 'semi' ? [PRODUCT_CATEGORY_IDS.semi] : [])]);
  function updateQuery(values: Record<string, string>, resetPage = true) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  }

  const [checkedAt, setCheckedAt] = useTabState('products:checkedAt',() => Date.now());
  const user = useAuthStore(s => s.user);
  const canSync = user?.role === 'admin' || user?.permissions.some(p => ['basic_data', 'product_drawing_manage'].includes(p));
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const response = await api.get<ProductListResponse>('/api/products', { signal }); if (!signal?.aborted) { setResult(response); setError(''); setCheckedAt(Date.now()); } }
    catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : '商品资料加载失败'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [setCheckedAt,setLoading,setResult,setError]);
  useTabBusy(syncing);
  useTabInitialEffect('products:load',() => {
    const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  },[],Boolean(result));
  useEffect(()=>{
    if(managed)return;
    const controller=new AbortController();
    const refresh = () => { if (document.visibilityState === 'visible') void load(controller.signal); };
    const timer = window.setInterval(refresh, 60000); window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load,managed]);
  async function sync() {
    setSyncing(true);
    try { await api.post('/api/products/sync'); await load(); message.success('金蝶商品同步完成'); }
    catch (reason) { message.error(reason instanceof Error ? reason.message : '同步失败'); await load(); }
    finally { setSyncing(false); }
  }
  const taxonomy = useMemo(() => result?.categories || buildProductCategoryTree([]), [result]);
  const categoryIndex = useMemo(() => indexProductCategories(taxonomy), [taxonomy]);
  const selectedNode = categoryIndex.get(category);
  const isSemi = selectedNode?.group === 'semi';
  const scope = isSemi && requestedScope === 'missing' ? 'all' : requestedScope;
  const unlinkedCount = useMemo(() => new Set((result?.data || []).filter(needsKingdeeEntry).map(product => product.internalNumber)).size, [result]);
  function selectCategory(id: string) {
    updateQuery({ category: id, series: '', seriesPage: '', scope: categoryIndex.get(id)?.group === 'semi' && scope === 'missing' ? 'all' : scope });
  }
  const scoped = useMemo(() => filterProductArchives(result?.data || [], { search, scope }), [result, search, scope]);
  const categories = useMemo(() => countProductCategories(taxonomy, scoped), [taxonomy, scoped]);
  const rows = useMemo(() => scoped.filter(product => productInCategory(product, category, categoryIndex)), [scoped, category, categoryIndex]);
  const seriesEnabled = SERIES_CATEGORY_IDS.includes(category);
  const seriesKey = seriesEnabled ? params.get('series') || '' : '';
  const groups = useMemo(() => groupProductSeries(rows), [rows]);
  const selectedSeries = groups.find(group => group.key === seriesKey);
  const visibleRows = seriesKey ? selectedSeries?.products || [] : rows;
  const returnTo = location.pathname + location.search;
  const title = category === 'all' ? '全部商品' : selectedNode?.name || '分类暂不可用';
  const treeNodes = (nodes: ProductCategoryNode[]): DataNode[] => nodes.map(node => ({
    key: node.id, title: <span className={styles.categoryLabel}><span>{node.name}</span><span className={styles.count}>{node.count}</span></span>, children: treeNodes(node.children),
  }));
  return <div className={styles.page}>
    <header className={styles.header}><div><Typography.Title level={4}>商品资料</Typography.Title><Typography.Text type="secondary">按内部料号汇总金蝶商品与已发布产品标准 · {result?.data.length || 0} 个档案</Typography.Text></div><Space><Button onClick={() => void load()}>刷新页面</Button>{canSync && <Button icon={<ReloadOutlined />} loading={syncing || result?.sync.running} onClick={() => void sync()}>立即同步金蝶</Button>}</Space></header>
    <div className={styles.sync}>每小时自动同步 · 最近成功：{result?.sync.lastSuccessAt ? new Date(result.sync.lastSuccessAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未成功同步'}{result?.sync.lastSuccessAt && checkedAt - Date.parse(result.sync.lastSuccessAt) > 7200000 && <Tag color="orange">资料超过2小时未更新</Tag>} · 新增 {result?.sync.added || 0} / 更新 {result?.sync.updated || 0}</div>
    {(error || result?.sync.error) && <Alert className={styles.notice} type="warning" showIcon message={error || `金蝶同步失败：${result?.sync.error}。当前保留上次成功资料。`} />}
    <div className={styles.quickStats}>
      <Button aria-label={`未关联金蝶：${unlinkedCount} 个商品`} aria-pressed={scope === 'unlinked'} type={scope === 'unlinked' ? 'primary' : 'default'} disabled={loading && !result}
        onClick={() => updateQuery({ category: 'all', scope: 'unlinked', q: '', series: '', seriesPage: '' })}>
        未关联金蝶（{unlinkedCount}）
      </Button>
      <Typography.Text type="secondary">PMC 待核对 / 补录 · 全部分类，按内部料号统计</Typography.Text>
    </div>
    {scope === 'unlinked' && <Alert className={styles.notice} type="info" showIcon message="已有已发布产品标准，但未匹配到金蝶商品，或最近成功同步时金蝶未返回。请 PMC 先核对编码和同步状态，再补录或恢复金蝶商品；同步成功后自动更新关联。" />}
    <div className={styles.catalogLayout}><aside className={styles.categories} aria-label="商品分类">
      <h3>商品分类</h3><Button type={category === 'all' ? 'primary' : 'text'} block onClick={() => selectCategory('all')}>全部商品（{scoped.length}）</Button>
      <Tree blockNode selectedKeys={[category]} expandedKeys={expanded} onExpand={keys => setExpanded(keys.map(String))} treeData={treeNodes(categories)} onSelect={keys => { if (keys.length) selectCategory(String(keys[0])); }} />
    </aside><main className={styles.results}>
    {seriesEnabled && seriesKey && <Button onClick={() => updateQuery({ series: '', page: '' }, false)}>返回系列</Button>}
    <div className={styles.sectionTitle}><Typography.Title level={5}>{title}{seriesKey ? ` / ${selectedSeries?.name || '系列暂无匹配商品'}` : ''}</Typography.Title><Typography.Text type="secondary">{visibleRows.length} 个商品</Typography.Text></div>
    {isSemi && <Alert className={styles.notice} type="info" showIcon message="半成品资料查询：本期优先管理成品图纸，半成品不纳入缺图待办。" />}
    <div className={styles.filters}><Input prefix={<SearchOutlined />} placeholder="搜索内部料号、名称、型号、客户料号" value={search} onChange={event => updateQuery({ q: event.target.value })} allowClear className={styles.search} /><Select aria-label="档案状态" value={scope} onChange={value => updateQuery({ scope: value })} options={[{ value: 'all', label: '全部档案' }, { value: 'unlinked', label: '未关联金蝶' }, ...(!isSemi ? [{ value: 'missing', label: '成品缺少有效图纸' }] : []), { value: 'issues', label: '需要核对' }, { value: 'inactive', label: '停用 / 历史档案' }]} className={styles.select} /></div>
    {loading ? <div className={styles.loading}><Spin /></div> : seriesEnabled && !seriesKey ? <>
      <div className={styles.seriesGrid}>{groups.map(group => <button key={group.key} className={styles.seriesCard} onClick={() => updateQuery({ series: group.key })}>
        <span className={styles.seriesName}>{group.name}</span>
        {group.pending && <Tag color="orange">系列待确认</Tag>}
        <span className={styles.seriesMeta}>{group.products.length} 个商品 · {group.models.length} 个完整型号</span>
        <span className={styles.seriesExamples}>{group.models.slice(0,3).join('、') || '暂无型号'}{group.models.length > 3 ? '…' : ''}</span>
        <span className={styles.seriesAction}>查看具体规格 →</span>
      </button>)}</div>
      {!groups.length && <Empty description="没有匹配的商品系列" />}
    </> : !visibleRows.length ? <Empty description="没有匹配的商品档案" /> : <Table<ProductArchive> rowKey="id" dataSource={visibleRows} size="small" scroll={{ x: 1000 }} pagination={false} columns={[
      { title: '内部料号', dataIndex: 'internalNumber', width: 160, fixed: 'left', render: (value, p) => <Link to={`/materials/${p.id}?${new URLSearchParams({ returnTo })}`}>{value}</Link> },
      { title: seriesEnabled ? '完整型号' : '名称', dataIndex: 'name', ellipsis: true, width: 260, render: (value, p) => seriesEnabled ? productFullModels(p).join(' / ') || value : value }, { title: seriesEnabled ? '金蝶规格 / 测试范围' : '规格型号', dataIndex: 'model', ellipsis: true, width: 160, render: (value, p) => seriesEnabled ? productSpecification(p) : value },
      { title: '分类', dataIndex: 'category', width: 150, render: (value, p) => <Button type="link" className={styles.categoryLink} onClick={() => selectCategory(p.categoryId)}>{value}</Button> }, { title: '单位', dataIndex: 'unit', width: 70 },
      { title: '客户标准', width: 90, render: (_, p) => p.standards.length },
      { title: '生产图纸', width: 130, render: (_, p) => p.drawingCount ? <Tag color="green">{p.drawingCount} 份有效图纸</Tag> : p.group === 'semi' ? <Tag>后续阶段</Tag> : <Tag color="orange">缺少有效图纸</Tag> },
      { title: '关联状态', width: 180, render: (_, p) => <Space wrap>{!p.kingdeeId && <Tag>未关联金蝶</Tag>}{p.kingdeeMissing && <Tag color="orange">金蝶本次未返回</Tag>}{p.issues.length > 0 && <Tag color="red">需核对</Tag>}{p.kingdeeId && !p.kingdeeMissing && !p.issues.length && <Tag color="blue">已关联金蝶</Tag>}</Space> },
    ]} />}
    </main></div>
  </div>;
}
