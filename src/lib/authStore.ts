import { create } from "zustand";
import type { User, LoginRequest, RegisterRequest } from "../types/auth";
import { api, setToken, clearToken, getToken, isApiError, setLoginTimestamp, clearLoginTimestamp, getLoginTimestamp, SESSION_DURATION_MS } from "./api";
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
    setLoginTimestamp();
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
    clearLoginTimestamp();
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
      const user = await api.get<User>("/api/auth/me");
      set({ user, loading: false, initialized: true });
    } catch (err) {
      // Only clear token on auth errors (401/403), not network errors
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        clearToken();
        clearLoginTimestamp();
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
    setLoginTimestamp();
  },
}));

export function isSessionExpired(): boolean {
  const ts = getLoginTimestamp();
  if (!ts) return false;
  const elapsed = Date.now() - Number(ts);
  return elapsed > SESSION_DURATION_MS;
}
