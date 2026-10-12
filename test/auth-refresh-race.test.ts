import assert from "node:assert/strict";
import { clearToken, getToken, refreshAuthToken, setToken } from "../src/lib/api.ts";
import { getSessionExpiryReason, startAuthSession } from "../src/lib/authSession.ts";

class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  get length() { return this.#data.size; }
  clear() { this.#data.clear(); }
  getItem(key: string) { return this.#data.get(key) ?? null; }
  key(index: number) { return [...this.#data.keys()][index] ?? null; }
  removeItem(key: string) { this.#data.delete(key); }
  setItem(key: string, value: string) { this.#data.set(key, value); }
}

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let resolveRefresh: (response: Response) => void = () => undefined;
let refreshRequests = 0;

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
globalThis.fetch = () => {
  refreshRequests += 1;
  if (refreshRequests === 1) return new Promise<Response>((resolve) => { resolveRefresh = resolve; });
  return Promise.resolve(Response.json({ token: "unexpected-token" }));
};

try {
  setToken("old-token");
  startAuthSession(true);
  const pendingRefresh = refreshAuthToken();
  clearToken();
  resolveRefresh(Response.json({ token: "late-token" }));

  assert.equal(await pendingRefresh, null);
  assert.equal(getToken(), null);

  setToken(`header.${Buffer.from(JSON.stringify({ rememberLogin: false, iat: Math.floor(Date.now() / 1000) })).toString("base64url")}.signature`);
  startAuthSession(false);
  assert.equal(await refreshAuthToken(), null);
  assert.equal(refreshRequests, 1);

  setToken(`header.${Buffer.from(JSON.stringify({ rememberLogin: true, iat: Math.floor(Date.now() / 1000) - 16 * 86400 })).toString("base64url")}.signature`);
  startAuthSession(true, Date.now() - 16 * 86400 * 1000);
  assert.ok(Number(localStorage.getItem("auth_last_active_at")) < Date.now() - 15 * 86400 * 1000);
  assert.equal(getSessionExpiryReason(), "remember");
  assert.equal(await refreshAuthToken(), null);
  assert.equal(refreshRequests, 1);
  console.log("Auth refresh race tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}
