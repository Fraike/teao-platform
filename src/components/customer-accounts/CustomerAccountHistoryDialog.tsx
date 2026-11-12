import { useEffect, useState } from 'react';
import { Alert, Modal, Table } from 'antd';
import { api } from '../../lib/api';
import { CUSTOMER_ACCOUNT_API } from '../../lib/customerSystemAccount';
import type { CustomerAccountPasswordChange } from '../../types/customerSystemAccount';

interface CustomerAccountHistoryDialogProps {
  accountId: string;
  onClose: () => void;
  onError: (error: unknown) => void;
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short',
});

export function CustomerAccountHistoryDialog({ accountId, onClose, onError }: CustomerAccountHistoryDialogProps) {
  const [history, setHistory] = useState<CustomerAccountPasswordChange[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ data: CustomerAccountPasswordChange[] }>(`${CUSTOMER_ACCOUNT_API}/${accountId}/history`, {
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setHistory(data);
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      onError(err);
      setError(err instanceof Error ? err.message : '无法读取变更记录');
    });
    return () => controller.abort();
  }, [accountId, onError]);
  return <Modal open title="密码变更记录" onCancel={onClose} footer={null} width={720}>
    {error ? <Alert type="error" showIcon title={error} /> :
      <Table rowKey="id" size="small" loading={history === null} dataSource={history ?? []}
        locale={{ emptyText: '暂无换密记录' }} pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          { title: '登记时间', dataIndex: 'changedAt', render: (value: string) => dateFormat.format(new Date(value)) },
          { title: '操作人', dataIndex: 'actorName' },
          { title: '说明', dataIndex: 'reason' },
        ]} />}
  </Modal>;
}
