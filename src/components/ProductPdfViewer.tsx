import { useEffect, useRef, useState, useContext } from 'react';
import { Alert, Button, Modal, Space, Spin } from 'antd';
import {RotateLeftOutlined,RotateRightOutlined,UndoOutlined} from '@ant-design/icons';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { productPdfResources } from '../lib/productPdfResources';
import { useTabPage, useTabState, TabPageContext } from '../lib/tabPageContext';
import styles from './ProductDrawings.module.css';

export function ProductPdfViewer({ src, title }: { src: string; title: string }) {
  return <ProductPdfDocument key={src} src={src} title={title} />;
}
function ProductPdfDocument({src,title}:{src:string;title:string}) {
  const tabContext=useContext(TabPageContext);
  const scrollKey=`pdf:${src}:scroll`;
  const savedScroll=useRef(tabContext?.record.snapshot.get(scrollKey) as {top:number;left:number}|undefined);
  const restoreScroll=useRef(true);
  const {active}=useTabPage();
  const [revision,setRevision]=useState(0);
  const [rotation,setRotation]=useTabState(`pdf:${src}:rotation`,0);
  const canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [page, setPage] = useTabState(`pdf:${src}:page`,1);
  const [zoom, setZoom] = useTabState(`pdf:${src}:zoom`,100), [area, setArea] = useState({ width: 700, height: 450 });
  const [fit, setFit] = useTabState<'page' | 'width'>(`pdf:${src}:fit`,'page');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [browserHelpOpen,setBrowserHelpOpen]=useState(false);
  useEffect(() => {
    if(!active)return;
    restoreScroll.current=true;
    let cancelled = false;
    const unsubscribe=productPdfResources.subscribe(src,()=>{setPdf(null);setRevision(value=>value+1);});
    void productPdfResources.document(src).then(resource => { if (!cancelled) setPdf(resource.document); else productPdfResources.releaseUnused(src); }).catch(reason => { if (!cancelled) { setError(reason.message); setLoading(false); if(/toHex|not a function|not a constructor|is not defined|unsupported/i.test(reason.message))setBrowserHelpOpen(true); } });
    return () => { cancelled = true; unsubscribe(); setPdf(null); productPdfResources.releaseUnused(src); };
  }, [src,active,revision]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setArea({ width: Math.max(200, entries[0].contentRect.width - 4), height: Math.max(200, entries[0].contentRect.height - 4) }));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false, render: { cancel: () => void } | undefined;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true); setError('');
      try {
        const sheet = await pdf.getPage(page); if (cancelled || !canvas.current) return;
        const displayRotation=((sheet.rotate+rotation)%360+360)%360;
        const base = sheet.getViewport({ scale: 1, rotation:displayRotation });
        const scale = fit === 'page' ? Math.min(area.width / base.width, area.height / base.height) : area.width / base.width;
        const viewport = sheet.getViewport({ scale: scale * zoom / 100, rotation:displayRotation });
        canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
        const task = sheet.render({ canvas: canvas.current, viewport }); render = task;
        await task.promise;
        if(!cancelled&&restoreScroll.current&&container.current){
          const saved=savedScroll.current;
          if(saved){container.current.scrollTop=saved.top;container.current.scrollLeft=saved.left;}
          restoreScroll.current=false;
        }
      } catch (reason) { if (!cancelled) {setError(reason instanceof Error ? reason.message : 'PDF渲染失败');setBrowserHelpOpen(true);} }
      finally { if (!cancelled) setLoading(false); }
    });
    return () => { cancelled = true; render?.cancel(); };
  }, [pdf, page, zoom, area, fit, rotation]);
  return <div>
    <Button type="link" size="small" onClick={()=>setBrowserHelpOpen(true)}>显示不完整？</Button>
    <Modal title="图纸显示异常或不完整" open={active&&browserHelpOpen} getContainer={tabContext?.container||false} onCancel={()=>setBrowserHelpOpen(false)} onOk={()=>setBrowserHelpOpen(false)} okText="知道了" cancelButtonProps={{hidden:true}}>
      <p>若图纸缺字、缺线或无法显示，请先使用最新版 Microsoft Edge 或 Google Chrome 重新打开系统；已安装的浏览器请更新后重试。</p>
      <Space wrap><a href="https://www.microsoft.com/zh-cn/edge/download" target="_blank" rel="noopener noreferrer">Microsoft Edge 官方下载</a><a href="https://www.google.cn/chrome/" target="_blank" rel="noopener noreferrer">Chrome 中文官方下载</a></Space>
      <p>下载网站是否可访问取决于当前网络。打不开时请联系管理员协助安装。更换浏览器后仍有问题，请反馈内部料号、图号和截图。</p>
    </Modal>
    {error && <Alert type="error" message={error} />}
    <Spin spinning={loading}><div ref={container} onScroll={event=>{
      if(restoreScroll.current)return;
      const value={top:event.currentTarget.scrollTop,left:event.currentTarget.scrollLeft};
      savedScroll.current=value;tabContext?.record.snapshot.set(scrollKey,value);
    }} className={styles.viewer}><canvas ref={canvas} aria-label={title} className={styles.canvas} /></div></Spin>
    <div className={styles.pdfControls}><Space wrap><Button size="small" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</Button><span>{page} / {pdf?.numPages || '—'}</span><Button size="small" disabled={!pdf || page >= pdf.numPages || loading} onClick={() => setPage(value => value + 1)}>下一页</Button></Space><Space wrap><Button size="small" aria-label="向左旋转90度" icon={<RotateLeftOutlined />} disabled={!pdf||loading||Boolean(error)} onClick={()=>setRotation(value=>(value+270)%360)}>左转</Button><Button size="small" aria-label="向右旋转90度" icon={<RotateRightOutlined />} disabled={!pdf||loading||Boolean(error)} onClick={()=>setRotation(value=>(value+90)%360)}>右转</Button><Button size="small" aria-label="复位图纸方向" icon={<UndoOutlined />} disabled={!pdf||loading||Boolean(error)} onClick={()=>{setRotation(0);setFit('page');setZoom(100);}}>复位</Button><Button size="small" aria-label="缩小图纸" disabled={zoom <= 50} onClick={() => setZoom(value => value - 25)}>−</Button><span>{zoom}%</span><Button size="small" aria-label="放大图纸" disabled={zoom >= 200} onClick={() => setZoom(value => value + 25)}>＋</Button><Button size="small" onClick={() => { setFit('page'); setZoom(100); }}>整页</Button><Button size="small" onClick={() => { setFit('width'); setZoom(100); }}>适合宽度</Button></Space></div>
  </div>;
}
