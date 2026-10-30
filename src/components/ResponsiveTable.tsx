import type {Key} from 'react';
import {TabPageContext} from '../lib/tabPageContext';
import {writeTabSnapshot} from '../lib/tabPageCache';
import {useTabPage,useTabState} from '../lib/tabPageContext';
import { useEffect,useLayoutEffect,useRef,useState,useContext } from "react";
import { Table } from "antd";
import type { TableProps } from "antd";
import type {TableRef} from 'antd/es/table';
import type {TableScrollPosition} from '../types/tableScroll';
import {captureTableScroll,restoreTableScroll,registerTableScroller} from '../lib/tableScroll';
import { getTableViewportHeight } from "../lib/tableViewport";
import styles from "./ResponsiveTable.module.css";

interface ResponsiveTableProps<RecordType extends object> extends TableProps<RecordType> {
  minWidth: number;
  cacheKey?:string;
  /** 单列表填满内容区剩余空间；分组多表保留页面滚动。 */
  fitViewport?: boolean;
  bottomScrollbar?: boolean;
  /** 虚拟滚动单行高度（px）。antd Table 的 virtual 只暴露 boolean，但运行时会把该值
   *  透传给底层 rc-virtual-list 的 listItemHeight，用于估算未渲染行高度；与 CSS 实际
   *  行高不一致时，冷返回跳转滚动会算错 scrollHeight，导致滚不到底、数据缺失。 */
  listItemHeight?: number;
}

export function ResponsiveTable<RecordType extends object>({ minWidth, scroll, fitViewport = false, bottomScrollbar = true, cacheKey="table", ...props }: ResponsiveTableProps<RecordType>) {
  const tab=useTabPage();
  const initialPagination=props.pagination===false?{}:props.pagination;
  const [page,setPage]=useTabState(`${cacheKey}:page`,initialPagination?.defaultCurrent||1);
  const [pageSize,setPageSize]=useTabState(`${cacheKey}:pageSize`,initialPagination?.defaultPageSize||10);
  const [expanded,setExpanded]=useTabState<readonly Key[]>(`${cacheKey}:expanded`,props.expandable?.defaultExpandedRowKeys||[]);
  const pageContext=useContext(TabPageContext);
  const shellRef = useRef<HTMLDivElement>(null);
  const tableRef=useRef<TableRef>(null);
  const restoring=useRef(false);
  const restoredVirtualInstance=useRef<number|undefined>(undefined);
  const barRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [bodyHeight, setBodyHeight] = useState(240);

  useEffect(() => {
    const shell = shellRef.current;
    if (!tab.active || !fitViewport || !shell) return;
    const container = shell.closest<HTMLElement>("[data-page-scroll-container]");
    const boundary = shell.closest<HTMLElement>('[data-table-height-boundary]');
    let frame = 0;
    const outerHeight = (element: HTMLElement) => {
      const css = getComputedStyle(element);
      return element.getBoundingClientRect().height + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
    };
    const measure = () => {
      const top = shell.getBoundingClientRect().top;
      let bottom = Math.min(container?.getBoundingClientRect().bottom ?? window.innerHeight, window.innerHeight);
      let inset = 8;
      // Auto-height ancestors depend on this table and cannot constrain its
      // height. Only a caller's explicitly bounded layout may narrow the viewport.
      if(boundary&&getComputedStyle(boundary).getPropertyValue('--table-height-boundary').trim()!=='none'){
        const rect=boundary.getBoundingClientRect();
        if(rect.height>0){
          bottom=Math.min(bottom,rect.bottom-(parseFloat(getComputedStyle(boundary).paddingBottom)||0));
          inset = 0;
        }
      }
      const chrome = Array.from(shell.querySelectorAll<HTMLElement>(".ant-table-header, .ant-table-title, .ant-table-footer, .ant-table-pagination"))
        .reduce((sum, element) => sum + outerHeight(element), bottomScrollbar ? 18 : 0) + 2;
      const next = getTableViewportHeight(top, bottom, chrome, inset);
      shell.style.setProperty("--table-body-height", `${next}px`);
      setBodyHeight(previous => previous === next ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const sizes = new ResizeObserver(schedule);
    for (const element of [shell,shell.parentElement,boundary,container]) if (element) sizes.observe(element);
    const observeChrome = () => {
      shell.querySelectorAll<HTMLElement>(".ant-table-header, .ant-table-pagination, .ant-table-title, .ant-table-footer").forEach(element => sizes.observe(element));
      schedule();
    };
    const mutations = new MutationObserver(records=>{
      if(!props.virtual||records.some(record=>!(record.target instanceof Element?record.target:record.target.parentElement)?.closest('.ant-table-tbody-virtual')))observeChrome();
    });
    mutations.observe(shell.closest("[data-table-page-viewport]") || shell.parentElement || shell, {childList:true,subtree:true,characterData:true});
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    observeChrome();
    return () => {
      cancelAnimationFrame(frame);sizes.disconnect();mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      // Keep the last geometry for warm retained pages while measurements pause.
    };
  }, [fitViewport,bottomScrollbar,tab.active,props.virtual]);

  useEffect(() => {
    const shell = shellRef.current;
    const top = barRef.current;
    const spacer = widthRef.current;
    const range = rangeRef.current;
    if (!tab.active || !bottomScrollbar || !shell || !top || !spacer) return;
    let body: HTMLElement | null = null;
    let header: HTMLElement | null = null;
    let contentTable: HTMLElement | null = null;

    // 保持 body 的原生 scroll 事件，rc-table 仍能更新固定列阴影和表头。
    const synchronize = (left: number) => {
      if (range) range.value = String(left);
      for (const element of [top, body, header]) {
        if (element && element.scrollLeft !== left) element.scrollLeft = left;
      }
    };
    const onScroll = (event: Event) => synchronize((event.currentTarget as HTMLElement).scrollLeft);
    const measure = () => {
      if (!body) return;
      const rect = body.getBoundingClientRect();
      let bottom = window.innerHeight;
      for (let parent = shell.parentElement; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (parent.hasAttribute("data-page-scroll-container") || /hidden|auto|scroll/.test(css.overflowY)) {
          const bounds = parent.getBoundingClientRect();
          if (bounds.height > 0) bottom = Math.min(bottom, bounds.bottom - (parseFloat(css.paddingBottom) || 0));
        }
      }
      const floating = !fitViewport && rect.top < bottom && rect.bottom > bottom;
      top.style.position = floating ? "fixed" : "";
      top.style.left = floating ? `${rect.left}px` : "";
      top.style.bottom = floating ? `${window.innerHeight - bottom}px` : "";
      top.style.width = `${body.clientWidth}px`;
      spacer.style.width = `${body.scrollWidth}px`;
      if (range) { range.style.setProperty("--table-scroll-thumb-width", `${Math.max(28, body.clientWidth * body.clientWidth / Math.max(body.scrollWidth, 1))}px`); range.max = String(Math.max(0, body.scrollWidth - body.clientWidth)); range.disabled = body.scrollWidth <= body.clientWidth; }
      synchronize(body.scrollLeft);
    };
    let measureFrame = 0;
    const scheduleMeasure = () => { cancelAnimationFrame(measureFrame); measureFrame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(scheduleMeasure);
    const bind = () => {
      const nextBody = shell.querySelector<HTMLElement>(".ant-table-body, .ant-table-content");
      const nextHeader = shell.querySelector<HTMLElement>(".ant-table-header");
      const nextTable = nextBody?.querySelector<HTMLElement>("table") ?? null;
      if (nextBody !== body || nextHeader !== header || nextTable !== contentTable) {
        body?.removeEventListener("scroll", onScroll);
        header?.removeEventListener("scroll", onScroll);
        observer.disconnect();
        body = nextBody;
        header = nextHeader;
        contentTable = nextTable;
        body?.addEventListener("scroll", onScroll, { passive: true });
        header?.addEventListener("scroll", onScroll, { passive: true });
        for (const element of [shell, body, header, contentTable]) if (element) observer.observe(element);
      }
      measure();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!body) return;
      const max = Math.max(0, body.scrollWidth - body.clientWidth);
      const destinations: Record<string, number> = {
        ArrowLeft: top.scrollLeft - 40, ArrowRight: top.scrollLeft + 40,
        PageUp: top.scrollLeft - body.clientWidth, PageDown: top.scrollLeft + body.clientWidth,
        Home: 0, End: max,
      };
      const next = destinations[event.key];
      if (next === undefined) return;
      event.preventDefault();
      synchronize(Math.max(0, Math.min(max, next)));
    };
    const onRangeInput = () => { if (range) synchronize(Number(range.value)); };
    document.addEventListener("scroll", scheduleMeasure, { passive: true, capture: true });
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    range?.addEventListener("input", onRangeInput);
    top.addEventListener("scroll", onScroll, { passive: true });
    top.addEventListener("keydown", onKeyDown);
    bind();
    // 分类/列宽、空数据及固定表头切换可能替换 table/body 节点。
    const mutations = new MutationObserver(bind);
    mutations.observe(shell, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(measureFrame);
      mutations.disconnect();
      observer.disconnect();
      document.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("scroll", scheduleMeasure);
      range?.removeEventListener("input", onRangeInput);
      top.removeEventListener("scroll", onScroll);
      top.removeEventListener("keydown", onKeyDown);
      body?.removeEventListener("scroll", onScroll);
      header?.removeEventListener("scroll", onScroll);
    };
  }, [bottomScrollbar, fitViewport, tab.active]);

  useLayoutEffect(()=>{
    const shell=shellRef.current;if(!shell||!props.virtual)return;
    return registerTableScroller(shell,key=>{
      const rowKey=props.rowKey;
      const exists=props.dataSource?.some((row,index)=>String(typeof rowKey==='function'?rowKey(row,index):row[ (rowKey||'key') as keyof RecordType])===key);
      if(!exists||!tableRef.current)return false;
      tableRef.current.scrollTo({key});return true;
    });
  },[props.virtual,props.rowKey,props.dataSource]);
  useLayoutEffect(()=>{
    if(!tab.managed||!tab.active)return;
    const shell=shellRef.current;if(!shell)return;
    const instance=pageContext?.instance??0;
    if(props.virtual&&restoredVirtualInstance.current===instance){restoring.current=false;return;}
    const saved=pageContext?.record.snapshot.get(`${cacheKey}:scroll`) as TableScrollPosition|undefined;
    if(!saved){restoring.current=false;if(props.virtual)restoredVirtualInstance.current=instance;return;}
    let frame=0;restoring.current=true;
    // Keep a bounded layout-settling window: initial rc-table effects may reset
    // the header after the anchor first appears. Pending key requests dedupe below.
    const apply=()=>{restoreTableScroll(shell,saved);if(props.virtual)frame=requestAnimationFrame(apply);};
    const stop=()=>{restoring.current=false;cancelAnimationFrame(frame)};
    const finish=()=>{stop();if(props.virtual)restoredVirtualInstance.current=instance};
    apply();const timer=setTimeout(finish,250);
    const events=['wheel','touchstart','pointerdown','keydown'];events.forEach(event=>shell.addEventListener(event,finish,{capture:true,once:true}));
    // StrictMode may disconnect before the first virtual layout. Keep the saved
    // anchor intact until a completed restore or an explicit user interaction.
    return ()=>{clearTimeout(timer);cancelAnimationFrame(frame);events.forEach(event=>shell.removeEventListener(event,finish,true));};
  // Restore only when the page instance/visibility changes, never fight user scrolling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab.managed,tab.active,props.virtual]);
  useEffect(()=>{
    const shell=shellRef.current;if(!shell||!tab.managed||!tab.active||!props.virtual||!pageContext)return;
    let frame=0;
    const capture=()=>{if(!restoring.current)writeTabSnapshot(pageContext.record,`${cacheKey}:scroll`,captureTableScroll(shell),pageContext.instance)};
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(capture)})};
    shell.addEventListener('scroll',schedule,true);
    return ()=>{cancelAnimationFrame(frame);capture();shell.removeEventListener('scroll',schedule,true)};
  },[tab.managed,tab.active,props.virtual,pageContext,cacheKey]);
  const pagination=tab.managed&&props.pagination!==false?{...props.pagination,current:initialPagination?.current??page,pageSize:initialPagination?.pageSize??pageSize}:props.pagination;
  const expandable=tab.managed&&props.expandable?{...props.expandable,expandedRowKeys:props.expandable.expandedRowKeys??expanded,onExpandedRowsChange:(keys:readonly Key[])=>{setExpanded(keys);props.expandable?.onExpandedRowsChange?.(keys);}}:props.expandable;
  return (
    <div ref={shellRef} data-table-scroll-root data-scroll-managed={props.virtual||undefined} className={`${styles.tableShell} ${fitViewport ? styles.viewportShell : ""} ${bottomScrollbar ? styles.withBottomScrollbar : ""}`}>
      {/* listItemHeight 不在 antd TableProps 公共类型里，运行时透传即可；断言为 TableProps 只去掉多余键的类型检查。 */}
      <Table<RecordType> {...(props as TableProps<RecordType>)} ref={tableRef} pagination={pagination} expandable={expandable}
        onChange={(pagination,filters,sorter,extra)=>{if(tab.managed){setPage(pagination.current||1);setPageSize(pagination.pageSize||10);}props.onChange?.(pagination,filters,sorter,extra);}}
        onScroll={event=>{if(tab.managed&&!props.virtual&&!restoring.current){const body=event.currentTarget;if(pageContext)writeTabSnapshot(pageContext.record,`${cacheKey}:scroll`,{top:body.scrollTop,left:body.scrollLeft},pageContext.instance);}props.onScroll?.(event);}}
        scroll={{ ...scroll, ...(fitViewport ? { y: bodyHeight } : {}), x: minWidth }} />
      {bottomScrollbar && (
        <div className={styles.scrollbarSlot}><div ref={barRef} className={styles.bottomScrollbar} tabIndex={0} role="region" aria-label="表格横向滚动">
          <input ref={rangeRef} type="range" min="0" max="0" defaultValue="0" step="1" className={styles.scrollbarControl} aria-label="左右拖动表格" />
          <div ref={widthRef} className={styles.scrollbarWidth} />
        </div></div>
      )}
    </div>
  );
}
