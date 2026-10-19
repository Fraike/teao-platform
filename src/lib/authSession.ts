import type { AuthSessionMode } from "../types/auth";
import { getToken } from "./authToken.ts";

const LOGIN_TIMESTAMP_KEY = "login_timestamp";
const SESSION_MODE_KEY = "auth_session_mode";
const LAST_ACTIVE_AT_KEY = "auth_last_active_at";
const LAST_REFRESH_AT_KEY = "auth_last_refresh_at";

export const REMEMBERED_SESSION_DURATION_MS = 15 * 24 * 60 * 60 * 1000;
export const STANDARD_SESSION_DURATION_MS = REMEMBERED_SESSION_DURATION_MS;
export const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;
export const REMEMBERED_TOKEN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readTimestamp(key: string, storage: Storage): number | null {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readTokenSession(storage: Storage): { mode: AuthSessionMode; issuedAt: number | null; expiresAt: number | null } | null {
  const token = storage === globalThis.localStorage ? getToken() : storage.getItem("auth_token");
  if (!token) return null;
  try {
    const encoded = token.split(".")[1];
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))) as {
      rememberLogin?: unknown;
      iat?: unknown;
      exp?: unknown;
      sessionStartedAt?: unknown;
      sessionExpiresAt?: unknown;
    };
    const start = typeof payload.sessionStartedAt === "number" ? payload.sessionStartedAt : payload.iat;
    const deadlines = [payload.exp, payload.sessionExpiresAt, typeof start === "number" ? start + REMEMBERED_SESSION_DURATION_MS / 1000 : null]
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    return {
      mode: payload.rememberLogin === true ? "remember" : "standard",
      issuedAt: typeof start === "number" && Number.isFinite(start) && start > 0 ? start * 1000 : null,
      expiresAt: deadlines.length ? Math.min(...deadlines) * 1000 : null,
    };
  } catch {
    return null;
  }
}

export function getAuthSessionMode(storage: Storage = localStorage): AuthSessionMode {
  return readTokenSession(storage)?.mode ?? (storage.getItem(SESSION_MODE_KEY) === "remember" ? "remember" : "standard");
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
  const tokenSession = readTokenSession(storage);
  const loginAt = readTimestamp(LOGIN_TIMESTAMP_KEY, storage) ?? tokenSession?.issuedAt;
  const deadline = tokenSession?.expiresAt ?? (loginAt ? loginAt + REMEMBERED_SESSION_DURATION_MS : null);
  // 旧令牌的本地登录时间可能早于最近一次续签，不能把旧会话顺延。
  const absoluteDeadline = loginAt && deadline ? Math.min(deadline, loginAt + REMEMBERED_SESSION_DURATION_MS) : deadline;
  return absoluteDeadline && now >= absoluteDeadline ? mode : null;
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
