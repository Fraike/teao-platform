import { useState } from 'react';
import { Button, Card, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { OrganizationReconciliation } from '../../types/organization';

type Kind = OrganizationReconciliation['kind'];
const labels: Record<Kind, string> = {
  match: '同名可核对', department_diff: '归属不同', ambiguous: '重名或冲突',
  hr_only: '仅在人事', wecom_only: '仅在企微',
};

interface Props {
  rows: OrganizationReconciliation[];
  onLink: (row: OrganizationReconciliation) => void;
}

export function OrganizationReconciliationPanel({ rows, onLink }: Props) {
  const [filter, setFilter] = useState<'issues' | 'all'>('issues');
  const review = rows.filter(row => row.kind !== 'match' || !row.linkedUserId);
  return <Card title="企微通讯录核对" extra={<Segmented<'issues' | 'all'> value={filter}
    options={[{ value: 'issues', label: '待核对' }, { value: 'all', label: '全部' }]} onChange={setFilter} />}>
    <Typography.Paragraph type="secondary">部门与在职状态以员工管理为准。确认身份后，可将员工与平台账号关联。</Typography.Paragraph>
    <Table<OrganizationReconciliation> size="small" rowKey="key" scroll={{ x: 720 }}
      dataSource={filter === 'issues' ? review : rows} pagination={{ pageSize: 12, showSizeChanger: false }}
      locale={{ emptyText: '暂无需要核对的记录' }} columns={[
        { title: '姓名', dataIndex: 'name' },
        { title: '工号', render: (_, row) => row.employeeNo || '—' },
        { title: '人事部门', render: (_, row) => row.department || '—' },
        { title: '企微部门', render: (_, row) => row.wecomDepartments.join('、') || '—' },
        { title: '核对状态', render: (_, row) => <Space wrap>
          <Tag color={row.kind === 'department_diff' || row.kind === 'ambiguous' ? 'warning' : 'default'}>{labels[row.kind]}</Tag>
          {row.linkedUserId && <Tag color="success">已关联</Tag>}
        </Space> },
        { title: '操作', render: (_, row) => row.employeeNo && <Button type="link" size="small" onClick={() => onLink(row)}>
          {row.linkedUserId ? '调整关联' : row.suggestedUserId ? '核对关联' : '关联账号'}
        </Button> },
      ]} />
  </Card>;
}
