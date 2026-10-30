import type {TableScrollPosition,TableScrollController} from '../types/tableScroll';

const scrollers=new WeakMap<HTMLElement,TableScrollController>();
export const tableBodySelector='.ant-table-tbody-virtual-holder, .ant-table-body, .ant-table-content';
export function registerTableScroller(root:HTMLElement,scrollToKey:(key:string)=>boolean){
  const controller={scrollToKey};scrollers.set(root,controller);
  return ()=>{if(scrollers.get(root)===controller)scrollers.delete(root)};
}
function scrollerFor(root:HTMLElement){
  const shell=root.querySelector<HTMLElement>('[data-table-scroll-root]');
  return scrollers.get(root)||(shell?scrollers.get(shell):undefined);
}
export function captureTableScroll(root:HTMLElement):TableScrollPosition {
  const body=root.querySelector<HTMLElement>(tableBodySelector);
  if(!body)return {top:0,left:0};
  const virtual=body.classList.contains('ant-table-tbody-virtual-holder');
  const header=root.querySelector<HTMLElement>('.ant-table-header');
  const result:TableScrollPosition={top:body.scrollTop,left:virtual?(header?.scrollLeft||0):body.scrollLeft};
  if(virtual){
    const top=body.getBoundingClientRect().top;
    const row=[...body.querySelectorAll<HTMLElement>('[data-row-key]')].find(row=>row.getBoundingClientRect().bottom>top);
    if(row){result.anchorId=row.dataset.rowKey;result.anchorOffset=row.getBoundingClientRect().top-top;}
  }
  return result;
}
export function restoreTableScroll(root:HTMLElement,position:TableScrollPosition):boolean{
  const body=root.querySelector<HTMLElement>(tableBodySelector);if(!body)return false;
  const virtual=body.classList.contains('ant-table-tbody-virtual-holder');
  const header=root.querySelector<HTMLElement>('.ant-table-header');
  if(header&&header.scrollLeft!==position.left){header.scrollLeft=position.left;header.dispatchEvent(new window.Event('scroll'));}
  if(!virtual&&body.scrollLeft!==position.left)body.scrollLeft=position.left;
  if(virtual&&position.anchorId){
    const controller=scrollerFor(root);
    const anchor=[...body.querySelectorAll<HTMLElement>('[data-row-key]')].find(row=>row.dataset.rowKey===position.anchorId);
    if(anchor){
      if(controller)controller.pendingAnchor=undefined;
      const bounds=anchor.getBoundingClientRect();
      if(bounds.height>0){const delta=bounds.top-body.getBoundingClientRect().top-(position.anchorOffset||0);if(Math.abs(delta)>0.5){body.scrollTop+=delta;return false;}}
      else if(body.scrollTop!==position.top)body.scrollTop=position.top;
      return true;
    }
    // An accepted scrollTo is still pending. Let the virtual list finish its own
    // async measurements without cancelling/reissuing the same request each frame.
    const request=JSON.stringify([position.anchorId,position.top,position.anchorOffset]);
    if(controller?.pendingAnchor===request)return false;
    if(controller?.scrollToKey(position.anchorId)){controller.pendingAnchor=request;return false;}
    // 数据未就绪：先用原始 scrollTop 兜底，下一帧再重试锚点定位。
    if(body.scrollTop!==position.top)body.scrollTop=position.top;
    return false;
  }
  if(body.scrollTop!==position.top)body.scrollTop=position.top;
  return true;
}
