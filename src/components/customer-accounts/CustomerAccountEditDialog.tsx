import { useState } from 'react';
import { Alert, Checkbox, Form, Input, Modal } from 'antd';
import { customerAccountDetails, customerAccountImportIssues, customerAccountIssues } from '../../lib/customerSystemAccount';
import type { CustomerAccountInput } from '../../types/customerSystemAccount';

interface CustomerAccountEditDialogProps {
  title: string;
  initial?: CustomerAccountInput;
  includePassword: boolean;
  requireLoginFields?: boolean;
  reviews?: string[];
  onSave: (input: CustomerAccountInput) => void | Promise<void>;
  onClose: () => void;
}

export function CustomerAccountEditDialog({
  title, initial, includePassword, requireLoginFields = false, reviews = [], onSave, onClose,
}: CustomerAccountEditDialogProps) {
  const [form] = Form.useForm<CustomerAccountInput>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (values: CustomerAccountInput) => {
    const input = { ...customerAccountDetails(values), password: values.password ?? '' };
    const issues = includePassword ? customerAccountImportIssues(input, requireLoginFields) : customerAccountIssues(input, requireLoginFields);
    if (issues.length) { setError(issues.join('；')); return; }
    if (reviews.length && !confirmed) return;
    setError('');
    setSaving(true);
    try { await onSave(input); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setSaving(false); }
  };

  return <Modal title={title} open onCancel={onClose} onOk={() => form.submit()} okText="保存"
    cancelText="取消" confirmLoading={saving} okButtonProps={{ disabled: reviews.length > 0 && !confirmed }}>
    {error && <Alert type="error" title={error} showIcon />}
    <Form form={form} layout="vertical" initialValues={initial} onFinish={save} autoComplete="off" disabled={saving}>
      <Form.Item name="company" label={requireLoginFields ? "公司名称" : "名称 / 用途"} rules={[{ required: true }]}>
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item name="url" label="登录网址" rules={[{ required: requireLoginFields }]}>
        <Input placeholder="https://" maxLength={2048} />
      </Form.Item>
      <Form.Item name="username" label="账号" rules={[{ required: requireLoginFields }]}>
        <Input maxLength={512} />
      </Form.Item>
      {includePassword && <Form.Item name="password" label="当前密码" rules={[{ required: true }]}>
        <Input.Password autoComplete="new-password" maxLength={1024} />
      </Form.Item>}
      <Form.Item name="note" label="备注">
        <Input.TextArea maxLength={2000} rows={2} />
      </Form.Item>
      {reviews.length > 0 && <Checkbox checked={confirmed} onChange={event => setConfirmed(event.target.checked)}>
        已对照原表核对：{reviews.join('、')}
      </Checkbox>}
    </Form>
  </Modal>;
}
