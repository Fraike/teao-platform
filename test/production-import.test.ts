import assert from "node:assert/strict";
import { getImportedDateRange } from "../src/lib/productionImport.ts";

assert.deepEqual(
  getImportedDateRange([{ date: "2026-04-30" }, { date: "2026-04-22" }, { date: "2026-05-04" }]),
  { dateFrom: "2026-04-22", dateTo: "2026-05-04" },
);

assert.equal(getImportedDateRange([]), null);

console.log("Production import tests passed.");
