import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Select, Space, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CloseOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { changeApi, encodeChangeAttachment, errorText } from '../../lib/engineeringChange';
import { applicationContent, draftCcUserIds } from '../../../server/shared/engineering-change-content.ts';
import type { ChangeDraft, ChangeDraftOptions, ChangeDraftTransfer, ChangeDetail } from '../../types/engineeringChange';
import { ChangeFlow } from './ChangeFlow';
import { ChangeMaterialSelect } from './ChangeMaterialSelect';
import styles from './EngineeringChange.module.css';

interface Props {
  title: string;
  titleExtra?: ReactNode;
  error?: string;
  pastRounds?: ReactNode;
  onDiscard?: () => void;
  viewDeliveries?: string;
  onReminded?: (detail: ChangeDetail) => void;
  changeId?: string;
  creatorId: string;
  previousDepartments?: string[];
  detail?: ChangeDetail;
  draft: ChangeDraft;
  busy: boolean;
  onSave: (draft: ChangeDraft, submit: boolean, transfer: ChangeDraftTransfer) => void;
}

export function ChangeDraftForm({ changeId, creatorId, previousDepartments, detail, draft, busy, onSave, title, titleExtra, error, pastRounds, onDiscard, onReminded, viewDeliveries }: Props) {
  const [form] = Form.useForm<ChangeDraft>();
  const routing = Form.useWatch('routing', form);
  const chosen = routing?.departments ?? draft.routing?.departments ?? previousDepartments ?? [];
  const [activeDepartment, setActiveDepartment] = useState('');
  const activeIndex = Math.max(0, chosen.indexOf(activeDepartment));
  const [files, setFiles] = useState<UploadFile[]>((draft.attachments ?? []).map(file => ({
    uid: file.id, name: file.name, size: file.size, type: file.mime, status: 'done',
  })));
  const [options, setOptions] = useState<ChangeDraftOptions>();
  const [peopleError, setPeopleError] = useState('');
  const [fileError, setFileError] = useState('');
  const [encoding, setEncoding] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void changeApi.draftOptions(changeId, controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      setOptions(data);
      if (!form.getFieldValue(['routing', 'pmc'])) form.setFieldValue(['routing', 'pmc'], data.defaults.pmc || undefined);
      if (!form.getFieldValue(['routing', 'warehouse'])) form.setFieldValue(['routing', 'warehouse'], data.defaults.warehouse || undefined);
    }).catch(reason => { if (!controller.signal.aborted) setPeopleError(errorText(reason)); });
    return () => controller.abort();
  }, [changeId, form]);

  async function save(values: ChangeDraft, submit: boolean) {
    setFileError('');
    setEncoding(true);
    try {
      const uploads = files.flatMap(file => file.originFileObj ?? []);
      const attachmentIds = files.filter(file => !file.originFileObj).map(file => file.uid);
      onSave(values, submit, { attachmentIds, uploads: await Promise.all(uploads.map(encodeChangeAttachment)) });
    } catch (reason) { setFileError(errorText(reason)); }
    finally { setEncoding(false); }
  }

  const disabled = busy || encoding;
  const people = options?.people ?? [];
  const personOptions = people.map(person => ({
    value: person.id, label: person.canAccess ? person.name : `${person.name}（未开通工程变更）`, disabled: !person.canAccess,
  }));
  const names = new Map(people.map(person => [person.id, person.name]));
  const departments = (options?.departments ?? []).map(row => ({
    value: row.name,
    label: [row.name, row.userId ? names.get(row.userId) : undefined, row.unavailableReason].filter(Boolean).join(' · '),
    disabled: Boolean(row.unavailableReason) || !row.userId,
  }));
  function moveDepartment(index: number, next: number) {
    const ordered = [...chosen];
    setActiveDepartment(ordered[index]);
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    form.setFieldValue(['routing', 'departments'], ordered);
  }

  const approvers = new Map(options?.departments.map(row => [row.name, row.userId]));
  const mode = detail?.change.reviewMode ?? (detail?.change.assignment ? 'parallel' : 'sequential');
  return <div className={styles.flowLayout}>
    <Space orientation="vertical" size="middle" className={styles.stack}>
    <Card title={title} extra={titleExtra} classNames={{ header: styles.applicationHeader, title: styles.applicationTitle, body: styles.draftBody }}>
    {error && <Alert className={styles.formError} type="error" showIcon title={error} />}
    <Form<ChangeDraft> form={form} layout="vertical" initialValues={{
    ...draft, content: applicationContent(draft), ccUserIds: draftCcUserIds(draft),
    routing: draft.routing ?? { departments: previousDepartments ?? [] },
  }}
    disabled={disabled} onFinish={values => void save(values, true)}>
    <Form.Item name="title" label="申请事项" rules={[{ required: true, whitespace: true, message: '请填写申请事项' }]}>
      <Input maxLength={120} />
    </Form.Item>
    <Form.Item name="content" label="申请内容" extra="可写明变更原因、变更前后及计划生效条件。"
      rules={[{ required: true, whitespace: true, message: '请填写申请内容' }]}>
      <Input.TextArea rows={5} maxLength={10000} />
    </Form.Item>
    <section className={styles.optionalSection} aria-labelledby="change-routing-title">
      <Typography.Title level={5} id="change-routing-title" className={styles.optionalTitle}>本单审批流程</Typography.Title>
      {peopleError && <Alert type="warning" title={peopleError} />}
      {options && !departments.some(row => !row.disabled) && <Alert type="warning" title="暂无可选会签部门，请联系管理员维护部门主管" />}
      <Form.Item name={['routing', 'departments']} label="会签部门" extra={mode === 'parallel' ? '本单沿用并行会签。' : 'PMC 评估后，按下方顺序审批。'}
        rules={[{ type: 'array', required: true, min: 1, message: '请至少选择一个会签部门' }]}>
        <Select mode="multiple" allowClear options={departments} loading={!options && !peopleError}
          showSearch={{ optionFilterProp: 'label' }} placeholder="选择本单需要会签的部门"
          tagRender={mode === 'parallel' ? undefined : ({ value, closable, onClose, disabled: tagDisabled }) => {
            const index = chosen.indexOf(value);
            const active = index === activeIndex;
            return <Tag className={styles.departmentChip} data-selected={active || undefined}
              onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
              }}>
              <button type="button" className={styles.chipButton} aria-pressed={active}
                disabled={disabled || tagDisabled} onClick={event => { event.stopPropagation(); setActiveDepartment(value); }}>
                {index >= 0 && <span className={styles.chipIndex}>{index + 1}</span>}
                <span className={styles.chipName} title={String(value)}>{value}</span>
              </button>
              {closable && !disabled && !tagDisabled && <button type="button" className={styles.chipRemove}
                aria-label={`移除 ${value}`} onClick={event => { event.stopPropagation(); onClose(event); }}>
                <CloseOutlined />
              </button>}
            </Tag>;
          }} />
      </Form.Item>
      {chosen.length > 1 && mode === 'sequential' && <div className={styles.orderActions}>
        <Typography.Text type="secondary">调整 {chosen[activeIndex]} 的顺序</Typography.Text>
        <Space.Compact>
          <Button size="small" icon={<ArrowLeftOutlined />} title="前移" aria-label={`前移 ${chosen[activeIndex]}`}
            disabled={disabled || activeIndex === 0} onClick={() => moveDepartment(activeIndex, activeIndex - 1)} />
          <Button size="small" icon={<ArrowRightOutlined />} title="后移" aria-label={`后移 ${chosen[activeIndex]}`}
            disabled={disabled || activeIndex === chosen.length - 1} onClick={() => moveDepartment(activeIndex, activeIndex + 1)} />
        </Space.Compact>
      </div>}
      <div className={styles.formGrid}>
        <Form.Item name={['routing', 'pmc']} label="PMC 处理人" rules={[{ required: true, message: '请选择 PMC 处理人' }]}>
          <Select options={personOptions} showSearch={{ optionFilterProp: 'label' }} placeholder="选择评估和报废登记人" />
        </Form.Item>
        <Form.Item name={['routing', 'warehouse']} label="仓库复核人" rules={[{ required: true, message: '请选择仓库复核人' }]}>
          <Select options={personOptions} showSearch={{ optionFilterProp: 'label' }} placeholder="选择报废复核人" />
        </Form.Item>
      </div>
    </section>
    <section className={styles.optionalSection} aria-labelledby="change-optional-title">
      <Typography.Title level={5} id="change-optional-title" className={styles.optionalTitle}>补充信息（选填）</Typography.Title>
      <Form.Item label="附件" extra="支持 JPG、PNG、WebP、PDF，最多 6 个，合计 8 MB。">
        {fileError && <Alert type="error" title={fileError} />}
        <Upload multiple accept="image/jpeg,image/png,image/webp,application/pdf" fileList={files}
          beforeUpload={(file, batch) => {
            if (files.length + batch.length > 6 || [...files, ...batch].reduce((sum, item) => sum + (item.size ?? 0), 0) > 8 * 1024 * 1024) {
              setFileError('附件最多 6 个，合计 8 MB');
              return Upload.LIST_IGNORE;
            }
            if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
              setFileError('请上传 JPG、PNG、WebP 或 PDF 文件');
              return Upload.LIST_IGNORE;
            }
            setFileError('');
            return false;
          }}
          onChange={({ fileList }) => setFiles(fileList)} showUploadList={{ showPreviewIcon: false }}>
          <Button disabled={disabled}>添加附件</Button>
        </Upload>
      </Form.Item>
      <Form.Item name="materials" label="工程申请物料"><ChangeMaterialSelect label="工程申请物料" /></Form.Item>
      <Form.Item name="ccUserIds" label="抄送人员">
        <Select mode="multiple" allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="搜索姓名，可选择多人"
          options={personOptions.filter(person => person.value !== creatorId)} />
      </Form.Item>
    </section>
    <div className={styles.formActions}>
      {onDiscard && <Button type="text" danger className={styles.discardButton} disabled={disabled} onClick={onDiscard}>放弃草稿</Button>}
      <Button onClick={() => void save(form.getFieldsValue(), false)} loading={disabled}>保存草稿</Button>
      <Button type="primary" htmlType="submit" loading={disabled}>提交 PMC 评估</Button>
    </div>
    </Form>
    </Card>
    {pastRounds}
    </Space>
    <ChangeFlow detail={detail} viewDeliveries={viewDeliveries} onReminded={onReminded} preview={{ mode, author: names.get(creatorId), pmc: names.get(routing?.pmc ?? ''),
      warehouse: names.get(routing?.warehouse ?? ''), departments: chosen.map(name => ({
        name, person: names.get(approvers.get(name) ?? ''),
      })) }} />
  </div>;
}
