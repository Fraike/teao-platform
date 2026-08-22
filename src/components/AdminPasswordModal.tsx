import { Form, Input, Modal, message } from "antd";
import { useState } from "react";
import { useAuthStore } from "../lib/authStore";

interface AdminPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function AdminPasswordModal({ open, onClose }: AdminPasswordModalProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const changePassword = useAuthStore((state) => state.changeAdminPassword);
  const submit = async () => {
    const values = await form.validateFields();
    if (values.newPassword !== values.confirmPassword) {
      form.setFields([{ name: "confirmPassword", errors: ["两次输入的密码不一致"] }]);
      return;
    }
    setSaving(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      message.success("密码已修改，其他登录会话已失效");
      form.resetFields();
      onClose();
    } catch (err) {
      message.error((err as Error).message || "密码修改失败");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="修改管理员密码" open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} okText="保存"><Form form={form} layout="vertical"><Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}><Input.Password autoComplete="current-password" /></Form.Item><Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: "至少6位，且包含字母和数字" }]}><Input.Password autoComplete="new-password" /></Form.Item><Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: "请确认新密码" }]}><Input.Password autoComplete="new-password" /></Form.Item></Form></Modal>;
}
