import { useState } from 'react';
import { App, Button, Popconfirm } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { changeApi, errorText } from '../../lib/engineeringChange';
import type { ChangeDetail, ChangeReminderTarget } from '../../types/engineeringChange';

export function ChangeRemindButton({ id, target, name, onReminded }: {
  id: string;
  target: ChangeReminderTarget;
  name: string;
  onReminded?: (detail: ChangeDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();

  async function remind() {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await changeApi.remind(id, target);
      onReminded?.(data);
      void message.success('催办已提交，发送结果见企微投递记录');
    } catch (error) {
      void message.error(errorText(error));
    } finally { setBusy(false); }
  }

  return <Popconfirm title={`催办 ${name}？`} description="通过特澳机器人发送当前待办的企业微信提醒。"
    okText="发送提醒" cancelText="取消" onConfirm={remind}>
    <Button size="small" color="primary" variant="outlined" icon={<BellOutlined />} aria-label={`催办 ${name}`} loading={busy}>催办</Button>
  </Popconfirm>;
}
