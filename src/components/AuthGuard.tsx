import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { Spin, Result, Button } from "antd";
import { useAuthStore } from "../lib/authStore";
import { clearToken, refreshAuthToken } from "../lib/api";
import { getSessionExpiryReason, recordRememberedActivity } from "../lib/authSession";
import type { AuthSessionMode } from "../types/auth";
import { useTabStore } from "../lib/tabStore";
import styles from "./AuthGuard.module.css";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  permission?: string;
}

function clearExpiredAuthentication(): void {
  clearToken();
  useTabStore.getState().resetForAuthentication();
  useAuthStore.setState({ user: null, initialized: true });
}

export function AuthGuard({ children, requireAdmin = false, permission }: AuthGuardProps) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const navigate = useNavigate();
  const location = useLocation();
  const [expiredMode, setExpiredMode] = useState<AuthSessionMode | null>(() => getSessionExpiryReason());

  const expireSession = useCallback((mode: AuthSessionMode) => {
    setExpiredMode(mode);
    clearExpiredAuthentication();
  }, []);

  useEffect(() => {
    if (initialized) return;

    if (expiredMode) {
      clearExpiredAuthentication();
      return;
    }

    fetchMe();
  }, [initialized, fetchMe, expiredMode]);

  useEffect(() => {
    if (!user) return;
    const checkExpiry = () => {
      const mode = getSessionExpiryReason();
      if (mode) expireSession(mode);
    };
    const timer = window.setInterval(checkExpiry, 60_000);
    return () => window.clearInterval(timer);
  }, [user, expireSession]);

  useEffect(() => {
    if (!user) return;
    const handleActivity = () => {
      const { shouldRefreshToken, expiredMode: activityExpiredMode } = recordRememberedActivity();
      if (activityExpiredMode) {
        expireSession(activityExpiredMode);
        return;
      }
      if (shouldRefreshToken) void refreshAuthToken();
    };
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("focus", handleActivity);
    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("focus", handleActivity);
    };
  }, [user, expireSession]);

  if (!initialized || loading) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, expiredMode: expiredMode || undefined }}
        replace
      />
    );
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  if (permission && !user.permissions?.includes(permission) && user.role !== "admin") {
    return (
      <Result
        status="403"
        title="无权限访问"
        subTitle="你没有该模块的访问权限，请联系管理员开通。"
        extra={<Button type="primary" onClick={() => navigate("/")}>返回首页</Button>}
      />
    );
  }

  return <>{children}</>;
}
