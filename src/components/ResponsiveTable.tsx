import { useEffect, useRef, useState } from "react";
import { Table } from "antd";
import type { TableProps } from "antd";
import { getTableViewportHeight } from "../lib/tableViewport";
import styles from "./ResponsiveTable.module.css";

interface ResponsiveTableProps<RecordType extends object> extends TableProps<RecordType> {
  minWidth: number;
  /** 单列表填满内容区剩余空间；分组多表保留页面滚动。 */
  fitViewport?: boolean;
  bottomScrollbar?: boolean;
}

export function ResponsiveTable<RecordType extends object>({ minWidth, scroll, fitViewport = false, bottomScrollbar = true, ...props }: ResponsiveTableProps<RecordType>) {
  const shellRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [bodyHeight, setBodyHeight] = useState(240);

  useEffect(() => {
    const shell = shellRef.current;
    if (!fitViewport || !shell) return;
    const container = shell.closest<HTMLElement>("[data-page-scroll-container]");
    let frame = 0;
    const outerHeight = (element: HTMLElement) => {
      const css = getComputedStyle(element);
      return element.getBoundingClientRect().height + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
    };
    const measure = () => {
      const top = shell.getBoundingClientRect().top;
      let bottom = Math.min(container?.getBoundingClientRect().bottom ?? window.innerHeight, window.innerHeight);
      let inset = 8;
      for (let parent = shell.parentElement; parent && parent !== container; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (rect.height > 0 && (css.display === "flex" || /hidden|auto|scroll/.test(css.overflowY) || parent.parentElement?.hasAttribute("data-table-page-viewport"))) {
          bottom = Math.min(bottom, rect.bottom - (parseFloat(css.paddingBottom) || 0));
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
    for (const element of [shell, shell.parentElement, container]) if (element) sizes.observe(element);
    const observeChrome = () => {
      shell.querySelectorAll<HTMLElement>(".ant-table-header, .ant-table-pagination, .ant-table-title, .ant-table-footer").forEach(element => sizes.observe(element));
      schedule();
    };
    const mutations = new MutationObserver(observeChrome);
    mutations.observe(shell.closest("[data-table-page-viewport]") || shell.parentElement || shell, {childList:true,subtree:true,characterData:true});
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    observeChrome();
    return () => {
      cancelAnimationFrame(frame);sizes.disconnect();mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      shell.style.removeProperty("--table-body-height");
    };
  }, [fitViewport, bottomScrollbar]);

  useEffect(() => {
    const shell = shellRef.current;
    const top = barRef.current;
    const spacer = widthRef.current;
    const range = rangeRef.current;
    if (!bottomScrollbar || !shell || !top || !spacer) return;
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
  }, [bottomScrollbar, fitViewport]);

  return (
    <div ref={shellRef} className={`${styles.tableShell} ${fitViewport ? styles.viewportShell : ""} ${bottomScrollbar ? styles.withBottomScrollbar : ""}`}>
      <Table<RecordType> {...props} scroll={{ ...scroll, ...(fitViewport ? { y: bodyHeight } : {}), x: minWidth }} />
      {bottomScrollbar && (
        <div className={styles.scrollbarSlot}><div ref={barRef} className={styles.bottomScrollbar} tabIndex={0} role="region" aria-label="表格横向滚动">
          <input ref={rangeRef} type="range" min="0" max="0" defaultValue="0" step="1" className={styles.scrollbarControl} aria-label="左右拖动表格" />
          <div ref={widthRef} className={styles.scrollbarWidth} />
        </div></div>
      )}
    </div>
  );
}
