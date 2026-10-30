import type {StandardScrollPosition} from '../types/standardPageSession';
import {captureTableScroll,restoreTableScroll,tableBodySelector} from './tableScroll';
function scrollElements(root:HTMLElement){
  return {body:root.querySelector<HTMLElement>(tableBodySelector),outer:root.closest<HTMLElement>('[data-page-scroll-container]')};
}
export function captureStandardScroll(root:HTMLElement,anchorId=''):StandardScrollPosition {
  const {body,outer}=scrollElements(root),top=body?.getBoundingClientRect().top||0;
  const rows=[...root.querySelectorAll<HTMLElement>('[data-row-key]')];
  const anchor=rows.find(row=>row.dataset.rowKey===anchorId)||rows.find(row=>row.getBoundingClientRect().bottom>top);
  const position=captureTableScroll(root);
  return {tableTop:position.top,tableLeft:position.left,pageTop:outer?.scrollTop||0,pageLeft:outer?.scrollLeft||0,
    anchorId:anchor?.dataset.rowKey||'',anchorOffset:anchor?anchor.getBoundingClientRect().top-top:0};
}
export function restoreStandardScroll(root:HTMLElement,position:StandardScrollPosition){
  const {body,outer}=scrollElements(root);
  if(outer){outer.scrollTop=position.pageTop;outer.scrollLeft=position.pageLeft;}
  if(!body)return;
  if(body.classList.contains('ant-table-tbody-virtual-holder')){
    restoreTableScroll(root,{top:position.tableTop,left:position.tableLeft,anchorId:position.anchorId,anchorOffset:position.anchorOffset});return;
  }
  body.scrollTop=position.tableTop;body.scrollLeft=position.tableLeft;
  const anchor=[...root.querySelectorAll<HTMLElement>('tr[data-row-key]')].find(row=>row.dataset.rowKey===position.anchorId);
  if(anchor){
    const rect=anchor.getBoundingClientRect();
    // jsdom has no layout; use raw scroll offsets until a real row is measurable.
    if(rect.height>0)body.scrollTop+=rect.top-body.getBoundingClientRect().top-position.anchorOffset;
  }
  const header=root.querySelector<HTMLElement>('.ant-table-header');if(header)header.scrollLeft=body.scrollLeft;
}
