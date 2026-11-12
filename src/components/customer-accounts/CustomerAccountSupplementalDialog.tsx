import { useEffect, useState } from 'react';
import { Alert, Modal, Space, Spin, Typography } from 'antd';
import { api } from '../../lib/api';
import { CUSTOMER_ACCOUNT_API } from '../../lib/customerSystemAccount';
import { CustomerAccountPasswordCell } from './CustomerAccountPasswordCell';

type Credential = { username: string; password: string; step: string };

export function CustomerAccountSupplementalDialog({ accountId, onClose, onError }: {
  accountId: string;
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const [entries, setEntries] = useState<Credential[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api.post<{ data: Credential[] }>(`${CUSTOMER_ACCOUNT_API}/${accountId}/supplemental-passwords`, undefined, {
      signal: controller.signal, cache: 'no-store',
    }).then(({ data }) => {
      if (!controller.signal.aborted) setEntries(data);
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      onError(err);
      setError(err instanceof Error ? err.message : '读取失败');
    });
    return () => controller.abort();
  }, [accountId, onError]);

  return <Modal open title="附加凭据" onCancel={onClose} footer={null}>
    {error ? <Alert type="error" title={error} showIcon /> : entries === null ? <Spin /> :
      <Space orientation="vertical" size="middle">
        {entries.map(({ username, password, step }, index) => <Space orientation="vertical" key={index}>
          {step && <Typography.Text type="secondary">{step}</Typography.Text>}
          {username && <Typography.Text>账号：{username}</Typography.Text>}
          {password && <CustomerAccountPasswordCell password={password} />}
        </Space>)}
      </Space>}
  </Modal>;
}
