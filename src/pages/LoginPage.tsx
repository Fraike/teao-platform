import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, App, Alert, Modal, Checkbox, Spin } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import { api, clearToken } from "../lib/api";
import { getSessionExpiryReason } from "../lib/authSession";
import { useTabStore } from "../lib/tabStore";
import { LOGIN_AUTOCOMPLETE } from "../lib/loginConfig";
import type { AuthSessionMode, LoginRequest } from "../types/auth";
import styles from "./AuthPage.module.css";

const { Title, Text } = Typography;

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryForm] = Form.useForm();
  const { message } = App.useApp();
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";
  const expiredMode = (location.state as { expiredMode?: AuthSessionMode })?.expiredMode;
  const [initialExpiryMode] = useState<AuthSessionMode | null>(() => getSessionExpiryReason());

  useEffect(() => {
    if (initialized) return;
    if (initialExpiryMode) {
      clearToken();
      useTabStore.getState().resetForAuthentication();
      useAuthStore.setState({ user: null, initialized: true });
      return;
    }
    void fetchMe();
  }, [fetchMe, initialExpiryMode, initialized]);

  const onFinish = async (values: LoginRequest) => {
    setLoginError("");
    setLoading(true);
    try {
      await login(values);
      message.success("登录成功");
      navigate(from, { replace: true });
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const recoverAdminPassword = async () => {
    const values = await recoveryForm.validateFields();
    if (values.newPassword !== values.confirmPassword) {
      recoveryForm.setFields([{ name: "confirmPassword", errors: ["两次输入的密码不一致"] }]);
      return;
    }
    setRecoveryLoading(true);
    try {
      await api.post("/api/auth/admin-recover-password", values);
      message.success("密码已重置，请使用新密码登录");
      recoveryForm.resetFields();
      setRecoveryOpen(false);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setRecoveryLoading(false);
    }
  };

  if (!initialized || authLoading) {
    return <div className={styles.loading}><Spin size="large" /></div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.titleArea}>
          <Title level={3} className={styles.title}>特澳科技后台</Title>
          <Text type="secondary">请登录以继续</Text>
        </div>

        <Form
          onFinish={onFinish}
          size="large"
          autoComplete={LOGIN_AUTOCOMPLETE.form}
          initialValues={{ rememberLogin: false }}
        >
          {expiredMode && (
            <Alert
              type="warning"
              showIcon
              message={expiredMode === "remember" ? "超过15天未使用，请重新登录" : "登录已过期（超过12小时），请重新登录"}
              className={styles.alert}
            />
          )}
          {loginError && (
            <Alert type="error" showIcon message={loginError} className={styles.alert} closable onClose={() => setLoginError("")} />
          )}
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input name="username" autoComplete={LOGIN_AUTOCOMPLETE.username} prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password name="password" autoComplete={LOGIN_AUTOCOMPLETE.password} prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item name="rememberLogin" valuePropName="checked" className={styles.rememberItem}>
            <Checkbox>15天内免登录</Checkbox>
          </Form.Item>
          <Form.Item className={styles.submitItem}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div className={styles.footer}>
          <Button type="link" size="small" onClick={() => setRecoveryOpen(true)}>
            管理员找回密码
          </Button>
          <Text type="secondary" className={styles.footerText}>
            没有账号？<Link to="/register">申请注册</Link>
          </Text>
        </div>
      </Card>
      <Modal title="管理员找回密码" open={recoveryOpen} onCancel={() => setRecoveryOpen(false)} onOk={recoverAdminPassword} confirmLoading={recoveryLoading} okText="重置密码">
        <Form form={recoveryForm} layout="vertical">
          <Form.Item name="username" label="管理员账号" rules={[{ required: true, message: "请输入管理员账号" }]}><Input /></Form.Item>
          <Form.Item name="recoveryCode" label="管理员恢复码" rules={[{ required: true, message: "请输入恢复码" }]}><Input.Password autoComplete="off" /></Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: "至少6位，且包含字母和数字" }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: "请确认新密码" }]}><Input.Password autoComplete="new-password" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
