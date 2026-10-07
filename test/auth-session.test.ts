import assert from "node:assert/strict";
import {
  ACTIVITY_WRITE_THROTTLE_MS,
  REMEMBERED_SESSION_DURATION_MS,
  REMEMBERED_TOKEN_REFRESH_INTERVAL_MS,
  STANDARD_SESSION_DURATION_MS,
  clearAuthSession,
  getAuthSessionMode,
  getSessionExpiryReason,
  recordRememberedActivity,
  startAuthSession,
} from "../src/lib/authSession.ts";

class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  get length() { return this.#data.size; }
  clear() { this.#data.clear(); }
  getItem(key: string) { return this.#data.get(key) ?? null; }
  key(index: number) { return [...this.#data.keys()][index] ?? null; }
  removeItem(key: string) { this.#data.delete(key); }
  setItem(key: string, value: string) { this.#data.set(key, value); }
}

const storage = new MemoryStorage();
const startedAt = 1_700_000_000_000;

startAuthSession(false, startedAt, storage);
assert.equal(getAuthSessionMode(storage), "standard");
assert.equal(getSessionExpiryReason(startedAt + STANDARD_SESSION_DURATION_MS, storage), null);
assert.equal(getSessionExpiryReason(startedAt + STANDARD_SESSION_DURATION_MS + 1, storage), "standard");

startAuthSession(true, startedAt, storage);
assert.equal(getAuthSessionMode(storage), "remember");
assert.equal(getSessionExpiryReason(startedAt + REMEMBERED_SESSION_DURATION_MS, storage), null);
assert.equal(getSessionExpiryReason(startedAt + REMEMBERED_SESSION_DURATION_MS + 1, storage), "remember");

const throttled = recordRememberedActivity(startedAt + ACTIVITY_WRITE_THROTTLE_MS - 1, storage);
assert.deepEqual(throttled, { recorded: false, shouldRefreshToken: false, expiredMode: null });

const active = recordRememberedActivity(startedAt + REMEMBERED_TOKEN_REFRESH_INTERVAL_MS, storage);
assert.deepEqual(active, { recorded: true, shouldRefreshToken: true, expiredMode: null });
assert.equal(getSessionExpiryReason(startedAt + REMEMBERED_SESSION_DURATION_MS + 1, storage), null);

startAuthSession(true, startedAt, storage);
const expiredActivity = recordRememberedActivity(startedAt + REMEMBERED_SESSION_DURATION_MS + 1, storage);
assert.deepEqual(expiredActivity, { recorded: false, shouldRefreshToken: false, expiredMode: "remember" });
assert.equal(getSessionExpiryReason(startedAt + REMEMBERED_SESSION_DURATION_MS + 1, storage), "remember");

clearAuthSession(storage);
storage.setItem("login_timestamp", String(startedAt));
assert.equal(getAuthSessionMode(storage), "standard");
assert.equal(getSessionExpiryReason(startedAt + STANDARD_SESSION_DURATION_MS + 1, storage), "standard");

clearAuthSession(storage);
assert.equal(getSessionExpiryReason(startedAt + REMEMBERED_SESSION_DURATION_MS * 2, storage), null);

console.log("Auth session tests passed.");
