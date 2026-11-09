import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Select, Space, Spin, Switch, TimePicker, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import type { PushSettings, PushSettingsInput } from '../types/pushSettings';
import type { StandardMaintenanceSettings, StandardMaintainerRoster } from '../types/standardMaintenance';
import styles from './SystemSettingsPage.module.css';

const endpoint = '/api/admin/system-settings/push';
const timeValue = (time: string) => dayjs(`2000-01-01T${time}:00`);
const displayTime = (time: string | null) => time ? new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未安排';

const maintenanceEndpoint = '/api/admin/system-settings/standard-maintenance';
const rosterEndpoint = '/api/admin/system-settings/standard-maintainers';

async function loadSettings(signal?: AbortSignal) {
  const [push, maintenance, roster] = await Promise.all([
    api.get<{ data: PushSettings }>(endpoint, { signal }),
    api.get<{ data: StandardMaintenanceSettings }>(maintenanceEndpoint, { signal }),
    api.get<{ data: StandardMaintainerRoster }>(rosterEndpoint, { signal }),
  ]);
  return { push: push.data, maintenance: maintenance.data, roster: roster.data };
}

export function SystemSettingsPage() {
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [draft, setDraft] = useState<PushSettingsInput | null>(null);
  const [maintenance, setMaintenance] = useState<StandardMaintenanceSettings | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [roster, setRoster] = useState<StandardMaintainerRoster | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = useCallback((data: Awaited<ReturnType<typeof loadSettings>>) => {
    setSettings(data.push); setDraft(data.push);
    setMaintenance(data.maintenance); setMaintenanceEnabled(data.maintenance.enabled);
    setRoster(data.roster); setSelectedIds(data.roster.selectedIds); setError('');
  }, []);
  const load = async () => {
    setBusy(true);
    try { apply(await loadSettings()); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal).then(data => { if (!controller.signal.aborted) apply(data); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [apply]);
  const pushChanged = Boolean(draft && settings && JSON.stringify(draft) !== JSON.stringify(settings));
  const modeChanged = Boolean(maintenance && maintenance.enabled !== maintenanceEnabled);
  const rosterChanged = Boolean(roster && JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...roster.selectedIds].sort()));
  const changed = pushChanged || modeChanged || rosterChanged;
  const save = async () => {
    if (!draft || !settings || !maintenance || !roster || !changed) return;
    setBusy(true);
    const saved: string[] = [];
    let rosterRevision = roster.revision;
    const saveMode = async () => {
      const response = await api.put<{ data: StandardMaintenanceSettings }>(maintenanceEndpoint, { enabled: maintenanceEnabled, revision: maintenance.revision, ...(maintenanceEnabled ? { rosterRevision } : {}) });
      setMaintenance(response.data); setMaintenanceEnabled(response.data.enabled); saved.push('校对模式');
    };
    try {
      // Close first when disabling; activate only after the selected users are saved.
      if (modeChanged && !maintenanceEnabled) await saveMode();
      if (rosterChanged) {
        const response = await api.put<{ data: StandardMaintainerRoster }>(rosterEndpoint, { selectedIds, revision: roster.revision });
        rosterRevision = response.data.revision;
        setRoster(response.data); setSelectedIds(response.data.selectedIds); saved.push('校对人员');
      }
      if (modeChanged && maintenanceEnabled) await saveMode();
      if (pushChanged) {
        const response = await api.put<{ data: PushSettings }>(endpoint, { ...draft, revision: settings.revision });
        setSettings(response.data); setDraft(response.data); saved.push('推送设置');
      }
      setError(''); message.success('设置已保存');
    } catch (err) {
      setError(saved.length ? `已保存${saved.join('、')}。其余设置未保存：${(err as Error).message}` : (err as Error).message);
    } finally { setBusy(false); }
  };
  if (!settings || !draft || !maintenance || !roster) return <div className={styles.page}>{error ? <Alert type="error" title={error} action={<Button disabled={busy} onClick={() => void load()}>刷新设置</Button>} /> : <Spin />}</div>;
  const toggle = (key: 'enabled' | 'standardPublicationEnabled' | 'standardReviewEnabled' | 'productionEnabled', label: string) => <Switch aria-label={label} checkedChildren="开启" unCheckedChildren="关闭" checked={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })} />;
  const status = (enabled: boolean) => <Tag color={settings.enabled && enabled ? 'green' : 'default'}>{settings.enabled && enabled ? '已开启' : '已暂停'}</Tag>;
  return <div className={styles.page}>
    <div className={styles.header}>
      <div><Typography.Title level={3} className={styles.title}>系统设置</Typography.Title>
        <Typography.Text type="secondary">管理产品标准校对与企业微信推送</Typography.Text></div>
      <Space wrap>{changed && <Tag color="gold">有未保存修改</Tag>}
        <Button disabled={busy} onClick={() => void load()}>刷新设置</Button><Button type="primary" disabled={!changed} loading={busy} onClick={() => void save()}>保存设置</Button></Space>
    </div>
    {error && <Alert type="error" title={error} showIcon />}
    <Card className={styles.maintenanceCard}>
      <div className={styles.maintenanceHeading}><strong>产品标准临时校对模式</strong>
        <Space><Tag color={maintenance.enabled ? 'orange' : 'default'}>{maintenance.enabled ? '已开启' : '已关闭'}</Tag>
          <Switch aria-label="产品标准临时校对模式" checkedChildren="开启" unCheckedChildren="关闭" checked={maintenanceEnabled} disabled={busy} onChange={setMaintenanceEnabled} /></Space>
      </div>
      <p>模式开启后，选中的员工可免审核修改已有发布标准；新增、复制仍需审核。</p>
      <div className={styles.maintainerField}>
        <Typography.Text strong>免审核校对人员</Typography.Text>
        <Select mode="multiple" aria-label="免审核校对人员" className={styles.maintainerSelect} disabled={busy}
          value={selectedIds} onChange={setSelectedIds} optionFilterProp="label" maxTagCount="responsive"
          placeholder="搜索姓名或账号，选择校对人员"
          notFoundContent="暂无符合条件的人员"
          options={roster.candidates.map(user => ({ value: user.id, label: `${user.name || user.username} · ${user.username}` }))} />
        <Typography.Text type="secondary">仅显示已激活且具备产品标准提交权限的普通用户。关闭模式后名单保留，但免审核权限不生效。</Typography.Text>
      </div>
      <div className={styles.maintenanceFooter}>模式最近更新：{maintenance.updatedAt ? displayTime(maintenance.updatedAt) : '尚未保存'} · {maintenance.updatedBy || '—'}</div>
    </Card>
    <div className={styles.sectionHeading}><Typography.Title level={4} className={styles.title}>企业微信推送</Typography.Title>
      <Typography.Text type="secondary">北京时间 · 沿用工作日规则</Typography.Text></div>
    <Form disabled={busy}>
      <div className={styles.master}>
        <div><strong>系统推送总开关</strong><p>统一控制企业微信推送，关闭后保留各项设置。</p></div>
        <div className={styles.masterControl}>{status(true)}{toggle('enabled', '系统推送总开关')}</div>
      </div>
      <Card className={styles.card}>
        <section className={styles.row} aria-label="标准发布推送设置">
          <div className={styles.info}><div className={styles.rowHeading}><strong>标准发布公告</strong>{toggle('standardPublicationEnabled', '标准发布推送')}</div><p>审核通过或管理员直接发布后，向群内发送完整标准。</p></div>
          <div className={styles.schedule}><span className={styles.label}>发送时机</span><span>标准发布后立即发送</span></div>
          <div className={styles.status}><span className={styles.label}>当前生效</span>{status(settings.standardPublicationEnabled)}</div>
        </section>
        <section className={styles.row} aria-label="审核提醒设置">
          <div className={styles.info}><div className={styles.rowHeading}><strong>审核提醒</strong>{toggle('standardReviewEnabled', '标准待审提醒')}</div><p>提交审核、手动催审及工作日定时提醒。</p></div>
          <div className={styles.schedule}><span className={styles.label}>工作日提醒时间</span>
            <div className={styles.times}>{draft.reviewTimes.map((time, index) => <Space key={index}>
              <TimePicker aria-label={`审核时间 ${index + 1}`} format="HH:mm" value={time ? timeValue(time) : null} onChange={value => setDraft({ ...draft, reviewTimes: draft.reviewTimes.map((v, i) => i === index ? value?.format('HH:mm') || '' : v) })} />
              <Button type="text" danger disabled={draft.reviewTimes.length === 1} onClick={() => setDraft({ ...draft, reviewTimes: draft.reviewTimes.filter((_, i) => i !== index) })}>删除</Button>
            </Space>)}</div>
            <Button className={styles.add} type="link" onClick={() => setDraft({ ...draft, reviewTimes: [...draft.reviewTimes, ''] })}>添加审核时间</Button>
          </div>
          <div className={styles.status}><span className={styles.label}>当前生效</span>{status(settings.standardReviewEnabled)}<span className={styles.next}>下次：{displayTime(settings.nextReviewAt)}</span></div>
        </section>
        <section className={styles.row} aria-label="生产日报推送设置">
          <div className={styles.info}><div className={styles.rowHeading}><strong>生产日报</strong>{toggle('productionEnabled', '生产日报推送（自动及手动）')}</div><p>控制日报自动推送和手动推送。</p></div>
          <div className={styles.schedule}><span className={styles.label}>工作日推送时间</span><TimePicker allowClear={settings.productionScheduleLegacy} aria-label="生产日报时间" format="HH:mm" value={draft.productionTime ? timeValue(draft.productionTime) : null} onChange={value => setDraft({ ...draft, productionTime: value?.format('HH:mm') || null })} />
            {settings.productionScheduleLegacy && <Alert type="warning" title="沿用旧版 cron 计划。留空保留，选择时间后改为每日定时。" />}
          </div>
          <div className={styles.status}><span className={styles.label}>当前生效</span>{status(settings.productionEnabled)}<span className={styles.next}>下次：{settings.productionScheduleLegacy && settings.enabled && settings.productionEnabled ? '沿用旧版 cron 计划' : displayTime(settings.nextProductionAt)}</span></div>
        </section>
      </Card>
    </Form>
    <div className={styles.footer}><span>关闭期间不积压消息，重新开启不补发旧公告和日报。</span><span>最近更新：{settings.updatedAt ? displayTime(settings.updatedAt) : '尚未保存'} · {settings.updatedBy || '—'}</span></div>
  </div>;
}
