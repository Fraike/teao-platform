import assert from "node:assert/strict";
import fs from "node:fs";

const loginPage = fs.readFileSync("src/pages/LoginPage.tsx", "utf8");
const authGuard = fs.readFileSync("src/components/AuthGuard.tsx", "utf8");
const authStore = fs.readFileSync("src/lib/authStore.ts", "utf8");
const api = fs.readFileSync("src/lib/api.ts", "utf8");

assert.match(loginPage, /name="rememberLogin"/);
assert.match(loginPage, /valuePropName="checked"/);
assert.match(loginPage, /15天内免登录/);
assert.doesNotMatch(loginPage, /仅建议在私人设备上使用/);
assert.match(loginPage, /initialValues=\{\{ rememberLogin: false \}\}/);
assert.match(loginPage, /getSessionExpiryReason/);
assert.match(loginPage, /fetchMe\(\)/);
assert.match(loginPage, /<Navigate to="\/" replace \/>/);

assert.match(authStore, /startAuthSession\(req\.rememberLogin === true\)/);
assert.match(api, /export async function refreshAuthToken/);
assert.match(authGuard, /recordRememberedActivity/);
assert.match(authGuard, /"pointerdown"/);
assert.match(authGuard, /"keydown"/);
assert.match(authGuard, /"focus"/);
assert.match(authGuard, /getSessionExpiryReason/);

console.log("Remember login UI tests passed.");
