import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Card, Form, Input, Button, Typography, App, Alert, Modal } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import { api } from "../lib/api";
import { LOGIN_AUTOCOMPLETE } from "../lib/loginConfig";
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
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";
  const expired = (location.state as { expired?: boolean })?.expired;

  const onFinish = async (values: { username: string; password: string }) => {
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

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.titleArea} style={{ marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4 }}>特澳科技后台</Title>
          <Text type="secondary">请登录以继续</Text>
        </div>

        <Form onFinish={onFinish} size="large" autoComplete={LOGIN_AUTOCOMPLETE.form}>
          {expired && (
            <Alert
              type="warning"
              showIcon
              message="登录已过期（超过 12 小时），请重新登录"
              style={{ marginBottom: 16 }}
            />
          )}
          {loginError && (
            <Alert type="error" showIcon message={loginError} style={{ marginBottom: 16 }} closable onClose={() => setLoginError("")} />
          )}
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input name="username" autoComplete={LOGIN_AUTOCOMPLETE.username} prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password name="password" autoComplete={LOGIN_AUTOCOMPLETE.password} prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button type="link" size="small" onClick={() => setRecoveryOpen(true)}>
            管理员找回密码
          </Button>
          <Text type="secondary" style={{ fontSize: 13 }}>
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
