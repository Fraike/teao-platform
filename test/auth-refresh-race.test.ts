import assert from "node:assert/strict";
import { clearToken, getToken, refreshAuthToken, setToken } from "../src/lib/api.ts";
import { startAuthSession } from "../src/lib/authSession.ts";

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

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
globalThis.fetch = () => new Promise<Response>((resolve) => { resolveRefresh = resolve; });

try {
  setToken("old-token");
  startAuthSession(true, 1_700_000_000_000);
  const pendingRefresh = refreshAuthToken();
  clearToken();
  resolveRefresh(Response.json({ token: "late-token" }));

  assert.equal(await pendingRefresh, null);
  assert.equal(getToken(), null);
  console.log("Auth refresh race tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}
