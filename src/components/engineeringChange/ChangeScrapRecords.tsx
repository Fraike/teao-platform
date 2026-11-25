import { Card, Collapse, Space, Table, Tag, Typography } from 'antd';
import { allocationWarehouse, roundAffectedMaterials } from '../../../server/shared/engineering-change-content.ts';
import { changeTime } from '../../lib/engineeringChange';
import type { ChangeAttachment, ChangeDetail, ChangeMaterial, ChangeScrapRecord } from '../../types/engineeringChange';
import { ChangeAttachmentList } from './ChangeAttachmentList';
import styles from './EngineeringChange.module.css';

export function ChangeScrapRecords({ detail }: { detail: ChangeDetail }) {
  const { change, people } = detail;
  const confirm = change.history.findLast(row => row.action === 'confirm');
  const legacyRecord = change.records.findLast(row => !row.superseded && !row.warehouseResult);
  const rounds = new Map<number, ChangeScrapRecord[]>();
  for (const record of change.records) {
    const records = rounds.get(record.round) ?? [];
    records.push(record);
    rounds.set(record.round, records);
  }
  const entries = [...rounds].reverse();
  const materialSnapshots = new Map(change.rounds.map(round => [round.number, roundAffectedMaterials(round)]));
  return <Card title="报废记录" size="small">
    <Collapse key={entries[0]?.[0]} defaultActiveKey={entries[0] ? [String(entries[0][0])] : []}
      items={entries.map(([round, records]) => ({
        key: String(round),
        label: `第 ${round} 轮报废`,
        children: records.slice().reverse().map((record, index) => <section className={styles.scrapRecord} key={index}>
          <Space wrap>
            <Typography.Text strong>{people[record.userId] ?? record.userId}</Typography.Text>
            <Typography.Text type="secondary">{changeTime(record.at)}</Typography.Text>
            <Tag color={record.superseded ? 'default' : record.warehouseResult === 'difference' ? 'warning' :
              record.warehouseResult === 'closed' || (record === legacyRecord && confirm) ? 'success' : 'processing'}>
              {record.superseded ? '已补正' : record.warehouseResult === 'difference' ? '有差异 · 已退回 PMC' :
                record.warehouseResult === 'closed' || (record === legacyRecord && confirm) ? '仓库复核通过' : '已登记'}
            </Tag>
          </Space>
          <ScrapQuantities record={record} materials={materialSnapshots.get(round) ?? change.draft.materials} />
          {record.differenceReason && <Typography.Paragraph className={styles.contentText}>
            差异原因 · {record.differenceReason}
          </Typography.Paragraph>}
          {record.evidence && <Typography.Paragraph className={styles.contentText}>凭证引用 · {record.evidence}</Typography.Paragraph>}
          {record === legacyRecord && confirm && <Typography.Text type="secondary">
            仓库复核 · {[confirm.name, changeTime(confirm.at), confirm.note].filter(Boolean).join(' · ')}
          </Typography.Text>}
          <div className={styles.scrapEvidence}>
            <Evidence changeId={change.id} label="报废现场照片"
              file={record.verificationPhoto ?? (record === legacyRecord ? change.scrapVerificationPhoto : undefined)} />
            <Evidence changeId={change.id} label="金蝶报废记录"
              file={record.kingdeeScrapEvidence ?? (record === legacyRecord ? change.kingdeeScrapEvidence : undefined)}
              note={record === legacyRecord && change.kingdeeScrapBillNo ? `金蝶单号 ${change.kingdeeScrapBillNo}` : undefined} />
          </div>
        </section>),
      }))} />
  </Card>;
}

function ScrapQuantities({ record, materials }: { record: ChangeScrapRecord; materials: ChangeMaterial[] }) {
  return <Table<ChangeScrapRecord['lines'][number]> size="small" pagination={false} scroll={{ x: 570 }}
    rowKey={(_, index) => String(index)} dataSource={record.lines} columns={[
      { title: '物料', render: (_, { allocation }) => {
        const material = materials.find(row => row.id === allocation.materialId);
        return material ? [material.code, material.name, material.unit].filter(Boolean).join(' · ') : allocation.materialId;
      } },
      { title: '仓库 / 仓位', render: (_, { allocation }) => allocationWarehouse(allocation) },
      { title: '批次', render: (_, { allocation }) => allocation.batch || '—' },
      { title: '累计批准量', align: 'right', render: (_, { allocation }) => allocation.scrap },
      { title: '本次实际量', align: 'right', dataIndex: 'quantity' },
    ]} />;
}

function Evidence({ changeId, label, file, note }: { changeId: string; label: string; file?: ChangeAttachment; note?: string }) {
  if (!file && !note) return null;
  return <div>
    <Typography.Text strong>{label}</Typography.Text>
    {note && <div><Typography.Text type="secondary">{note}</Typography.Text></div>}
    {file && <ChangeAttachmentList changeId={changeId} files={[file]} />}
  </div>;
}
