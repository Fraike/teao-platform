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
  const created = createQuotation({ market: "domestic", quotation }, "tester");
  assert.equal(created.quoteNo, "Q-TEST-001");
  assert.equal(created.totalAmount, 1280);
  assert.equal(created.quotation.products[0].image, "data:image/png;base64,AA==");

  const listed = listQuotations({ keyword: "测试客户" });
  assert.equal(listed.total, 1);
  assert.equal(listed.data[0].quotation, undefined);
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
