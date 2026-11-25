import { useEffect, useEffectEvent } from 'react';
import { App } from 'antd';
import { isApiError } from '../../lib/api';
import { changeApi, changeDeliveryStatuses } from '../../lib/engineeringChange';
import { submissionDeliveries } from '../../../server/shared/engineering-change-content.ts';
import type { ChangeDetail } from '../../types/engineeringChange';

interface Props {
  id: string;
  version: number;
  onComplete: (detail?: ChangeDetail) => void;
  onViewRecords: () => void;
}

export function ChangeSubmissionDelivery({ id, version, onComplete, onViewRecords }: Props) {
  const { modal } = App.useApp();
  const finish = useEffectEvent((detail?: ChangeDetail) => {
    const failures = detail ? submissionDeliveries(detail.deliveries, version).failures : [];
    if (detail && failures.length > 0) {
      modal.warning({
        title: '单据已提交，有企微通知未送达',
        content: <ul>{failures.map(row => <li key={`${row.event}:${row.userId}`}>
          {detail.people[row.userId] ?? row.userId}（{row.event === 'cc' ? '抄送' : 'PMC 待办'}） · {changeDeliveryStatuses[row.status] ?? row.status}
        </li>)}</ul>,
        okText: '查看投递记录',
        cancelText: '关闭',
        okCancel: true,
        onOk: onViewRecords,
      });
    }
    onComplete(detail);
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    let attempts = 0;
    async function check() {
      try {
        const { data } = await changeApi.get(id, controller.signal);
        if (controller.signal.aborted) return;
        if (!submissionDeliveries(data.deliveries, version).pending) { finish(data); return; }
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (isApiError(reason) && [401, 403, 404].includes(reason.status)) { finish(); return; }
      }
      timer = window.setTimeout(() => void check(), ++attempts <= 8 ? 2000 : 15_000);
    }
    void check();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [id, version]);
  return null;
}
