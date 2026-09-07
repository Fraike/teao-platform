import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureUniqueProductIds,
  formatDomesticPrice,
  isTaxIncluded,
  removeProductById,
  taxNoteFromSelection,
  taxSelectionFromNote,
  truncateDecimalPlaces,
} from "../src/lib/quotationCompatibility.ts";

test("通用截断工具仍可按调用方指定精度工作", () => {
  assert.equal(truncateDecimalPlaces(1.23459, 4), 1.2345);
  assert.equal(truncateDecimalPlaces(1.99999, 4), 1.9999);
});

test("可按 ID 删除第一项或中间产品", () => {
  const products = [
    { id: "p1", name: "A", unit: "PCS", price: 1 },
    { id: "p2", name: "B", unit: "PCS", price: 2 },
    { id: "p3", name: "C", unit: "PCS", price: 3 },
  ];

  assert.deepEqual(removeProductById(products, "p1").map((product) => product.id), ["p2", "p3"]);
  assert.deepEqual(removeProductById(products, "p2").map((product) => product.id), ["p1", "p3"]);
});

test("国内报价不截断小数位", () => {
  assert.equal(formatDomesticPrice(1.2), "1.2");
  assert.equal(formatDomesticPrice(1.23456789), "1.23456789");
  assert.equal(formatDomesticPrice(0.000001234), "0.000001234");
});

test("历史含税说明可识别为含税状态", () => {
  assert.equal(isTaxIncluded("不含税"), false);
  assert.equal(isTaxIncluded("价格不含增值税"), false);
  assert.equal(isTaxIncluded("含13%税"), true);
  assert.equal(isTaxIncluded("含税"), true);
  assert.equal(isTaxIncluded(""), false);
});

test("历史含税说明可映射为直观的分段选择值", () => {
  assert.equal(taxSelectionFromNote("含13%税"), "included");
  assert.equal(taxSelectionFromNote("价格不含增值税"), "excluded");
  assert.equal(taxSelectionFromNote(""), "excluded");
  assert.equal(taxNoteFromSelection("included"), "含税");
  assert.equal(taxNoteFromSelection("excluded"), "不含税");
});

test("重复产品 ID 会被修复且已有唯一 ID 保持不变", () => {
  const products = [
    { id: "p1", name: "A", unit: "PCS", price: 1 },
    { id: "p1", name: "B", unit: "PCS", price: 2 },
    { id: "p3", name: "C", unit: "PCS", price: 3 },
  ];

  const normalized = ensureUniqueProductIds(products, (index) => `fixed-${index}`);

  assert.deepEqual(normalized.map((product) => product.id), ["p1", "fixed-1", "p3"]);
});
