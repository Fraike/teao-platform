import { memo, useMemo } from "react";
import { ResponsiveTable } from "./ResponsiveTable";
import { sortRecordsByOrderQty } from "../lib/productionEntry";
import { productionDailyPagination } from "../lib/productionTable";
import type { ProductionDateTableProps } from "../types/productionScale";

const rowClassName = (_: unknown, index: number) => index % 2 === 0 ? "table-row-even" : "table-row-odd";
const locale = { emptyText: "暂无数据" };

function ProductionDateTableInner<T extends { id: number; orderQty: number }>({
  records, columns, orderQtySort, minWidth, sticky,cacheKey,
}: ProductionDateTableProps<T>) {
  const sortedRecords = useMemo(() => orderQtySort ? sortRecordsByOrderQty(records, orderQtySort) : records, [records, orderQtySort]);
  return <ResponsiveTable<T> cacheKey={cacheKey} rowKey="id" bottomScrollbar={false} columns={columns}
    dataSource={sortedRecords} pagination={productionDailyPagination} size="small" minWidth={minWidth}
    bordered rowClassName={rowClassName} locale={locale} sticky={sticky} />;
}

export const ProductionDateTable = memo(ProductionDateTableInner) as typeof ProductionDateTableInner;
