import { useEffect, useRef } from 'react';
import { Card, Tag, Typography } from 'antd';
import { changeAction, changeDeliveryStatuses, changeTime, scrapRows } from '../../lib/engineeringChange';
import type { ChangeAction, ChangeDetail, ChangeReviewMode, ChangeRound } from '../../types/engineeringChange';
import { hasExecutedScrap } from '../../../server/shared/engineering-change-content.ts';
import { ChangeRemindButton } from './ChangeRemindButton';
import styles from './EngineeringChange.module.css';

type State = 'pending' | 'current' | 'done' | 'conditional' | 'skipped' | 'returned';
const labels: Record<State, string> = {
  pending: '未开始', current: '处理中', done: '已完成', conditional: '视评估结果', skipped: '无需处理', returned: '已退回',
};
const colors: Partial<Record<State, string>> = { current: 'processing', done: 'success', returned: 'warning' };

interface FlowNode {
  title: string;
  state: State;
  person?: string;
  at?: string;
  task?: string;
}

interface Preview {
  author?: string;
  pmc?: string;
  warehouse?: string;
  departments: { name: string; person?: string }[];
  mode: ChangeReviewMode;
}

function nodeList(nodes: FlowNode[], renderReminder?: (task: string) => React.ReactNode) {
  return <ol className={styles.flowNodes}>{nodes.map((node, index) => (
    <li key={index} className={styles.flowNode} data-state={node.state} data-current={node.state === 'current' || undefined}>
      <div className={styles.flowNodeHeading}>
        <strong>{node.title}</strong>
        <span className={styles.flowNodeActions}>
          <Tag color={colors[node.state]}>{labels[node.state]}</Tag>
          {node.state === 'current' && node.task && renderReminder?.(node.task)}
        </span>
      </div>
      {(node.person || node.at) && <small>{[node.person, node.at && changeTime(node.at)].filter(Boolean).join(' · ')}</small>}
    </li>
  ))}</ol>;
}

function reviewerNodes(round: ChangeRound, name: (id: string) => string, active: ReadonlySet<string>): FlowNode[] {
  return round.reviewers.map((row, index) => ({
    title: row.name,
    state: row.decision === 'approved' ? 'done' : row.decision === 'returned' ? 'returned' :
      active.has(`review:${index}`) ? 'current' : 'pending',
    person: name(row.userId), at: row.at, task: `review:${index}`,
  }));
}

function previewNodes(preview: Preview, returned: boolean): FlowNode[] {
  return [
    { title: returned ? '修改并重新提交' : '提交申请', state: 'current', person: preview.author, task: returned ? 'draft' : undefined },
    { title: 'PMC 评估', state: 'pending', person: preview.pmc },
    ...preview.departments.map(({ name, person }): FlowNode => ({ title: name, state: 'pending', person })),
    { title: '仓库登记及复核', state: 'conditional', person: preview.warehouse },
    { title: '结案', state: 'pending' },
  ];
}

function detailNodes(detail: ChangeDetail): FlowNode[] {
  const { change, tasks, people } = detail;
  const name = (id?: string) => id ? people[id] ?? id : undefined;
  const active = new Set(tasks.map(task => task.key));
  const { status, assignment, rounds, records, history } = change;
  const last = rounds.at(-1);
  const round = status === 'draft' || status === 'assessment' ? undefined : last;
  const record = records.findLast(item => !item.superseded);
  const confirmed = history.findLast(item => item.action === 'confirm');
  const combined = change.scrapMode === 'warehouse' ||
    (!change.scrapMode && !records.length && status !== 'scrap' && status !== 'verify');
  const scrapRequired = Boolean(hasExecutedScrap(change) || round?.lines.some(row => Number(row.scrap) > 0));
  const scrapState: State = active.has('scrap') ? 'current' : !round ? 'conditional'
    : !scrapRequired ? 'skipped' : record && !scrapRows(change).length ? 'done' : 'pending';
  const verifyState: State = active.has('verify') ? 'current'
    : status === 'closed' && (confirmed || (combined && scrapRequired)) ? 'done'
      : !round && record?.warehouseResult === 'difference' ? 'returned'
        : !round ? 'conditional' : !scrapRequired ? 'skipped' : 'pending';
  const submittedAt = change.submittedAt ?? history.find(row => row.action === 'submit')?.at;
  const latestSubmissionAction = history.findLast(row => ['submit', 'return', 'withdraw'].includes(row.action));
  const withdrawal = status === 'draft' && latestSubmissionAction?.action === 'withdraw' ? latestSubmissionAction : undefined;
  return [
    { title: '提交申请', state: submittedAt ? 'done' : status === 'discarded' ? 'skipped' : 'current',
      person: name(change.creator), at: submittedAt },
    ...(withdrawal ? [{ title: '撤回申请', state: 'done' as const, person: withdrawal.name || name(withdrawal.actor), at: withdrawal.at }] : []),
    ...(status === 'draft' && submittedAt ? [{ title: '修改并重新提交', state: 'current' as const, person: name(change.creator), task: 'draft' }] : []),
    { title: 'PMC 评估', state: status === 'assessment' ? 'current' : round ? 'done' : 'pending',
      person: name(assignment?.pmc), at: round?.at, task: 'assessment' },
    ...(round ? reviewerNodes(round, id => name(id)!, status === 'review' ? active : new Set()) :
      (assignment?.departments ?? []).map((row): FlowNode => ({ title: row.name, state: 'pending', person: name(row.userId) }))),
    ...(!combined ? [{ title: change.correction ? 'PMC 补正报废凭证' : 'PMC 报废登记', state: scrapState,
      person: name(scrapState === 'done' ? record?.userId : assignment?.pmc), at: scrapState === 'done' ? record?.at : undefined, task: 'scrap' }] : []),
    { title: combined ? '仓库登记及复核' : '仓库复核', state: verifyState,
      person: verifyState === 'done' || verifyState === 'returned' ? confirmed?.name ?? name(record?.userId) : name(assignment?.warehouse),
      at: verifyState === 'done' || verifyState === 'returned' ? confirmed?.at ?? record?.at : undefined, task: 'verify' },
    { title: status === 'discarded' ? '已放弃' : '结案', state: status === 'closed' || status === 'discarded' ? 'done' : 'pending',
      at: status === 'closed' || status === 'discarded' ? change.updatedAt : undefined },
  ];
}

export function ChangeFlow({ preview, detail, viewDeliveries, onReminded }: {
  preview?: Preview;
  detail?: ChangeDetail;
  viewDeliveries?: string;
  onReminded?: (detail: ChangeDetail) => void;
}) {
  const deliveryRecords = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!viewDeliveries || !deliveryRecords.current) return;
    deliveryRecords.current.open = true;
    deliveryRecords.current.scrollIntoView({ block: 'nearest' });
  }, [viewDeliveries]);
  const change = detail?.change;
  const mode = preview?.mode ?? change?.reviewMode ?? 'parallel';
  const submitted = Boolean(change?.submittedAt || change?.history.some(row => row.action === 'submit'));
  const nodes = preview ? previewNodes(preview, submitted) : detail ? detailNodes(detail) : [];
  const past = change?.status === 'assessment' || change?.status === 'draft' ? change.rounds : change?.rounds.slice(0, -1);
  const events = change?.history ?? [];
  const deliveries = detail?.deliveries ?? [];
  const fromSubmission = (row: ChangeDetail['deliveries'][number]) =>
    Boolean(viewDeliveries && row.generation === viewDeliveries && (row.event === 'submit' || row.event === 'cc'));
  const orderedDeliveries = viewDeliveries
    ? [...deliveries.filter(fromSubmission), ...deliveries.filter(row => !fromSubmission(row))]
    : deliveries;
  const name = (id: string) => detail?.people[id] ?? id;
  return <Card className={styles.flowCard} title="流程进度" size="small" extra={mode === 'parallel' ? '并行会签' : '顺序会签'}>
    {change?.rounds.length && change.status !== 'draft' && change.status !== 'assessment' ?
      <Typography.Text type="secondary">第 {change.rounds.at(-1)?.number} 轮</Typography.Text> : null}
    {nodeList(nodes, task => {
      const target = detail?.reminderTargets?.find(row => row.key === task);
      return change && target && <ChangeRemindButton key={target.generation} id={change.id} name={name(target.userId)}
        target={target} onReminded={onReminded} />;
    })}
    {past?.map(round => <details className={styles.flowHistory} key={round.number}>
      <summary>第 {round.number} 轮会签 · {changeTime(round.at)}</summary>
      {nodeList(reviewerNodes(round, name, new Set()))}
    </details>)}
    {change && <div className={styles.flowRecords}>
      <details className={styles.flowHistory}>
        <summary>操作记录</summary>
        {events.length ? <ul>{[...events].reverse().map((row, index) => <li key={index}>
          <strong>{changeAction[row.action as keyof typeof changeAction] ?? row.action}</strong>
          <small>{changeTime(row.at)} · {row.name}</small>
          {row.note && <div className={styles.contentText}>{row.note}</div>}
        </li>)}</ul> : <Typography.Text type="secondary">暂无操作记录</Typography.Text>}
      </details>
      <details className={styles.flowHistory} ref={deliveryRecords}>
        <summary>企微投递记录</summary>
        {deliveries.length ? <ul>{orderedDeliveries.map((row, index) => <li key={index}>
          <strong>{changeDeliveryStatuses[row.status] ?? row.status}</strong>
          <small>{changeTime(row.at)} · {name(row.userId)}</small>
          <div>{fromSubmission(row) && <Tag color="processing">本次提交</Tag>}{row.event === 'cc' ? '抄送' : row.event === 'remind' ? '手动催办' : changeAction[row.event as ChangeAction] ?? row.event}</div>
        </li>)}</ul> : <Typography.Text type="secondary">暂无企微投递记录</Typography.Text>}
      </details>
    </div>}
  </Card>;
}
