import assert from "node:assert/strict";
import { normalizePersonnel, personnelToTags, splitPersonnelNames, sortRecordsByOrderQty } from "../src/lib/productionEntry.ts";

const copyModule = await import("../src/lib/productionCopy.ts").catch(() => null);
assert.ok(copyModule, "生产日报复制值构建器应存在");

const tableModule = await import("../src/lib/productionTable.ts").catch(() => null);
assert.ok(tableModule, "生产日报表格配置应存在");
assert.equal(typeof tableModule.getProductionDailyTableSticky, "function", "日报表格应提供吸顶表头配置");
const tableContainer = {} as HTMLElement;
const stickyConfig = tableModule.getProductionDailyTableSticky(() => tableContainer);
assert.equal(stickyConfig.offsetHeader, 0);
assert.equal(stickyConfig.getContainer(), tableContainer);

const records = [
  { id: 1, orderQty: 0 },
  { id: 2, orderQty: 1200 },
  { id: 3, orderQty: null },
  { id: 4, orderQty: 300 },
];

assert.deepEqual(sortRecordsByOrderQty(records, "desc").map((record) => record.id), [2, 4, 1, 3]);
assert.deepEqual(sortRecordsByOrderQty(records, "asc").map((record) => record.id), [4, 2, 1, 3]);
assert.deepEqual(sortRecordsByOrderQty(records, null).map((record) => record.id), [1, 2, 3, 4]);
assert.deepEqual(records.map((record) => record.id), [1, 2, 3, 4]);

assert.equal(normalizePersonnel(["张三", "外发", "临时工"]), "张三、外发、临时工");
assert.equal(normalizePersonnel("外发"), "外发");
assert.equal(normalizePersonnel(undefined), "");
assert.deepEqual(splitPersonnelNames("张三、李四，王五,赵六"), ["张三", "李四", "王五", "赵六"]);
assert.deepEqual(personnelToTags("张三、李四"), ["张三", "李四"]);

const assemblyCopy = copyModule.buildAssemblyCopyValues({
  orderQty: 1200,
  planQty: 1100,
  dailyQty: 1000,
  cumulativeQty: 900,
  defects: 5,
});
assert.deepEqual(assemblyCopy, {
  orderQty: 1200,
  planQty: 1100,
  dailyQty: 1000,
  cumulativeQty: 900,
  defects: 5,
});

const injectionCopy = copyModule.buildInjectionCopyValues({
  orderQty: 2400,
  dailyQty: 800,
  cumulativeQty: 1600,
  defects: 3,
});
assert.deepEqual(injectionCopy, {
  orderQty: 2400,
  dailyQty: 800,
  cumulativeQty: 1600,
  defects: 3,
});

console.log("Production entry UI tests passed.");
