import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Typography } from 'antd';
import { api } from '../../lib/api';
import { useTabPage } from '../../lib/tabPageContext';
import type { User } from '../../types/auth';
import type { WecomSuggestion } from '../../types/wecomDirectory';

interface Props {
  user: User;
  busy: boolean;
  onClose: () => void;
  onApprove: (wecomUserid: string) => void;
}

const guidance: Record<WecomSuggestion['kind'], string> = {
  matched: '已从通讯录匹配，请核对申请人与该企微账号属于同一人。',
  missing: '通讯录未找到同名成员，可手动填写或留空。',
  ambiguous: '检测到重名或重复企微账号，请核实后手动填写。',
  occupied: '候选企微账号已被其他平台用户绑定，请人工核对。',
};

export function UserRegistrationReviewModal({ user, busy, onClose, onApprove }: Props) {
  const tab = useTabPage();
  const [value, setValue] = useState(user.wecomUserid ?? '');
  const [suggestion, setSuggestion] = useState<WecomSuggestion>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ data: WecomSuggestion }>(`/api/admin/users/${encodeURIComponent(user.id)}/wecom-suggestion`,
      { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) {
        setSuggestion(data);
        if (data.kind === 'matched' && !user.wecomUserid) setValue(data.userId);
      }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '通讯录匹配失败');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [user.id, user.wecomUserid]);

  return <Modal open title="确认注册审核" getContainer={tab.container ?? undefined}
    confirmLoading={busy} okButtonProps={{ disabled: loading }} okText="通过并保存" cancelText="取消"
    onCancel={() => { if (!busy) onClose(); }} onOk={() => onApprove(value.trim())}>
    <Typography.Paragraph>{user.name} · {user.username}</Typography.Paragraph>
    {error && <Alert type="warning" title={error} />}
    <Form layout="vertical">
      <Form.Item label="企业微信账号（选填）" htmlFor="registration-wecom-userid"
        extra={loading ? '正在查询通讯录…' : suggestion && guidance[suggestion.kind]}>
        <Input id="registration-wecom-userid" disabled={loading || busy} value={value}
          onChange={event => setValue(event.target.value)} maxLength={64} />
      </Form.Item>
    </Form>
  </Modal>;
}
