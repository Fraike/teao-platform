import { create } from "zustand";
import type { User, LoginRequest, RegisterRequest } from "../types/auth";
import { api, setToken, clearToken, getToken, isApiError, refreshAuthToken } from "./api";
import {
  getAuthSessionMode,
  getSessionExpiryReason,
  markAuthTokenRefreshed,
  recordRememberedActivity,
  startAuthSession,
} from "./authSession";
import { clearKingdeeCache } from "./kingdeeCache";
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (req) => {
    const data = await api.post<{ token: string; user: User }>(
      "/api/auth/login",
      req
    );
    setToken(data.token);
    startAuthSession(req.rememberLogin === true);
    useTabStore.getState().resetForAuthentication();
    set({ user: data.user });
  },

  register: async (req) => {
    const data = await api.post<{ ok: boolean; message: string }>(
      "/api/auth/register",
      req
    );
    return data.message;
  },

  logout: () => {
    clearToken();
    clearKingdeeCache();
    useTabStore.getState().resetForAuthentication();
    set({ user: null });
  },

  fetchMe: async () => {
    const token = getToken();
    if (!token) {
      set({ initialized: true });
      return;
    }
    set({ loading: true });
    try {
      if (getAuthSessionMode() === "remember") {
        await refreshAuthToken();
      }
      const user = await api.get<User>("/api/auth/me");
      recordRememberedActivity();
      set({ user, loading: false, initialized: true });
    } catch (err) {
      // Only clear token on auth errors (401/403), not network errors
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        clearToken();
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
    setToken(data.token);
    markAuthTokenRefreshed();
  },
}));

export function isSessionExpired(): boolean {
  return getSessionExpiryReason() !== null;
}
