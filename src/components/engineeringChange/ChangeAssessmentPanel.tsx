import { useState } from 'react';
import { Alert, Button, Card, Form, Popover } from 'antd';
import { assessmentSubmission, changeAction, initialAssessment } from '../../lib/engineeringChange';
import type { ChangeAssessmentValues, EngineeringChange } from '../../types/engineeringChange';
import { ChangeAssessmentForm } from './ChangeAssessmentForm';
import styles from './EngineeringChange.module.css';

interface Props {
  change: EngineeringChange;
  busy: boolean;
  error: string;
  onSubmit: (values: object, version: number) => void;
  onReturn?: () => void;
}

export function ChangeAssessmentPanel({ change, busy, error, onSubmit, onReturn }: Props) {
  const [form] = Form.useForm<ChangeAssessmentValues>();
  const [reviewedVersion, setReviewedVersion] = useState(change.version);
  const changed = reviewedVersion !== change.version;

  const help = <ul className={styles.assessmentHelp}>
    <li>已入库半成品包含在仓库实存中，请勿重复累计。</li>
    <li>金蝶库存是仓库汇总量，有批次时填写该批实际核对数。</li>
    <li>差异重审时，拟报废量为累计批准量，包含已执行数量。</li>
  </ul>;
  return <Card size="small" title="PMC 评估" extra={<Popover content={help} trigger="click">
    <Button size="small" type="link">填写说明</Button>
  </Popover>}>
    <Form<ChangeAssessmentValues> form={form} layout="vertical" initialValues={initialAssessment(change)} disabled={busy}
      scrollToFirstError={{ focus: true }}
      onFinish={() => { if (!busy && !changed) onSubmit(assessmentSubmission(form.getFieldsValue(true)), reviewedVersion); }}>
      <ChangeAssessmentForm change={change} form={form} />
      {changed && <Alert className={styles.formError} type="warning" showIcon
        title="单据已更新，请核对最新申请及已填写的评估"
        action={<Button size="small" onClick={() => setReviewedVersion(change.version)}>已核对</Button>} />}
      {error && <Alert className={styles.formError} type="error" showIcon title={error} />}
      <div className={styles.formActions}>
        <Button type="primary" htmlType="submit" loading={busy} disabled={changed}>{changeAction.assess}</Button>
        {onReturn && <Button onClick={onReturn}>{changeAction.return}</Button>}
      </div>
    </Form>
  </Card>;
}
