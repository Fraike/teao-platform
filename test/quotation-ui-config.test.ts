import assert from "node:assert/strict";
import { DEFAULT_TERMS } from "../src/lib/constants.ts";
import { isSupportedImageFile } from "../src/lib/imageUtils.ts";
import { formatIntlTierLabel } from "../src/lib/quotationDisplay.ts";
import {
  MAX_SPREADSHEET_COLUMNS,
  MAX_SPREADSHEET_FILE_BYTES,
  MAX_SPREADSHEET_ROWS,
  validateSpreadsheetFileSize,
  validateSpreadsheetShape,
} from "../src/lib/spreadsheetImport.ts";
import { LOGIN_AUTOCOMPLETE } from "../src/lib/loginConfig.ts";

assert.deepEqual(DEFAULT_TERMS, [
  "1. 以上产品价格为含13%税单价，含运费。",
  "2. 包装方式：客户没有特殊要求，则按我司正常标准包装。",
  "3. 交货地点：贵司工厂，交期10-15天。",
  "4. 付款方式：月结。",
  "5. 报价有效期：本报价单自发出之日起30天内有效。",
]);

assert.equal(isSupportedImageFile({ type: "image/png" }), true);
assert.equal(isSupportedImageFile({ type: "image/jpeg" }), true);
assert.equal(isSupportedImageFile({ type: "application/pdf" }), false);
assert.equal(isSupportedImageFile({ type: "" }), false);

assert.equal(
  formatIntlTierLabel(1000, "PCS", "USD", 1.25),
  "MOQ ≥ 1,000 PCS · USD 1.250",
);

assert.equal(MAX_SPREADSHEET_FILE_BYTES, 10 * 1024 * 1024);
assert.equal(MAX_SPREADSHEET_ROWS, 10001);
assert.equal(MAX_SPREADSHEET_COLUMNS, 100);
assert.equal(validateSpreadsheetFileSize(MAX_SPREADSHEET_FILE_BYTES), null);
assert.match(validateSpreadsheetFileSize(MAX_SPREADSHEET_FILE_BYTES + 1) || "", /10MB/);
assert.equal(validateSpreadsheetShape(10001, 100), null);
assert.match(validateSpreadsheetShape(10002, 100) || "", /10001/);
assert.match(validateSpreadsheetShape(10001, 101) || "", /100/);

assert.deepEqual(LOGIN_AUTOCOMPLETE, {
  form: "on",
  username: "username",
  password: "current-password",
});

console.log("Quotation UI config tests passed.");
