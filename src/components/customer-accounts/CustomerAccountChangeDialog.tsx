import { useState } from 'react';
import { Alert, Form, Input, Modal } from 'antd';
import { customerAccountPasswordIssue } from '../../lib/customerSystemAccount';

interface CustomerAccountChangeDialogProps {
  onClose: () => void;
  onSave: (input: { password: string; reason?: string }) => Promise<void>;
}

export function CustomerAccountChangeDialog({ onClose, onSave }: CustomerAccountChangeDialogProps) {
  const [form] = Form.useForm<{ password: string; reason?: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (values: { password: string; reason?: string }) => {
    const issue = customerAccountPasswordIssue(values.password);
    if (issue) { setError(issue); return; }
    setSaving(true);
    setError('');
    try { await onSave(values); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setSaving(false); }
  };
  return <Modal open title="登记密码变更" onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving}
    okText="保存新密码" cancelText="取消">
    <Alert type="info" showIcon title="请先在客户网站改密，再在这里登记。" />
    {error && <Alert type="error" showIcon title={error} />}
    <Form form={form} layout="vertical" onFinish={save} autoComplete="off" disabled={saving}>
      <Form.Item name="password" label="新密码" rules={[{ required: true }]}>
        <Input.Password maxLength={1024} autoComplete="new-password" />
      </Form.Item>
      <Form.Item name="reason" label="变更说明" extra="请勿在说明中填写密码。">
        <Input.TextArea rows={2} maxLength={500} />
      </Form.Item>
    </Form>
  </Modal>;
}
