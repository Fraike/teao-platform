import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Segmented, Space, Spin, Table, Tag, Typography } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../lib/authStore';
import { isApiError } from '../lib/api';
import { changeAction, changeApi, changeTime, errorText } from '../lib/engineeringChange';
import type { ChangeAction, ChangeDetail, ChangeDraft, ChangeDraftTransfer, ChangeListItem, ChangeSummary } from '../types/engineeringChange';
import { ChangeSubmissionDelivery } from '../components/engineeringChange/ChangeSubmissionDelivery';
import { ChangeUsageGuide } from '../components/engineeringChange/ChangeUsageGuide';
import { ChangeDraftForm } from '../components/engineeringChange/ChangeDraftForm';
import { ChangeDetailPanel } from '../components/engineeringChange/ChangeDetailPanel';
import { ChangeStateTag } from '../components/engineeringChange/ChangeStateTag';
import { ChangeActionDialog } from '../components/engineeringChange/ChangeActionDialog';
import styles from '../components/engineeringChange/EngineeringChange.module.css';

type Scope = 'pending' | 'mine' | 'all';
const blankDraft: ChangeDraft = { title: '', content: '', materials: [] };

export function EngineeringChangePage() {
  const user = useAuthStore(state => state.user);
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const selected = params.get('changeId');
  const viewDeliveries = params.get('deliveries') ?? undefined;
  const drafting = !selected && params.get('new') === '1';
  const editing = Boolean(selected) || drafting;
  const pageTop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected && !viewDeliveries) pageTop.current?.scrollIntoView({ block: 'start' });
  }, [selected, viewDeliveries]);
  const [scope, setScope] = useState<Scope>('pending');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ChangeListItem[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [detail, setDetail] = useState<ChangeDetail>();
  const [actionTarget, setActionTarget] = useState<{ id: string; action: ChangeAction }>();
  const action = actionTarget?.id === selected ? actionTarget.action : undefined;
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [submissions, setSubmissions] = useState<{ id: string; version: number }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (drafting) { setLoading(false); return; }
      setLoading(true);
      setError('');
      try {
        if (selected) {
          const { data } = await changeApi.get(selected, controller.signal);
          if (!controller.signal.aborted) setDetail(current =>
            current?.change.id === data.change.id && current.change.version > data.change.version ? current : data);
        } else {
          const { data } = await changeApi.list(scope, page, controller.signal);
          if (!controller.signal.aborted) {
            setRows(data.rows);
            setHasNext(data.hasNext);
            setCanCreate(data.canCreate);
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          const accessRevoked = isApiError(reason) && [401, 403, 404].includes(reason.status);
          setDetail(current => !accessRevoked && current?.change.id === selected &&
            current.actions.includes('assess') ? current : undefined);
          setError(errorText(reason));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [selected, drafting, scope, page, refresh, viewDeliveries]);

  const showAssessment = detail?.change.id === selected && detail.actions.includes('assess');
  const detailStatus = detail?.change.status;
  const pollDetail = selected === detail?.change.id && detailStatus !== 'draft' &&
    detailStatus !== 'discarded' && detailStatus !== 'closed';
  useEffect(() => {
    if (!selected || !pollDetail || busy || action || loading) return;
    const id = selected;
    const controller = new AbortController();
    let pending = false;
    async function update() {
      if (pending || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const { data } = await changeApi.get(id, controller.signal);
        if (!controller.signal.aborted) setDetail(current =>
          current?.change.id === selected && current.change.version <= data.change.version ? data : current);
      } catch (reason) {
        if (!controller.signal.aborted && isApiError(reason) && [401, 403, 404].includes(reason.status)) {
          setDetail(current => current?.change.id === id ? undefined : current);
          setError(errorText(reason));
        }
      } finally { pending = false; }
    }
    const timer = window.setInterval(() => void update(), 15_000);
    const onFocus = () => void update();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [selected, pollDetail, busy, action, loading]);

  function open(id?: string) {
    setDetail(undefined);
    setActionTarget(undefined);
    setError('');
    setLoading(true);
    setParams(id ? { changeId: id } : {});
  }

  function showExisting(draft: Pick<ChangeSummary, 'id' | 'number' | 'title'>) {
    modal.confirm({
      title: '还有未处理的草稿',
      content: `${draft.number}${draft.title ? ' · ' + draft.title : ''}。请先提交该草稿，或打开后确认放弃，再新建申请。`,
      okText: '继续编辑',
      cancelText: '稍后处理',
      onOk: () => open(draft.id),
    });
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      const { data } = await changeApi.draftCheck();
      if (data) showExisting(data);
      else {
        setDetail(undefined);
        setParams({ new: '1' });
      }
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function submitAction(current: ChangeAction, values: object, assessedVersion?: number) {
    if (!detail || detail.change.id !== selected || busy || loading) return;
    if (current === 'assess' ? !detail.actions.includes('assess') : action !== current) return;
    const change = assessedVersion === undefined ? detail.change : { ...detail.change, version: assessedVersion };
    setBusy(true);
    setError('');
    try {
      const { data } = await changeApi.act(change, current, values);
      setDetail(data);
      setActionTarget(undefined);
      void message.success(`${changeAction[current]}成功`);
      if (current === 'discard') open();
    } catch (reason) {
      if (isApiError(reason) && reason.status === 409 && reason.message.includes('单据已更新')) {
        try {
          const { data } = await changeApi.get(detail.change.id);
          setDetail(data);
          setActionTarget(undefined);
          void message.warning('单据已更新，请根据最新内容重新处理');
          return;
        } catch { /* 保留原操作错误 */ }
      }
      setError(errorText(reason));
    } finally { setBusy(false); }
  }

  async function saveDraft(draft: ChangeDraft, submit: boolean, transfer: ChangeDraftTransfer) {
    const current = selected && detail?.change.id === selected ? detail : undefined;
    if (!current && !drafting) return;
    setBusy(true);
    setError('');
    try {
      if (!current) {
        const { data } = await changeApi.create(draft, transfer, submit);
        setScope('mine');
        setPage(1);
        open(data.id);
        if (submit) watchSubmission(data);
        void message.success(submit ? '已提交 PMC 评估' : '草稿已保存');
        return;
      }
      const saved = (await changeApi.act(current.change, 'save', { draft, ...transfer })).data;
      setDetail(saved);
      if (submit) {
        const { data } = await changeApi.act(saved.change, 'submit');
        setDetail(data);
        watchSubmission(data.change);
      }
      void message.success(submit ? '已提交 PMC 评估' : '草稿已保存');
    } catch (reason) {
      if (!current && isApiError(reason) && reason.status === 409 && reason.message.includes('已有未处理的草稿')) {
        try {
          const { data } = await changeApi.draftCheck();
          if (data) { showExisting(data); return; }
        } catch { /* 保留原保存错误 */ }
      }
      if (current && isApiError(reason) && reason.status === 409 && reason.message.includes('单据已更新')) {
        try {
          setDetail((await changeApi.get(current.change.id)).data);
          setError('已加载最新草稿，请核对后重新编辑');
          return;
        }
        catch { /* 保留草稿输入和原错误 */ }
      }
      setError(errorText(reason));
    } finally { setBusy(false); }
  }

  function watchSubmission({ id, version }: { id: string; version: number }) {
    setSubmissions(previous => [...previous, { id, version }]);
  }

  return <Space orientation="vertical" size="middle" className={editing ? styles.flowPage : styles.stack}>
    <div ref={pageTop}><Card size={editing ? "small" : "medium"}>
      <Space wrap>
        <Typography.Text strong>工程变更</Typography.Text>
        {editing ? <Button onClick={() => open()} disabled={busy}>返回列表</Button> :
          <Segmented<Scope> value={scope} options={[
            { value: 'pending', label: '待我处理' }, { value: 'mine', label: '我的申请' }, { value: 'all', label: '可查看单据' },
          ]} onChange={value => { setScope(value); setPage(1); }} />}
        {!drafting && <Button onClick={() => setRefresh(value => value + 1)} disabled={busy} loading={loading}>刷新</Button>}
        {!editing && canCreate && <Button type="primary" onClick={() => void create()} loading={busy}>新建申请</Button>}
        {submissions.some(row => row.id === selected) && <Tag color="processing">企微通知处理中</Tag>}
        <Button icon={<BookOutlined />} onClick={() => setGuide(true)}>使用指南</Button>
      </Space>
    </Card></div>
    {error && !action && (!detail || drafting) && <Alert type="error" showIcon title={error} />}
    {drafting ? <ChangeDraftForm title="新建工程变更申请" creatorId={user?.id ?? ''} draft={blankDraft} busy={busy}
      onSave={(draft, submit, transfer) => void saveDraft(draft, submit, transfer)}
        onReminded={next => setDetail(current => current?.change.id === next.change.id &&
          current.change.version <= next.change.version ? next : current)} /> : selected ? loading && !showAssessment ? <Spin /> : detail && detail.change.id === selected &&
      <ChangeDetailPanel detail={detail} viewDeliveries={viewDeliveries} busy={busy || loading} error={!action ? error : ''} onAction={value => { setError(''); setActionTarget({ id: detail.change.id, action: value }); }}
        onAssess={(values, version) => void submitAction('assess', values, version)}
        onSave={(draft, submit, transfer) => void saveDraft(draft, submit, transfer)}
        onReminded={next => setDetail(current => current?.change.id === next.change.id &&
          current.change.version <= next.change.version ? next : current)} /> :
      <Card size="small">
        <Table<ChangeListItem> loading={loading} rowKey="id" pagination={false} dataSource={rows} size="middle" scroll={{ x: scope === 'pending' ? 1036 : 940 }} columns={[
          { title: '变更单据', width: 310, render: (_, row) => <div className={styles.listCell}>
            <Button className={styles.listTitle} type="link" onClick={() => open(row.id)}>{row.title || '未命名草稿'}</Button>
            <Typography.Text type="secondary">{row.number}</Typography.Text>
          </div> },
          { title: '申请人 / 提交时间', width: 175, render: (_, row) => <div className={styles.listCell}>
            <Typography.Text strong>{row.creatorName || '未知申请人'}</Typography.Text>
            <Typography.Text type="secondary">{row.submittedAt ? changeTime(row.submittedAt) : '未提交'}</Typography.Text>
          </div> },
          { title: '工程申请物料', width: 210, render: (_, row) => <div className={styles.listCell}>
            {row.materials?.length ? row.materials.map(material => <Typography.Text key={material.id}>
              {material.code} · {material.name}
            </Typography.Text>) : <Typography.Text type="secondary">—</Typography.Text>}
            {row.materialCount > (row.materials?.length ?? 0) && <Typography.Text type="secondary">共 {row.materialCount} 项</Typography.Text>}
          </div> },
          { title: '当前进度', width: 245, render: (_, row) => <div className={styles.listCell}>
            <ChangeStateTag status={row.status} tasks={row.tasks} closedAt={row.updatedAt} />
            {row.tasks?.map(task => <Typography.Text key={task.key} type="secondary">
              {task.assignee || '处理人待核对'}{row.tasks.length > 1 ? ` · ${task.title.replace(/^工程变更待/, '')}` : ''}
            </Typography.Text>)}
          </div> },
          ...(scope === 'pending' ? [{
            title: '操作', key: 'operation', width: 96, fixed: 'right' as const,
            render: (_: unknown, row: ChangeListItem) => <Button type="primary" size="small" onClick={() => open(row.id)}>去处理</Button>,
          }] : []),
        ]} />
        <Space className={styles.controls}>
          <Button disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>上一页</Button>
          <Typography.Text>第 {page} 页</Typography.Text>
          <Button disabled={loading || !hasNext} onClick={() => setPage(value => value + 1)}>下一页</Button>
        </Space>
      </Card>}
    {submissions.map(row => <ChangeSubmissionDelivery key={`${row.id}:${row.version}`} {...row}
      onViewRecords={() => setParams({ changeId: row.id, deliveries: String(row.version) })}
      onComplete={next => {
        setSubmissions(previous => previous.filter(item => item !== row));
        if (next) setDetail(current => current?.change.id === next.change.id &&
          current.change.version === next.change.version ? { ...current, deliveries: next.deliveries } : current);
      }} />)}
    {guide && <ChangeUsageGuide onClose={() => setGuide(false)} />}
    {action && detail && <ChangeActionDialog key={`${detail.change.id}:${action}`} action={action} detail={detail}
      busy={busy} error={error} onClose={() => { setError(''); setActionTarget(undefined); }}
      onSubmit={values => void submitAction(action, values)} />}
  </Space>;
}
