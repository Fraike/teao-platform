import { Tag } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { changeStatus, changeTime } from '../../lib/engineeringChange';
import type { ChangeStatus, ChangeTask } from '../../types/engineeringChange';
import styles from './EngineeringChange.module.css';

export function ChangeStateTag({ status, tasks = [], closedAt, prominent = false }: {
  status: ChangeStatus;
  tasks?: ChangeTask[];
  closedAt?: string;
  prominent?: boolean;
}) {
  const active = status === 'assessment' || status === 'review' || status === 'scrap' || status === 'verify';
  const current = tasks.length === 1 ? tasks[0].title.replace(/^工程变更/, '') : '';
  const label = status === 'review' && current ? `会签中 · ${current}` :
    (status === 'scrap' || status === 'verify') && current ? current : changeStatus[status];
  return <span className={styles.changeState} data-prominent={prominent || undefined}>
    <Tag color={status === 'closed' ? 'success' : active ? 'processing' : undefined}
      icon={status === 'closed' ? <CheckCircleOutlined /> : active ? <ClockCircleOutlined /> : undefined}>
      {label}
    </Tag>
    {status === 'closed' && closedAt && <time dateTime={closedAt}>{changeTime(closedAt)}</time>}
  </span>;
}
