export type ProductGroup = 'finished' | 'semi' | 'unclassified';
export interface ProductCategoryNode {
  id: string; name: string; parentId: string | null; group: ProductGroup;
  count: number; children: ProductCategoryNode[];
}
export interface ProductMaterial {
  id: string; number: string; name: string;
  model?: string; parent_id?: string; parent_name?: string; base_unit_name?: string;
  stock_id?:string; stock_name?: string; barcode?: string; min_package_qty?: number|string;
  custom_field?:Record<string,string|number|null>;
  [key: string]: unknown;
}
export interface ProductStandardReference {
  drawingSourceNumber?:string;drawingSourceStandardId?:string;
  id: string; serialNo: string; vehicleModel?:string; customer: string; customerPartNo: string;
  model: string; categoryKey: string; categoryName: string;
  versionNo: number; fields: Record<string, string>;
}
export interface ProductArchive {
  id: string; internalNumber: string; kingdeeId: string | null;
  name: string; model: string; category: string; categoryId: string; group: ProductGroup; unit: string;
  material: ProductMaterial | null; kingdeeMissing: boolean;
  standards: ProductStandardReference[]; issues: string[];
  drawingCount: number; productionAvailable: boolean;
}
export interface ProductSyncState {
  running: boolean; lastAttemptAt: string | null; lastSuccessAt: string | null;
  error: string | null; added: number; updated: number; nextIntervalMinutes: number;
}
export type ProductFileKind = "pdf" | "source";
export type ProductFileStatus = "draft" | "published" | "retired";
export type ProductDrawingStructure='geared'|'gearless'|'unspecified';
export type ProductDrawingRole='primary'|'supplement';
export interface ProductDrawing {
  role?:ProductDrawingRole;structure?:ProductDrawingStructure;
  id: string; productId: string; drawingNo: string; version: string;
  filename: string; kind: ProductFileKind; standardIds: string[];
  status: ProductFileStatus; size: number; uploadedBy: string; uploadedAt: string;
  publishedBy: string | null; publishedAt: string | null;
}
export interface ProductDrawingInput {
  role?:ProductDrawingRole;structure?:ProductDrawingStructure;
  drawingNo: string; version: string; filename: string; kind: ProductFileKind; standardIds: string[];
}
export interface ProductActor { id: string; name: string; role: string; permissions: string[]; }
export interface ProductListResponse { ok: boolean; data: ProductArchive[]; categories: ProductCategoryNode[]; sync: ProductSyncState; }
export interface ProductDetailResponse {
  ok: boolean; data: ProductArchive; drawings: ProductDrawing[];
  canManage: boolean; sync: ProductSyncState;
}
export interface DrawingUploadProps {
  product: ProductArchive; open: boolean; onClose: () => void; onSaved: () => void;
}
export interface DrawingPanelProps {
  product: ProductArchive; drawings: ProductDrawing[]; standardId: string;
  canManage: boolean; onChanged: () => void;
}
export interface ProductSeriesIdentity { key: string; name: string; pending: boolean; }
export interface ProductSeriesGroup extends ProductSeriesIdentity { products: ProductArchive[]; models: string[]; }
export interface ProductDrawingStatusRequest {number:string;standardId:string;}
export interface ProductDrawingStatus extends ProductDrawingStatusRequest {hasDrawing:boolean;}

export interface ProductBusinessFields {packageQuantity:number|null;warehouseName:string|null;weight:number|null;weightUnit:'g';}

export interface ProductPdfPageSize {width:number;height:number;}
export interface ProductPdfBox extends ProductPdfPageSize {x:number;y:number;}
