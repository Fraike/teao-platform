import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, beforeEach, test } from "node:test";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-live-permissions-"));
process.env.DATA_DIR = dataDirectory;
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "live-permissions-test-secret-at-least-32-characters";
const require = createRequire(new URL("../server/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const { jwtAuth, adminAuth, requirePermission, requireAnyPermission } = await import("../server/middleware/jwt-auth.js");
const { setUserPermission, resetUserPassword, isTokenSessionValid } = await import("../server/services/users.js");
const usersFile = path.join(dataDirectory, "users.json");
const now = Math.floor(Date.now() / 1000);
const session = {
  rememberLogin: true, sessionStartedAt: now - 14 * 86400,
  sessionExpiresAt: now + 86400, iat: now - 3600, exp: now + 86400, passwordVersion: 0,
};
let user;

function persist() {
  fs.writeFileSync(usersFile, JSON.stringify({ users: [user] }));
}

beforeEach(() => {
  user = { id: "live-user", username: "worker", name: "Worker", role: "user", status: "active",
    permissions: ["engineering", "engineering_review"], passwordVersion: 0, wecomUserid: "" };
  persist();
});
after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

function sign(claims = {}) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role,
    permissions: [...user.permissions], ...session, ...claims }, process.env.JWT_SECRET);
}

function request(token, guard = requirePermission("engineering_review")) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  let allowed = false;
  jwtAuth(req, res, () => guard(req, res, () => { allowed = true; }));
  return { status: res.statusCode, allowed, user: req.user };
}

test("revoking a permission immediately rejects the same JWT in both permission guards", async () => {
  const token = sign();
  assert.equal(request(token).allowed, true);
  assert.equal(request(token, requireAnyPermission(["hr", "engineering_review"])).allowed, true);
  assert.equal((await setUserPermission(user.id, "engineering_review", false)).ok, true);
  assert.equal(request(token).status, 403);
  assert.equal(request(token, requireAnyPermission(["hr", "engineering_review"])).status, 403);
});

test("granting a permission enables the same JWT without another login", async () => {
  user.permissions = [];
  persist();
  const token = sign();
  assert.equal(request(token).status, 403);
  assert.equal((await setUserPermission(user.id, "engineering_review", true)).ok, true);
  assert.equal(request(token).allowed, true);
  assert.equal(request(token, requireAnyPermission(["hr", "engineering_review"])).allowed, true);
});

test("demoting an administrator removes admin access and all permission bypasses", () => {
  user.role = "admin";
  const token = sign();
  persist();
  assert.equal(request(token, adminAuth).allowed, true);
  user.role = "user";
  user.permissions = [];
  persist();
  assert.equal(request(token, adminAuth).status, 403);
  assert.equal(request(token).status, 403);
  assert.equal(request(token, requireAnyPermission(["hr", "engineering_review"])).status, 403);
});

test("promoting an active user grants administrator access with the existing JWT", () => {
  const token = sign();
  assert.equal(request(token, adminAuth).status, 403);
  user.role = "admin";
  persist();
  assert.equal(request(token, adminAuth).allowed, true);
});

test("disabled, pending and removed users cannot use an existing JWT", () => {
  const token = sign();
  for (const status of ["disabled", "pending"]) {
    user.status = status;
    persist();
    assert.equal(request(token).status, 401);
    assert.equal(isTokenSessionValid(token), false);
  }
  fs.writeFileSync(usersFile, JSON.stringify({ users: [] }));
  assert.equal(request(token).status, 401);
});

test("resetting a password invalidates the existing JWT", async () => {
  const token = sign();
  assert.equal(request(token).allowed, true);
  assert.equal((await resetUserPassword(user.id, "ChangedPassword2026")).ok, true);
  assert.equal(request(token).status, 401);
  assert.equal(isTokenSessionValid(token), false);
});

test("current user fields cannot override signed session claims or leak private fields", () => {
  const token = sign();
  Object.assign(user, { rememberLogin: false, sessionStartedAt: now, sessionExpiresAt: now + 30 * 86400,
    iat: now, exp: now + 30 * 86400, passwordHash: "private-hash", passwordResetRequest: { passwordHash: "private-reset" } });
  user.permissions = ["hr"];
  persist();
  const result = request(token, requirePermission("hr"));
  assert.equal(result.allowed, true);
  assert.deepEqual(result.user.permissions, ["hr"]);
  for (const [key, value] of Object.entries(session)) assert.equal(result.user[key], value, key);
  assert.equal(result.user.passwordHash, undefined);
  assert.equal(result.user.passwordResetRequest, undefined);
});

test("authentication enforces the fixed fifteen-day limit even with a later JWT expiry", () => {
  const token = sign({ sessionStartedAt: now - 15 * 86400, sessionExpiresAt: now + 86400, exp: now + 86400 });
  assert.equal(request(token).status, 401);
  assert.equal(isTokenSessionValid(token), false);
});

test("signed session and JWT deadlines remain binding", () => {
  assert.equal(request(sign({ sessionExpiresAt: now - 1 })).status, 401);
  assert.equal(request(sign({ exp: now - 1 })).status, 401);
});

test("legacy sessions without remember-login fields still use current permissions", () => {
  const token = sign({ rememberLogin: undefined, sessionStartedAt: undefined, sessionExpiresAt: undefined });
  user.permissions = ["hr"];
  persist();
  assert.equal(request(token).status, 403);
  assert.equal(request(token, requirePermission("hr")).allowed, true);
});
