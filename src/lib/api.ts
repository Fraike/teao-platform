import { clearAuthSession, getAuthSessionMode, getSessionExpiryReason, markAuthTokenRefreshed } from "./authSession.ts";
import { getToken, setToken, removeStoredToken } from "./authToken.ts";
export { getToken, setToken } from "./authToken.ts";

export function clearToken(): void {
  removeStoredToken();
  clearAuthSession();
}

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAt?: string;
  constructor(message: string, status: number, code?: string, retryAt?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAuthToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  const token = getToken();
  if (!token || getAuthSessionMode() !== "remember" || getSessionExpiryReason() !== null) return null;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" as const },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (getToken() !== token) return null;
      setToken(data.token);
      markAuthTokenRefreshed();
      return data.token;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // Auto-refresh on 401 (single attempt)
  if (res.status === 401 && token) {
    const newToken = await refreshAuthToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `请求失败 (${res.status})`, res.status, typeof data.code === "string" ? data.code : undefined, typeof data.retryAt === "string" ? data.retryAt : undefined);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, options?: RequestInit) => request<T>(url, options),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string) =>
    request<T>(url, { method: "DELETE" }),
};
