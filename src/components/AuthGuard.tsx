import { useEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { Spin, Result, Button } from "antd";
import { useAuthStore } from "../lib/authStore";
import styles from "./AuthGuard.module.css";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  permission?: string;
}

export function AuthGuard({ children, requireAdmin = false, permission }: AuthGuardProps) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!initialized) {
      fetchMe();
    }
  }, [initialized, fetchMe]);

  if (!initialized || loading) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
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
