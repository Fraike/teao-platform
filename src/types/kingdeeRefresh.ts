export type KingdeeProductRefresh =
  | { ok: true; finishedCount: number; plasticCount: number; fetchedAt: string | null }
  | { ok: false; error: string };

export type KingdeeCustomerRefresh =
  | { ok: true; count: number; fetchedAt: string | null }
  | { ok: false; error: string };

export interface KingdeeDataRefreshResult {
  products: KingdeeProductRefresh;
  customers: KingdeeCustomerRefresh;
}

export interface KingdeeRefreshMessage {
  level: "success" | "warning" | "error";
  content: string;
}
