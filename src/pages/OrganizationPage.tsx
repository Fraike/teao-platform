import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Empty, Modal, Select, Space, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../lib/authStore';
import { organizationApi } from '../lib/organization';
import { OrganizationReconciliationPanel } from '../components/organization/OrganizationReconciliationPanel';
import type { OrganizationReconciliation, OrganizationSettings, OrganizationView } from '../types/organization';
import styles from './OrganizationPage.module.css';

type Edit = { name: string; employeeNo: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试';

export function OrganizationPage() {
  const user = useAuthStore(state => state.user);
  const isAdmin = user?.role === 'admin';
  const { message } = App.useApp();
  const [view, setView] = useState<OrganizationView>();
  const [settings, setSettings] = useState<OrganizationSettings>();
  const [selected, setSelected] = useState('');
  const [edit, setEdit] = useState<Edit>();
  const [person, setPerson] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data } = await organizationApi.get(controller.signal);
        if (!controller.signal.aborted) setView(data);
        if (isAdmin) {
          const result = await organizationApi.settings(controller.signal);
          if (!controller.signal.aborted) setSettings(result.data);
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(errorText(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [isAdmin, revision]);

  function openLink(row: OrganizationReconciliation) {
    if (!row.employeeNo) return;
    setPerson(row.linkedUserId ?? row.suggestedUserId);
    setEdit({ name: row.name, employeeNo: row.employeeNo });
  }

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await organizationApi.setLink(edit.employeeNo, person ?? '');
      setEdit(undefined);
      void message.success('已保存');
      refresh();
    } catch (reason) {
      void message.error(errorText(reason));
    } finally { setBusy(false); }
  }

  const department = view?.departments.find(row => row.name === selected) ?? view?.departments[0];
  const unassigned = selected === 'unassigned' && Boolean(view?.unassigned.length);
  const members = unassigned ? view?.unassigned : department?.members;
  const people = settings?.people.map(row => ({ value: row.id, label: row.name })) ?? [];

  return <Space orientation="vertical" size="middle" className={styles.page}>
    <Card>
      <div className={styles.header}>
        <Typography.Title level={4} className={styles.title}>组织架构</Typography.Title>
        <Space wrap>
          {(isAdmin || user?.permissions.includes('hr')) && <Link to="/employees">员工管理</Link>}
          <Button size="small" onClick={refresh} loading={loading}>刷新</Button>
        </Space>
      </div>
    </Card>
    {error && <Alert type="error" showIcon title={error} />}
    {!view && loading && <Spin />}
    {view && <div className={styles.columns}>
      <Card size="small" title="部门">
        <div className={styles.departmentList}>
          {view.departments.map(row => <Button key={row.name} block aria-pressed={!unassigned && row.name === department?.name}
            type={!unassigned && row.name === department?.name ? 'primary' : 'default'} onClick={() => setSelected(row.name)}>
            {row.name}（{row.members.length}）
          </Button>)}
          {view.unassigned.length > 0 && <Button block aria-pressed={unassigned}
            type={unassigned ? 'primary' : 'default'} onClick={() => setSelected('unassigned')}>
            待明确归属（{view.unassigned.length}）
          </Button>}
        </div>
      </Card>
      <Card title={unassigned ? '待明确归属' : department?.name || '在职成员'}>
        {!unassigned && department && <Typography.Paragraph type="secondary">
          负责人 {department.leader?.name ?? '待确认'} · 在职 {department.members.length} 人
          {department.issue && ` · ${department.issue}`}
        </Typography.Paragraph>}
        {members?.length ? <ul className={styles.memberList}>{members.map((member, index) =>
          <li key={index}>{member.name}</li>)}</ul> : <Empty description="暂无在职成员" />}
      </Card>
    </div>}
    {isAdmin && settings && <details>
      <summary>核对企微通讯录与平台账号</summary>
      <OrganizationReconciliationPanel rows={settings.reconciliation} onLink={openLink} />
    </details>}
    {edit && <Modal title={`关联平台账号 · ${edit.name}`}
      open confirmLoading={busy} onOk={() => void save()} onCancel={() => { if (!busy) setEdit(undefined); }}
      okText="保存" cancelText="取消">
      <Typography.Paragraph>请核对员工和所选平台账号属于同一人。</Typography.Paragraph>
      <Select aria-label="平台账号" className={styles.accountSelect} options={people} value={person}
        onChange={setPerson} allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="搜索员工的平台账号" />
    </Modal>}
  </Space>;
}
