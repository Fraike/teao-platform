import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Space, Spin, Switch, TimePicker, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import type { PushSettings, PushSettingsInput } from '../types/pushSettings';
import styles from './SystemSettingsPage.module.css';

const endpoint = '/api/admin/system-settings/push';
const timeValue = (time: string) => dayjs(`2000-01-01T${time}:00`);
const displayTime = (time: string | null) => time ? new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未安排';

export function SystemSettingsPage() {
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [draft, setDraft] = useState<PushSettingsInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setBusy(true);
    try {
      const response = await api.get<{ ok: true; data: PushSettings }>(endpoint);
      setSettings(response.data); setDraft(response.data); setError('');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void api.get<{ ok: true; data: PushSettings }>(endpoint).then(response => {
      if (active) { setSettings(response.data); setDraft(response.data); }
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const save = async () => {
    if (!draft || !settings) return;
    setBusy(true);
    try {
      const response = await api.put<{ ok: true; data: PushSettings }>(endpoint, { ...draft, revision: settings.revision });
      setSettings(response.data); setDraft(response.data); setError(''); message.success('推送设置已保存');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  if (!settings || !draft) return <div className={styles.page}>{error ? <Alert type="error" title={error} action={<Button onClick={() => void load()}>重试</Button>} /> : <Spin />}</div>;
  const toggle = (key: 'enabled' | 'standardPublicationEnabled' | 'standardReviewEnabled' | 'productionEnabled', label: string) => <Switch aria-label={label} checkedChildren="开启" unCheckedChildren="关闭" checked={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })} />;
  const status = (enabled: boolean) => <Tag color={settings.enabled && enabled ? 'green' : 'default'}>{settings.enabled && enabled ? '已开启' : '已暂停'}</Tag>;
  return <div className={styles.page}>
    <div className={styles.header}>
      <div><Typography.Title level={3} className={styles.title}>系统推送设置</Typography.Title>
        <Typography.Text type="secondary">北京时间 · 沿用工作日规则 · 修改后保存生效</Typography.Text></div>
      <Space><Button disabled={busy} onClick={() => void load()}>刷新配置</Button><Button type="primary" loading={busy} onClick={() => void save()}>保存设置</Button></Space>
    </div>
    {error && <Alert type="error" title={error} showIcon />}
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
