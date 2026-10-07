import type { AuthSessionMode } from "../types/auth";

const LOGIN_TIMESTAMP_KEY = "login_timestamp";
const SESSION_MODE_KEY = "auth_session_mode";
const LAST_ACTIVE_AT_KEY = "auth_last_active_at";
const LAST_REFRESH_AT_KEY = "auth_last_refresh_at";

export const STANDARD_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_DURATION_MS = 15 * 24 * 60 * 60 * 1000;
export const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;
export const REMEMBERED_TOKEN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readTimestamp(key: string, storage: Storage): number | null {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getAuthSessionMode(storage: Storage = localStorage): AuthSessionMode {
  return storage.getItem(SESSION_MODE_KEY) === "remember" ? "remember" : "standard";
}

export function startAuthSession(rememberLogin: boolean, now = Date.now(), storage: Storage = localStorage): void {
  storage.setItem(LOGIN_TIMESTAMP_KEY, String(now));
  storage.setItem(SESSION_MODE_KEY, rememberLogin ? "remember" : "standard");
  if (rememberLogin) {
    storage.setItem(LAST_ACTIVE_AT_KEY, String(now));
    storage.setItem(LAST_REFRESH_AT_KEY, String(now));
    return;
  }
  storage.removeItem(LAST_ACTIVE_AT_KEY);
  storage.removeItem(LAST_REFRESH_AT_KEY);
}

export function clearAuthSession(storage: Storage = localStorage): void {
  storage.removeItem(LOGIN_TIMESTAMP_KEY);
  storage.removeItem(SESSION_MODE_KEY);
  storage.removeItem(LAST_ACTIVE_AT_KEY);
  storage.removeItem(LAST_REFRESH_AT_KEY);
}

export function getSessionExpiryReason(now = Date.now(), storage: Storage = localStorage): AuthSessionMode | null {
  const mode = getAuthSessionMode(storage);
  const loginAt = readTimestamp(LOGIN_TIMESTAMP_KEY, storage);
  if (!loginAt) return null;

  if (mode === "standard") {
    return now - loginAt > STANDARD_SESSION_DURATION_MS ? "standard" : null;
  }

  const lastActiveAt = readTimestamp(LAST_ACTIVE_AT_KEY, storage) ?? loginAt;
  return now - lastActiveAt > REMEMBERED_SESSION_DURATION_MS ? "remember" : null;
}

export function recordRememberedActivity(
  now = Date.now(),
  storage: Storage = localStorage,
): { recorded: boolean; shouldRefreshToken: boolean; expiredMode: AuthSessionMode | null } {
  const expiredMode = getSessionExpiryReason(now, storage);
  if (expiredMode || getAuthSessionMode(storage) !== "remember") {
    return { recorded: false, shouldRefreshToken: false, expiredMode };
  }

  const lastActiveAt = readTimestamp(LAST_ACTIVE_AT_KEY, storage) ?? 0;
  if (now - lastActiveAt < ACTIVITY_WRITE_THROTTLE_MS) {
    return { recorded: false, shouldRefreshToken: false, expiredMode: null };
  }

  storage.setItem(LAST_ACTIVE_AT_KEY, String(now));
  const lastRefreshAt = readTimestamp(LAST_REFRESH_AT_KEY, storage) ?? 0;
  return {
    recorded: true,
    shouldRefreshToken: now - lastRefreshAt >= REMEMBERED_TOKEN_REFRESH_INTERVAL_MS,
    expiredMode: null,
  };
}

export function markAuthTokenRefreshed(now = Date.now(), storage: Storage = localStorage): void {
  if (getAuthSessionMode(storage) === "remember") {
    storage.setItem(LAST_REFRESH_AT_KEY, String(now));
  }
}
