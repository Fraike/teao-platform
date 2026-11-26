import { Alert, App, Button, Card, Collapse, Input, Space, Tag, Typography } from 'antd';
import { changeAction, changeApi, changeDeliveryStatuses, changeTime, errorText } from '../../lib/engineeringChange';
import type { ChangeAction, ChangeDetail, ChangeDraft, ChangeDraftTransfer } from '../../types/engineeringChange';
import { applicationContent, changeCcRecipients } from '../../../server/shared/engineering-change-content.ts';
import { openChangePrint } from '../../lib/engineeringChangePrint';
import { ChangeRoundPanel } from './ChangeRoundPanel';
import { ChangeScrapRecords } from './ChangeScrapRecords';
import { ChangeAttachmentList } from './ChangeAttachmentList';
import { ChangeStateTag } from './ChangeStateTag';
import { ChangeFlow } from './ChangeFlow';
import { ChangeAssessmentPanel } from './ChangeAssessmentPanel';
import { ChangeDraftForm } from './ChangeDraftForm';
import styles from './EngineeringChange.module.css';

interface Props {
  detail: ChangeDetail;
  viewDeliveries?: string;
  busy: boolean;
  error: string;
  onAction: (action: ChangeAction) => void;
  onAssess: (values: object, version: number) => void;
  onReminded: (detail: ChangeDetail) => void;
  onSave: (draft: ChangeDraft, submit: boolean, transfer: ChangeDraftTransfer) => void;
}

export function ChangeDetailPanel({ detail, viewDeliveries, busy, error, onAction, onAssess, onSave, onReminded }: Props) {
  const { change, actions, people, deliveries } = detail;
  const { draft } = change;
  const { message, modal } = App.useApp();
  const latest = change.status !== 'draft' && change.status !== 'assessment' ? change.rounds.at(-1) : undefined;
  const past = latest ? change.rounds.slice(0, -1) : change.rounds;
  const submittedAt = change.submittedAt ?? change.history.find(row => row.action === 'submit')?.at;
  const cc = changeCcRecipients(change);
  const copyStatuses = new Map(deliveries.filter(row => row.event === 'cc').map(row => [`${row.userId}:${row.generation}`, row.status]));
  async function copyLink() {
    const url = new URL(`/engineering-changes?changeId=${encodeURIComponent(change.id)}`, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      void message.success('已复制单据链接');
    } catch {
      modal.info({ title: '复制单据链接', okText: '关闭',
        content: <Input readOnly aria-label="单据链接" value={url} onFocus={event => event.currentTarget.select()} /> });
    }
  }
  async function print() {
    try {
      await openChangePrint(async () => {
        const { data } = await changeApi.get(change.id);
        if (data.change.status === 'draft') throw new Error('单据已退回草稿，重新提交后可打印');
        return data;
      }, new URL('../../lib/engineeringChangePrint.css', import.meta.url).href);
    }
    catch (reason) { void message.error(errorText(reason)); }
  }
  const name = (id: string) => people[id] ?? id;
  const title = [change.number, draft.title].filter(Boolean).join(' · ');
  const status = <ChangeStateTag status={change.status} tasks={detail.tasks} closedAt={change.updatedAt} prominent />;
  const canAssess = actions.includes('assess');
  const availableActions = actions.filter(action => action !== 'save' && action !== 'submit' &&
    (!canAssess || (action !== 'assess' && action !== 'return')));
  const pastRounds = past.length > 0 && <Collapse items={[...past].reverse().map(round => ({
    key: String(round.number), label: `第 ${round.number} 轮评估与会签 · ${changeTime(round.at)}`,
    children: <ChangeRoundPanel round={round} changeId={change.id} people={people} history />,
  }))} />;

  if (actions.includes('save')) {
    return <ChangeDraftForm key={`${change.id}:${change.version}`} title={title} titleExtra={status} error={error}
      changeId={change.id} creatorId={change.creator} previousDepartments={change.assignment?.departments.map(row => row.name)}
      detail={detail} viewDeliveries={viewDeliveries} onReminded={onReminded} draft={draft} busy={busy} onSave={onSave} pastRounds={pastRounds}
      onDiscard={actions.includes('discard') ? () => onAction('discard') : undefined} />;
  }

  return <div className={styles.flowLayout}><Space orientation="vertical" className={styles.stack} size="middle">
    <Card>
      <header className={styles.detailHeader}>
        <div className={styles.changeHeading}>
          <Typography.Text type="secondary" strong>{change.number}</Typography.Text>
          {status}
        </div>
        <Typography.Title level={3} className={styles.detailTitle}>{draft.title || '未命名草稿'}</Typography.Title>
        {detail.tasks.length > 0 && <Typography.Text className={styles.contentText}>
          待办人 · {[...new Set(detail.tasks.map(task => name(task.userId)))].join('、')}
        </Typography.Text>}
      </header>
      {error && !canAssess && <Alert type="error" showIcon title={error} />}
      {change.status !== 'draft' && <div className={styles.detailActions}>
        <Space wrap>
          <Button size="small" onClick={() => void copyLink()}>复制链接</Button>
          <Button size="small" onClick={() => void print()}>打印 / 保存 PDF</Button>
        </Space>
      </div>}
    </Card>
    <Card size="small" title="申请内容">
      <Typography.Paragraph className={styles.contentText}>{applicationContent(draft) || '—'}</Typography.Paragraph>
      {Boolean(draft.attachments?.length) && <section className={styles.optionalSection}>
        <Typography.Text strong>申请附件</Typography.Text>
        <ChangeAttachmentList changeId={change.id} files={draft.attachments ?? []} />
      </section>}
      <dl className={styles.detailMetadata}>
        <div><dt>发起人</dt><dd>{name(change.creator)}</dd></div>
        {submittedAt && <div><dt>提交时间</dt><dd>{changeTime(submittedAt)}</dd></div>}
        {cc.length > 0 && change.status !== 'draft' && <div className={styles.fullWidth}>
          <dt>抄送</dt>
          <dd><ul className={styles.copyList}>{cc.map(row => {
            const status = copyStatuses.get(`${row.userId}:${row.generation}`) ?? 'queued';
            return <li key={row.userId}><Typography.Text>{name(row.userId)}</Typography.Text>
              <Tag color={status === 'sent' ? 'success' : undefined}>{changeDeliveryStatuses[status] ?? status}</Tag>
            </li>;
          })}</ul></dd>
        </div>}
      </dl>
    </Card>
    {draft.materials.length > 0 && <Card size="small" title="工程申请物料">
      <ul className={styles.detailMaterials}>{draft.materials.map(row => <li key={row.id}>
        <Typography.Text strong>{row.code}</Typography.Text>
        <Typography.Text>{row.name}</Typography.Text>
        <Typography.Text type="secondary">{row.unit}</Typography.Text>
      </li>)}</ul>
    </Card>}
    {canAssess && <ChangeAssessmentPanel key={change.id} change={change} busy={busy} error={error} onSubmit={onAssess}
      onReturn={actions.includes('return') ? () => onAction('return') : undefined} />}
    {latest && <Card size="small" title={`PMC 评估与会签 · 已通过 ${latest.reviewers.filter(row => row.decision === 'approved').length}/${latest.reviewers.length}`}>
      <ChangeRoundPanel round={latest} changeId={change.id} people={people} />
    </Card>}
    {change.records.length > 0 && <ChangeScrapRecords detail={detail} />}
    {pastRounds}
  </Space>
    <ChangeFlow detail={detail} viewDeliveries={viewDeliveries} onReminded={onReminded} />
    {availableActions.length > 0 && <footer className={styles.detailFooter} aria-label="单据办理">
      {availableActions.map(action => <Button key={action}
        type={['approve', 'confirm', 'record', 'recordAndVerify'].includes(action) ? 'primary' : 'default'}
        danger={action === 'withdraw'} disabled={busy} onClick={() => onAction(action)}>{changeAction[action]}</Button>)}
    </footer>}
  </div>;
}
