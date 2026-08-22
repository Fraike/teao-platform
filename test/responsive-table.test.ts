import assert from "node:assert/strict";
import { getResponsiveTableWidth } from "../src/lib/responsiveTable.ts";

assert.equal(getResponsiveTableWidth(1200, 1800), 1800);
assert.equal(getResponsiveTableWidth(1200, 900), 1200);
assert.equal(getResponsiveTableWidth(0, 900), 900);

console.log("Responsive table tests passed.");
