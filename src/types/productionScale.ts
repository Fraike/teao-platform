import type { TableProps } from "antd";
import type { OrderQtySort } from "../lib/productionEntry";

export interface ProductionHistoryCacheEntry<T> {
  data: T[];
  expiresAt: number;
}

export interface ProductionDateTableProps<T extends { id: number; orderQty: number }> {
  records: T[];
  columns: TableProps<T>["columns"];
  orderQtySort: OrderQtySort;
  minWidth: number;
  sticky: TableProps<T>["sticky"];
}
