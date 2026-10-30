import type {StandardCategory,StandardPageResponse,StandardStatus,StandardType} from './standard';
export interface StandardPageFilters {search:string;serialNo:string;customer:string;model:string;customerPartNo:string;vehicleModel:string;}
export interface StandardScrollPosition {
  tableTop:number;tableLeft:number;pageTop:number;pageLeft:number;anchorId:string;anchorOffset:number;
}
export interface StandardPageView {
  category:string;status:StandardStatus|'all';standardType:StandardType|'all';filters:StandardPageFilters;
}
export interface StandardPageCache {query:string;response:StandardPageResponse;categories:StandardCategory[];fetchedAt:number;refreshedAt:string;}
export interface StandardPageSnapshot {view:StandardPageView;cache:StandardPageCache|null;scroll:StandardScrollPosition|null;entryKey:string;}
export interface StandardPageSession {scope:string;generation:number;snapshot:StandardPageSnapshot|null;}
