import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "teao-quotation-test-"));
process.env.DATA_DIR = dataDir;
process.env.QUOTATION_DB_PATH = path.join(dataDir, "quotation.db");

const {
  initQuotationDB,
  createQuotation,
  getQuotation,
  listQuotations,
  updateQuotation,
  deleteQuotation,
  migrateLegacyHistory,
  closeQuotationDB,
} = await import("../server/services/quotation-store.js");

const quotation = {
  customer: { name: "测试客户", contact: "张三", tel: "13800000000", email: "test@example.com" },
  quoteMeta: {
    no: "Q-TEST-001",
    date: "2026-07-31",
    salesName: "测试业务员",
    salesTel: "13800000001",
    currency: "CNY",
    taxNote: "含税",
    showStamp: true,
    showMold: false,
    showAmount: true,
    tableColumnWidths: {},
  },
  products: [{ id: "p1", name: "阻尼器", unit: "PCS", qty: 100, price: 12.5, freight: 30, image: "data:image/png;base64,AA==" }],
  terms: ["测试条款"],
  molds: [],
};

try {
  initQuotationDB();
  const created = createQuotation({ market: "domestic", quotation }, { username: "tester", actualQuoterName: "测试登录人" });
  assert.equal(created.quoteNo, "Q-TEST-001");
  assert.equal(created.totalAmount, 1280);
  assert.equal(created.quotation.products[0].image, "data:image/png;base64,AA==");
  assert.equal(created.actualQuoterName, "测试登录人");

  const zeroQuantityInternational = structuredClone(quotation);
  zeroQuantityInternational.quoteMeta.no = "Q-INTL-ZERO";
  zeroQuantityInternational.quoteMeta.currency = "USD";
  zeroQuantityInternational.products[0].qty = 0;
  zeroQuantityInternational.products[0].price = 12.5;
  zeroQuantityInternational.products[0].freight = 30;
  const zeroQuantityCreated = createQuotation(
    { market: "international", quotation: zeroQuantityInternational },
    "tester",
  );
  assert.equal(zeroQuantityCreated.totalAmount, 30, "国际报价数量为0时只能保留运费，不能按数量1计算");
  assert.equal(deleteQuotation(zeroQuantityCreated.id, "tester"), true);

  const tierQuotation = structuredClone(quotation);
  tierQuotation.quoteMeta.no = "Q-TIER-001";
  tierQuotation.products = [{
    id: "tier-p1",
    name: "阶梯阻尼器",
    unit: "PCS",
    price: 99,
    qty: 999,
    tierPricingEnabled: true,
    tiers: [
      { id: "t1", minQty: 1000, price: 1.5 },
      { id: "t2", minQty: 3000, price: 1.3 },
    ],
  }];
  const tierCreated = createQuotation({ market: "domestic", quotation: tierQuotation }, "tester");
  assert.equal(tierCreated.totalAmount, 0, "阶梯报价不应产生虚假的成交总额");
  tierQuotation.quoteMeta.no = "Q-TIER-INVALID";
  tierQuotation.products[0].tiers[1].minQty = 1000;
  assert.throws(
    () => createQuotation({ market: "domestic", quotation: tierQuotation }, "tester"),
    /MOQ不能重复/,
  );
  assert.equal(deleteQuotation(tierCreated.id, "tester"), true);

  const listed = listQuotations({ keyword: "测试客户" });
  assert.equal(listed.total, 1);
  assert.equal(listed.data[0].quotation, undefined);
  assert.equal(listed.data[0].actualQuoterName, "测试登录人");
  assert.equal(listQuotations({ createdBy: "tester" }).total, 1);
  assert.equal(listQuotations({ createdBy: "another-user" }).total, 0);

  const loaded = getQuotation(created.id);
  assert.equal(loaded.customerName, "测试客户");
  quotation.customer.name = "已更新客户";
  const updated = updateQuotation(created.id, { market: "domestic", quotation }, "editor");
  assert.equal(updated.customerName, "已更新客户");
  assert.equal(updated.updatedBy, "editor");

  assert.equal(deleteQuotation(created.id, "tester"), true);
  assert.equal(listQuotations().total, 0);

  const migrated = migrateLegacyHistory([{ id: "old-1", quoteNo: "OLD-001", date: "2026-01-01", customerName: "旧客户", contact: "旧联系人", currency: "USD", products: quotation.products, molds: [], terms: [], salesName: "旧业务员", totalAmount: 30, createdAt: "2026-01-01T00:00:00.000Z" }]);
  assert.equal(migrated, 1);
  assert.equal(listQuotations().data[0].market, "international");
  assert.equal(migrateLegacyHistory([{ id: "old-1", quoteNo: "OLD-001", customerName: "旧客户", products: [] }]), 0);
  console.log("Quotation store tests passed.");
} finally {
  closeQuotationDB();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
