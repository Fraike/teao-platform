import { create } from "zustand";
import type { User, LoginRequest, RegisterRequest } from "../types/auth";
import { api, setToken, clearToken, getToken, isApiError, refreshAuthToken } from "./api";
import {
  getAuthSessionMode,
  getSessionExpiryReason,
  markAuthTokenRefreshed,
  startAuthSession,
} from "./authSession";
import { clearKingdeeCache } from "./kingdeeCache";
import { setQuotationUserScope } from "./store";
import { useTabStore } from "./tabStore";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<string>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  changeAdminPassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

let authRevision = 0;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (req) => {
    const revision = ++authRevision;
    const data = await api.post<{ token: string; user: User }>(
      "/api/auth/login",
      req
    );
    if (revision !== authRevision) return;
    setToken(data.token, req.rememberLogin === true);
    startAuthSession(req.rememberLogin === true);
    useTabStore.getState().resetForAuthentication();
    setQuotationUserScope(data.user.id);
    set({ user: data.user, loading: false });
  },

  register: async (req) => {
    const data = await api.post<{ ok: boolean; message: string }>(
      "/api/auth/register",
      req
    );
    return data.message;
  },

  logout: () => {
    authRevision++;
    clearToken();
    setQuotationUserScope(null);
    clearKingdeeCache();
    useTabStore.getState().resetForAuthentication();
    set({ user: null, loading: false });
  },

  fetchMe: async () => {
    const revision = authRevision;
    const token = getToken();
    if (!token) {
      setQuotationUserScope(null);
      set({ initialized: true });
      return;
    }
    set({ loading: true });
    try {
      if (getAuthSessionMode() === "remember") {
        await refreshAuthToken();
      }
      if (revision !== authRevision) return;
      const user = await api.get<User>("/api/auth/me");
      if (revision !== authRevision) return;
      setQuotationUserScope(user.id);
      set({ user, loading: false, initialized: true });
    } catch (err) {
      if (revision !== authRevision) return;
      // Only clear token on auth errors (401/403), not network errors
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        clearToken();
        setQuotationUserScope(null);
        useTabStore.getState().resetForAuthentication();
        set({ user: null, loading: false, initialized: true });
      } else {
        // Network error — keep token and retry on next page load
        console.error("获取用户信息失败:", err);
        set({ loading: false, initialized: true });
      }
    }
  },

  changeAdminPassword: async (currentPassword, newPassword) => {
    const data = await api.post<{ token: string }>("/api/auth/change-password", { currentPassword, newPassword });
    setToken(data.token, getAuthSessionMode() === "remember");
    markAuthTokenRefreshed();
  },
}));

export function isSessionExpired(): boolean {
  return getSessionExpiryReason() !== null;
}
