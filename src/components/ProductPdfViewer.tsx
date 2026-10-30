import { useEffect, useRef, useState, useContext, useCallback } from 'react';
import { Alert, Button, Modal, Space, Spin } from 'antd';
import {RotateLeftOutlined,RotateRightOutlined,UndoOutlined} from '@ant-design/icons';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {MouseEvent,PointerEvent} from 'react';
import type {PdfDragState,PdfZoomAnchor} from '../types/productPdfInteraction';
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
  const drag=useRef<PdfDragState|null>(null),zoomAnchor=useRef<PdfZoomAnchor|null>(null);
  const [dragging,setDragging]=useState(false);
  const snapshot=tabContext?.record.snapshot;
  const rememberScroll=useCallback((element:HTMLDivElement)=>{
    const value={top:element.scrollTop,left:element.scrollLeft};
    savedScroll.current=value;snapshot?.set(scrollKey,value);
  },[snapshot,scrollKey]);
  function doubleClick(event:MouseEvent<HTMLCanvasElement>){
    if(!pdf||loading||error)return;
    const bounds=event.currentTarget.getBoundingClientRect();
    const enlarge=zoom!==150;
    zoomAnchor.current=enlarge?{x:bounds.width?(event.clientX-bounds.left)/bounds.width:0.5,y:bounds.height?(event.clientY-bounds.top)/bounds.height:0.5}:null;
    if(!enlarge&&container.current){container.current.scrollLeft=0;container.current.scrollTop=0;rememberScroll(container.current);}
    setFit('page');setZoom(enlarge?150:100);
  }
  function startDrag(event:PointerEvent<HTMLDivElement>){
    const element=event.currentTarget;
    if(event.button!==0||loading||error||event.target!==canvas.current||element.scrollWidth<=element.clientWidth&&element.scrollHeight<=element.clientHeight)return;
    drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:element.scrollLeft,top:element.scrollTop};
    canvas.current?.setPointerCapture?.(event.pointerId);setDragging(true);
  }
  function moveDrag(event:PointerEvent<HTMLDivElement>){
    const state=drag.current;if(!state||state.pointerId!==event.pointerId)return;
    const element=event.currentTarget;
    element.scrollLeft=Math.max(0,Math.min(element.scrollWidth-element.clientWidth,state.left+state.x-event.clientX));
    element.scrollTop=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,state.top+state.y-event.clientY));
    rememberScroll(element);
  }
  function endDrag(event:PointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointerId!==event.pointerId)return;
    drag.current=null;setDragging(false);
    if(canvas.current?.hasPointerCapture?.(event.pointerId))canvas.current.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    if(!active)return;
    restoreScroll.current=true;
    let cancelled = false;
    const unsubscribe=productPdfResources.subscribe(src,()=>{setPdf(null);setRevision(value=>value+1);});
    void Promise.resolve().then(()=>{if(cancelled)return null;setLoading(true);setError('');return productPdfResources.document(src);}).then(resource => { if(!resource)return;if (!cancelled) {setDragging(false);setPdf(resource.document);} else productPdfResources.releaseUnused(src); }).catch(reason => { if (!cancelled) { setError(reason.message); setLoading(false); } });
    return () => { cancelled = true; drag.current=null;unsubscribe(); setPdf(null); productPdfResources.releaseUnused(src); };
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
        if(!cancelled&&zoomAnchor.current&&container.current){
          const element=container.current,anchor=zoomAnchor.current;zoomAnchor.current=null;
          element.scrollLeft=Math.max(0,Math.min(element.scrollWidth-element.clientWidth,canvas.current.offsetLeft+anchor.x*viewport.width-element.clientWidth/2));
          element.scrollTop=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,canvas.current.offsetTop+anchor.y*viewport.height-element.clientHeight/2));
          restoreScroll.current=false;rememberScroll(element);
        }
        if(!cancelled&&restoreScroll.current&&container.current){
          const saved=savedScroll.current;
          if(saved){container.current.scrollTop=saved.top;container.current.scrollLeft=saved.left;}
          restoreScroll.current=false;
        }
      } catch (reason) { if (!cancelled) {zoomAnchor.current=null;setError(reason instanceof Error ? reason.message : 'PDF渲染失败');} }
      finally { if (!cancelled) setLoading(false); }
    });
    return () => { cancelled = true; render?.cancel(); };
  }, [pdf, page, zoom, area, fit, rotation,rememberScroll]);
  return <div>
    <Modal title="图纸显示异常或不完整" open={active&&browserHelpOpen} getContainer={tabContext?.container||false} onCancel={()=>setBrowserHelpOpen(false)} onOk={()=>setBrowserHelpOpen(false)} okText="知道了" cancelButtonProps={{hidden:true}}>
      <p>若图纸缺字、缺线或无法显示，请先使用最新版 Microsoft Edge 或 Google Chrome 重新打开系统；已安装的浏览器请更新后重试。</p>
      <Space wrap><a href="https://www.microsoft.com/zh-cn/edge/download" target="_blank" rel="noopener noreferrer">Microsoft Edge 官方下载</a><a href="https://www.google.cn/chrome/" target="_blank" rel="noopener noreferrer">Chrome 中文官方下载</a></Space>
      <p>下载网站是否可访问取决于当前网络。打不开时请联系管理员协助安装。更换浏览器后仍有问题，请反馈内部料号、图号和截图。</p>
    </Modal>
    <Spin spinning={loading}><div ref={container} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onScroll={event=>{
      if(restoreScroll.current)return;
      rememberScroll(event.currentTarget);
    }} className={[styles.viewer,zoom>100||fit==='width'?styles.pannable:'',active&&dragging?styles.dragging:''].filter(Boolean).join(' ')}>
      <canvas ref={canvas} aria-label={title} onDoubleClick={doubleClick} className={error?styles.failedCanvas:styles.canvas} />
      {!loading&&error&&<div className={styles.previewError}><Alert type="error" message={error} /><Button type="link" onClick={()=>setBrowserHelpOpen(true)}>显示不完整</Button></div>}
    </div></Spin>
    <div className={styles.pdfControls}><Space wrap><Button size="small" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</Button><span>{page} / {pdf?.numPages || '—'}</span><Button size="small" disabled={!pdf || page >= pdf.numPages || loading} onClick={() => setPage(value => value + 1)}>下一页</Button></Space><Space wrap><Button size="small" aria-label="向左旋转90度" icon={<RotateLeftOutlined />} disabled={!pdf||loading||Boolean(error)} onClick={()=>setRotation(value=>(value+270)%360)}>左转</Button><Button size="small" aria-label="向右旋转90度" icon={<RotateRightOutlined />} disabled={!pdf||loading||Boolean(error)} onClick={()=>setRotation(value=>(value+90)%360)}>右转</Button><Button size="small" aria-label="复位图纸方向" icon={<UndoOutlined />} disabled={!pdf||loading||Boolean(error)} onClick={()=>{setRotation(0);setFit('page');setZoom(100);}}>复位</Button><Button size="small" aria-label="缩小图纸" disabled={zoom <= 50} onClick={() => setZoom(value => value - 25)}>−</Button><span>{zoom}%</span><Button size="small" aria-label="放大图纸" disabled={zoom >= 200} onClick={() => setZoom(value => value + 25)}>＋</Button><Button size="small" onClick={() => { setFit('page'); setZoom(100); }}>整页</Button><Button size="small" onClick={() => { setFit('width'); setZoom(100); }}>适合宽度</Button></Space></div>
  </div>;
}
