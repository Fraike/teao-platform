import assert from "node:assert/strict";
import { getSidebarLayout } from "../src/lib/sidebarLayout.ts";

const desktop = getSidebarLayout(false);
assert.deepEqual(desktop, { expandedWidth: 216, collapsedWidth: 64 });

const mobile = getSidebarLayout(true);
assert.deepEqual(mobile, { expandedWidth: 216, collapsedWidth: 0 });

console.log("Sidebar layout tests passed.");
