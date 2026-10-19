import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, App, Alert, Modal, Checkbox, Spin } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import { api, clearToken } from "../lib/api";
import { getSessionExpiryReason } from "../lib/authSession";
import { useTabStore } from "../lib/tabStore";
import { LOGIN_AUTOCOMPLETE } from "../lib/loginConfig";
import type { AuthSessionMode, LoginRequest, PasswordRecoveryRequest } from "../types/auth";
import styles from "./AuthPage.module.css";

const { Title, Text } = Typography;

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [loginForm] = Form.useForm<LoginRequest>();
  const [loginError, setLoginError] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [adminRecovery, setAdminRecovery] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryForm] = Form.useForm<PasswordRecoveryRequest & { recoveryCode?: string; confirmPassword?: string }>();
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

  const submitRecovery = async () => {
    const values = await recoveryForm.validateFields().catch(() => null);
    if (!values) return;
    if (adminRecovery && values.newPassword !== values.confirmPassword) {
      recoveryForm.setFields([{ name: "confirmPassword", errors: ["两次输入的密码不一致"] }]);
      return;
    }
    setRecoveryLoading(true);
    try {
      await api.post(adminRecovery ? "/api/auth/admin-recover-password" : "/api/auth/recover-password",
        adminRecovery ? { recoveryCode: values.recoveryCode, newPassword: values.newPassword } : { name: values.name, newPassword: values.newPassword });
      message.success(adminRecovery ? "密码已重置，请使用新密码登录" : "申请已提交，管理员审核通过后请使用新密码登录");
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
          name="login"
          form={loginForm}
          method="post"
          action="/login"
          onSubmitCapture={(event) => {
            // 密码管理器可能只填写原生输入框，没有触发 React 的 change 事件。
            const values = new FormData(event.currentTarget);
            loginForm.setFieldsValue({ username: String(values.get("username") ?? ""), password: String(values.get("password") ?? "") });
          }}
          onFinish={onFinish}
          size="large"
          autoComplete={LOGIN_AUTOCOMPLETE.form}
          initialValues={{ rememberLogin: false }}
        >
          {expiredMode && (
            <Alert
              type="warning"
              showIcon
              message="登录有效期已满15天，请重新登录"
              className={styles.alert}
            />
          )}
          {loginError && (
            <Alert type="error" showIcon message={loginError} className={styles.alert} closable onClose={() => setLoginError("")} />
          )}
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input name="username" aria-label="用户名" autoComplete={LOGIN_AUTOCOMPLETE.username} autoCapitalize="none" spellCheck={false} prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password name="password" aria-label="密码" autoComplete={LOGIN_AUTOCOMPLETE.password} prefix={<LockOutlined />} placeholder="密码" />
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
          <Button type="link" size="small" onClick={() => { setAdminRecovery(false); recoveryForm.resetFields(); setRecoveryOpen(true); }}>
            忘记密码
          </Button>
          <Text type="secondary" className={styles.footerText}>
            没有账号？<Link to="/register">申请注册</Link>
          </Text>
        </div>
      </Card>
      <Modal title={adminRecovery ? "管理员找回密码" : "找回密码"} open={recoveryOpen} onCancel={() => { if (!recoveryLoading) setRecoveryOpen(false); }} onOk={submitRecovery} confirmLoading={recoveryLoading} okText={adminRecovery ? "重置密码" : "提交申请"} cancelButtonProps={{ disabled: recoveryLoading }} maskClosable={!recoveryLoading}>
        {!adminRecovery && <Alert className={styles.alert} type="info" showIcon message="填写注册时的真实姓名和新密码，管理员审核通过后生效。" />}
        <Form form={recoveryForm} layout="vertical">
          {!adminRecovery && <Form.Item name="name" label="真实姓名" rules={[{ required: true, whitespace: true, message: "请输入注册时的真实姓名" }]}><Input maxLength={100} autoComplete="name" placeholder="注册时填写的真实姓名" /></Form.Item>}
          {adminRecovery && <Form.Item name="recoveryCode" label="管理员恢复码" rules={[{ required: true, message: "请输入恢复码" }]}><Input.Password autoComplete="off" /></Form.Item>}
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, max: 128, pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: "6-128位，且包含字母和数字" }]}><Input.Password maxLength={128} autoComplete="new-password" /></Form.Item>
          {adminRecovery && <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: "请确认新密码" }]}><Input.Password autoComplete="new-password" /></Form.Item>}
        </Form>
        <Button type="link" size="small" disabled={recoveryLoading} onClick={() => { recoveryForm.resetFields(); setAdminRecovery(value => !value); }}>
          {adminRecovery ? "普通用户找回密码" : "管理员找回密码"}
        </Button>
      </Modal>
    </div>
  );
}
