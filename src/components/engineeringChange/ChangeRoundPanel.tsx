import { Space, Table, Tag, Typography } from 'antd';
import { allocationLabel, changeTime } from '../../lib/engineeringChange';
import { allocationSource, applicationContent, roundAffectedMaterials } from '../../../server/shared/engineering-change-content.ts';
import type { ChangeAllocation, ChangeRound } from '../../types/engineeringChange';
import { ChangeAttachmentList } from './ChangeAttachmentList';
import styles from './EngineeringChange.module.css';

interface Props {
  round: ChangeRound;
  changeId: string;
  people: Record<string, string>;
  history?: boolean;
}

export function ChangeRoundPanel({ round, changeId, people, history }: Props) {
  const materials = roundAffectedMaterials(round);
  return <Space orientation="vertical" className={styles.stack}>
    {history && <>
      <Typography.Text strong>{round.draft.title}</Typography.Text>
      <Typography.Paragraph className={styles.contentText}>{applicationContent(round.draft)}</Typography.Paragraph>
      <ChangeAttachmentList changeId={changeId} files={round.draft.attachments ?? []} />
    </>}
    <Typography.Text type="secondary">PMC 评估 · {changeTime(round.at)}</Typography.Text>
    {round.noImpact && <Tag>无受影响库存及在制品</Tag>}
    {materials.length > 0 && <Typography.Text className={styles.contentText}>受影响物料 · {materials.map(material => `${material.code} ${material.name}`).join('、')}</Typography.Text>}
    {round.note && <Typography.Paragraph className={styles.contentText}>{round.note}</Typography.Paragraph>}
    {round.lines.length > 0 && <Table<ChangeAllocation> dataSource={round.lines} pagination={false} size="small" scroll={{ x: 1120 }}
      rowKey={(_, index) => String(index)} columns={[
        { title: '物料 / 位置 / 批次 / 单位', render: (_, row) => allocationLabel(row, materials) },
        { title: '仓库实存', dataIndex: 'stock' }, ...(round.lines.some(row => row.semi !== undefined) ? [{ title: '入库半成品', dataIndex: 'semi' }] : []), { title: '在制', dataIndex: 'wip' },
        { title: '拟报废', dataIndex: 'scrap' }, { title: '数量来源', render: (_, row) => allocationSource(row) },
        { title: '核对时间', render: (_, row) => row.checkedAt ? changeTime(row.checkedAt) : '—' },
        { title: '剩余处置', dataIndex: 'disposition' },
      ]} />}
    {round.reviewers.map(row => <div key={row.name} className={styles.reviewer}>
      <Tag color={row.decision === 'approved' ? 'success' : row.decision === 'returned' ? 'error' : 'default'}>
        {row.decision === 'approved' ? '已通过' : row.decision === 'returned' ? '已退回' : '未审批'}
      </Tag>
      <Typography.Text className={styles.contentText}>{[row.name, people[row.userId] ?? row.userId, row.at && changeTime(row.at), row.note]
        .filter(Boolean).join(' · ')}</Typography.Text>
    </div>)}
  </Space>;
}
