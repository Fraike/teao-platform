export interface TableScrollPosition {
  top:number;
  left:number;
  anchorId?:string;
  anchorOffset?:number;
}
export interface TableScrollController {
  scrollToKey:(key:string)=>boolean;
  pendingAnchor?:string;
}
