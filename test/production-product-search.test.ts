import assert from "node:assert/strict";

const productSearch = await import("../src/lib/productionProductSearch.ts").catch(() => null);
assert.ok(productSearch, "生产商品搜索工具应存在");

const products = [
  { value: "material-1", label: "SP0001 · RD-01 齿轮阻尼器", productName: "RD-01 齿轮阻尼器" },
  { value: "material-2", label: "SP0002 · P71 把手", productName: "P71 把手" },
  { value: "material-3", label: "SP0003 · RD-02 圆筒阻尼器", productName: "RD-02 圆筒阻尼器" },
];

assert.deepEqual(productSearch.filterProductionProductOptions(products, "rd-"), [products[0], products[2]]);
assert.deepEqual(productSearch.filterProductionProductOptions(products, "sp0002"), [products[1]]);
assert.deepEqual(productSearch.filterProductionProductOptions(products, " "), products);
assert.deepEqual(productSearch.filterProductionProductOptions(products, "不存在"), []);
assert.deepEqual(products.map((product) => product.value), ["material-1", "material-2", "material-3"]);

assert.equal(typeof productSearch.toProductionProductOptions, "function", "商品选项应使用金蝶商品 ID 作为唯一值");
const duplicateProducts = productSearch.toProductionProductOptions([
  { id: "first", number: "SP0009-D", name: "RD-02" },
  { id: "second", number: "SP0021-D", name: "RD-02" },
]);
assert.deepEqual(duplicateProducts.map((product) => product.value), ["first", "second"]);
assert.deepEqual(duplicateProducts.map((product) => product.label), ["SP0009-D · RD-02", "SP0021-D · RD-02"]);
assert.deepEqual(duplicateProducts.map((product) => product.productName), ["RD-02", "RD-02"]);

const unorderedProducts = productSearch.toProductionProductOptions([
  { id: "ten", number: "SP0010-D", name: "十号商品" },
  { id: "two", number: "SP0002-D", name: "二号商品" },
  { id: "nine", number: "SP0009-D", name: "九号商品" },
  { id: "no-number", name: "无编号商品" },
]);
assert.deepEqual(
  unorderedProducts.map((product) => product.label),
  ["SP0002-D · 二号商品", "SP0009-D · 九号商品", "SP0010-D · 十号商品", "无编号商品"],
  "商品选项应按编号自然升序排列，未编号商品置后"
);

console.log("Production product search tests passed.");
