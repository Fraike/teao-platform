import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message, Space, Alert } from "antd";
import { UserOutlined, LockOutlined, IdcardOutlined } from "@ant-design/icons";
import { useAuthStore } from "../lib/authStore";
import styles from "./AuthPage.module.css";

const { Title, Text } = Typography;

export function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const onFinish = async (values: {
    name: string;
    username: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error("两次密码输入不一致");
      return;
    }
    setLoading(true);
    try {
      const msg = await register({
        name: values.name,
        username: values.username,
        password: values.password,
      });
      message.success(msg);
      setSubmitted(true);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div className={styles.titleArea}>
              <Title level={3}>申请已提交</Title>
              <Text type="secondary">请等待管理员审核通过后，再登录系统</Text>
            </div>
            <Button type="primary" block onClick={() => navigate("/login")}>
              返回登录
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div className={styles.titleArea}>
            <Title level={3}>申请注册</Title>
            <Text type="secondary">请使用真实姓名提交注册申请</Text>
          </div>
          <Alert
            message="请使用真实姓名注册，提交后需等待管理员审核通过方可登录。"
            type="info"
            showIcon
          />
          <Form onFinish={onFinish} size="large">
            <Form.Item
              name="name"
              rules={[{ required: true, message: "请输入真实姓名" }]}
            >
              <Input prefix={<IdcardOutlined />} placeholder="真实姓名" />
            </Form.Item>
            <Form.Item
              name="username"
              rules={[
                { required: true, message: "请输入用户名" },
                { min: 2, message: "用户名至少 2 个字符" },
                { max: 20, message: "用户名最多 20 个字符" },
                { pattern: /^[a-zA-Z0-9_]+$/, message: "用户名只能包含字母、数字和下划线" },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名（英文+数字）" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 6, message: "密码至少 6 位" },
                { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: "密码必须同时包含字母和数字" },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="密码（字母+数字，至少6位）" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              rules={[
                { required: true, message: "请确认密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("两次密码输入不一致"));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                提交申请
              </Button>
            </Form.Item>
          </Form>
          <div className={styles.linkArea}>
            <Text>已有账号？</Text> <Link to="/login">去登录</Link>
          </div>
        </Space>
      </Card>
    </div>
  );
}
