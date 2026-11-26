import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useAuthStore } from '../../lib/authStore';
import { allocationLabel, changeAction, changeApi, encodeChangeAttachment, errorText, scrapRows } from '../../lib/engineeringChange';
import type { ChangePerson } from '../../lib/engineeringChange';
import type { ChangeAction, ChangeDetail } from '../../types/engineeringChange';
import { hasExecutedScrap, roundAffectedMaterials } from '../../../server/shared/engineering-change-content.ts';
import { ChangeInventoryReference } from './ChangeInventoryReference';
import { ChangeEvidenceInput } from './ChangeEvidenceInput';
import styles from './EngineeringChange.module.css';

interface Props {
  action: ChangeAction;
  detail: ChangeDetail;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: object) => void;
}

export function ChangeActionDialog({ action, detail, busy, error, onClose, onSubmit }: Props) {
  const [form] = Form.useForm();
  const [users, setUsers] = useState<ChangePerson[]>([]);
  const [settingsError, setSettingsError] = useState('');
  const [encodingError, setEncodingError] = useState('');
  const [encoding, setEncoding] = useState(false);
  const { change } = detail;
  const combined = action === 'recordAndVerify';
  const recording = action === 'record' || combined;
  const rows = recording ? scrapRows(change) : [];
  const round = change.rounds.at(-1);
  const materials = round ? roundAffectedMaterials(round) : [];
  const draftLines = Form.useWatch<{ quantity: string }[]>('lines', form);
  const quantities = rows.map((_, index) => draftLines?.[index]?.quantity?.trim() ?? '');
  const hasDifference = combined && quantities.every(isScrapQuantity) &&
    rows.some((row, index) => Math.round(Number(quantities[index]) * 1_000_000) !== Math.round(row.remaining * 1_000_000));
  const legacyProof = action === 'confirm' && hasExecutedScrap(change);
  const needsEvidence = legacyProof || (combined && quantities.some(value => isScrapQuantity(value) && Number(value) > 0));
  const saving = busy || encoding;

  async function finish(values: { lines?: { quantity: string }[]; verificationPhoto?: File; kingdeeScrapEvidence?: File }) {
    if (saving) return;
    const { verificationPhoto, kingdeeScrapEvidence, ...fields } = values;
    const requiresFiles = legacyProof || (combined && values.lines?.some(row => Number(row.quantity) > 0));
    if (!requiresFiles) { onSubmit(fields); return; }
    if (!verificationPhoto || !kingdeeScrapEvidence) {
      form.setFields([
        ...(!verificationPhoto ? [{ name: 'verificationPhoto', errors: ['请上传报废现场照片'] }] : []),
        ...(!kingdeeScrapEvidence ? [{ name: 'kingdeeScrapEvidence', errors: ['请上传金蝶报废记录'] }] : []),
      ]);
      return;
    }
    setEncodingError('');
    setEncoding(true);
    try {
      const [photo, record] = await Promise.all([encodeChangeAttachment(verificationPhoto), encodeChangeAttachment(kingdeeScrapEvidence)]);
      onSubmit({ ...fields, verificationPhoto: photo, kingdeeScrapEvidence: record });
    } catch (reason) { setEncodingError(errorText(reason)); }
    finally { setEncoding(false); }
  }
  const userId = useAuthStore(state => state.user?.id);
  const reviewTasks = (action === 'approve' || action === 'return') && change.status === 'review'
    ? detail.tasks.filter(row => row.userId === userId && row.key.startsWith('review:')) : [];
  useEffect(() => {
    if (action !== 'reassign') return;
    let active = true;
    void changeApi.settings().then(({ data }) => { if (active) setUsers(data.users); })
      .catch(reason => { if (active) setSettingsError(errorText(reason)); });
    return () => { active = false; };
  }, [action]);

  const initial = recording
    ? { lines: rows.map(row => ({ line: row.index, quantity: '' })), evidence: change.correction ? change.records.at(-1)?.evidence : '' }
    : action === 'return' ? { target: change.status === 'assessment' ? 'engineering' : 'pmc' } : {};
  const needsNote = hasDifference || ['return', 'difference', 'correct', 'reassign'].includes(action);
  const okText = action === 'approve' ? '确认通过' : combined ? '提交报废' : changeAction[action];

  return <Modal open title={changeAction[action]} width={recording || legacyProof ? 900 : 600}
    okText={okText} cancelText="取消" onCancel={onClose} onOk={() => form.submit()}
    confirmLoading={saving} closable={!saving} mask={{ closable: !saving }} cancelButtonProps={{ disabled: saving }}>
    {(error || settingsError || encodingError) && <Alert type="error" showIcon title={error || settingsError || encodingError} />}
    <Form form={form} layout="vertical" initialValues={initial} onFinish={values => void finish(values)} disabled={saving}>
      {reviewTasks.length > 1 && <Form.Item name="task" label="本次处理的会签部门" rules={[{ required: true }]}>
        <Select options={reviewTasks.map(row => ({ value: row.key, label: row.title }))} placeholder="选择会签部门" />
      </Form.Item>}
      {action === 'approve' && <Typography.Paragraph>确认通过本次会签？</Typography.Paragraph>}
      {recording && <>
        {action === 'record' && <ChangeInventoryReference changeId={change.id}
          materials={materials.filter(material => rows.some(row => row.materialId === material.id))} />}
        {rows.map((row, index) => <div key={row.index}>
          <Form.Item name={['lines', index, 'line']} hidden><Input /></Form.Item>
          <Form.Item name={['lines', index, 'quantity']}
            label={`${allocationLabel(row, materials)}（剩余待报废 ${row.remaining}）`}
            rules={[
              { required: true, message: '请填写实际数量，未执行填 0' },
              { validator: async (_, value?: string) => {
                if (value && !isScrapQuantity(value.trim())) throw new Error('数量须为非负数字，最多六位小数');
              } },
            ]}>
            <Input inputMode="decimal" placeholder="本次实际报废数量" />
          </Form.Item>
        </div>)}
        {action === 'record' && <Form.Item name="evidence" label="报废凭证编号或文件引用" rules={[{ required: true }]}>
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>}
      </>}
      {action === 'return' && change.status === 'review' && <Form.Item name="target" label="退回给">
        <Select options={[
          { label: 'PMC 修正评估', value: 'pmc' },
          { label: '工程修改申请', value: 'engineering', disabled: change.records.length > 0 },
        ]} />
      </Form.Item>}
      {action === 'reassign' && <>
        <Form.Item name="task" label="需改派的处理人" rules={[{ required: true }]}>
          <Select options={detail.reassignments.map(row => ({
            value: row.key, label: `${row.title} · ${detail.people[row.userId] ?? row.userId}`,
          }))} />
        </Form.Item>
        <Form.Item name="userId" label="新处理人" rules={[{ required: true }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={users.map(row => ({
            value: row.id, label: `${row.name}${!row.canAccess ? '（未开通工程变更）' : row.bound ? '' : '（未绑定企微）'}`, disabled: !row.canAccess,
          }))} />
        </Form.Item>
      </>}
      {action === 'discard' && <Alert type="warning" showIcon title="放弃后不能继续编辑，本单原有审批和操作记录会保留。" />}
      {action === 'withdraw' && <Alert type="warning" showIcon title="确认撤回这笔申请？"
        description="撤回后单据回到草稿，当前 PMC 待办将取消。你可以修改后重新提交，也可以放弃草稿。" />}
      {action === 'confirm' && <Alert type="info" showIcon title="请核对报废凭证、实际数量和适用批次。确认后结案。" />}
      {(legacyProof || combined) && <div className={styles.evidenceGrid}>
        <ChangeEvidenceInput name="verificationPhoto" label="报废现场照片" required={needsEvidence} photoOnly />
        <ChangeEvidenceInput name="kingdeeScrapEvidence" label="金蝶报废记录" required={needsEvidence} />
      </div>}
      {needsNote && <Form.Item name="note" preserve={false}
        label={hasDifference || action === 'difference' ? '数量差异原因' : action === 'return' ? '退回原因' : '原因'}
        extra={hasDifference ? '提交后退回 PMC 重新评估，本次实际数量和凭证会保留。' : undefined}
        rules={[{ required: true, whitespace: true }]}>
        <Input.TextArea rows={3} maxLength={2000} />
      </Form.Item>}
    </Form>
  </Modal>;
}

function isScrapQuantity(value: string) {
  return /^\d{1,8}(\.\d{1,6})?$/.test(value);
}
