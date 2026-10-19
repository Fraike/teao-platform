import assert from "node:assert/strict";
import { getToken, setToken, removeStoredToken } from "../src/lib/authToken.ts";
import { getAuthSessionMode, getSessionExpiryReason, startAuthSession } from "../src/lib/authSession.ts";

class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  get length() { return this.#data.size; }
  clear() { this.#data.clear(); }
  getItem(key: string) { return this.#data.get(key) ?? null; }
  key(index: number) { return [...this.#data.keys()][index] ?? null; }
  removeItem(key: string) { this.#data.delete(key); }
  setItem(key: string, value: string) { this.#data.set(key, value); }
}
const descriptors = ["localStorage", "sessionStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
const local = new MemoryStorage(), temporary = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: temporary });
const start = 1_700_000_000_000, deadline = start + 15 * 86400 * 1000;
try {
  for (const persistent of [false, true]) {
    const payload = { rememberLogin: persistent, iat: start / 1000, sessionStartedAt: start / 1000, exp: deadline / 1000 };
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
    setToken(token, persistent); startAuthSession(persistent, start);
    assert.equal(local.getItem("auth_token"), persistent ? token : null);
    assert.equal(temporary.getItem("auth_token"), persistent ? null : token);
    assert.equal(getToken(), token);
    assert.equal(getAuthSessionMode(), persistent ? "remember" : "standard");
    assert.equal(getSessionExpiryReason(start + 13 * 3600 * 1000), null);
    assert.equal(getSessionExpiryReason(deadline - 1), null);
    assert.equal(getSessionExpiryReason(deadline), persistent ? "remember" : "standard");
  }
  removeStoredToken(); assert.equal(getToken(), null);
  console.log("Token storage isolation and exact 15-day deadlines passed.");
} finally {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
