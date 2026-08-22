import assert from "node:assert/strict";
import { buildProductionExportRows } from "../src/lib/productionExcel.ts";

const rows = buildProductionExportRows(
  [{ date: "2026-08-01", records: [{ line: "1#", dailyQty: 120 }], summary: { lines: 1, totalDailyQty: 120 } }],
  [{ key: "date", title: "日期" }, { key: "line", title: "产线" }, { key: "dailyQty", title: "当天生产" }],
  [{ key: "date", title: "日期" }, { key: "lines", title: "产线数" }, { key: "totalDailyQty", title: "当天生产" }],
);

assert.deepEqual(rows.detail, [{ "日期": "2026-08-01", "产线": "1#", "当天生产": 120 }]);
assert.deepEqual(rows.summary, [{ "日期": "2026-08-01", "产线数": 1, "当天生产": 120 }]);

console.log("Production Excel tests passed.");
