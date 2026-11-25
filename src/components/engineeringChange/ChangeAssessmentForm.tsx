import { App, Button, Card, Checkbox, DatePicker, Form, Input, Select, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { blankAllocation, changeTime } from '../../lib/engineeringChange';
import type { ChangeAssessmentLine, ChangeInventoryRow, ChangeMaterial, EngineeringChange } from '../../types/engineeringChange';
import { allocationKey, changeDispositions, hasExecutedScrap, materialDefaultWarehouse, quantitySources, scrapExecution, warehouseScopes, workInProgressScope } from '../../../server/shared/engineering-change-content.ts';
import { ChangeInventoryReference } from './ChangeInventoryReference';
import { ChangeMaterialSelect } from './ChangeMaterialSelect';
import styles from './EngineeringChange.module.css';

interface Props {
  change: EngineeringChange;
  form: FormInstance;
}

const selectOptions = (choices: readonly string[]) => choices.map(value => ({ value, label: value }));


export function ChangeAssessmentForm({ change, form }: Props) {
  const { message } = App.useApp();
  const lines = Form.useWatch<ChangeAssessmentLine[]>('lines', { form, preserve: true }) ?? [];
  const materials = Form.useWatch<ChangeMaterial[]>('materials', form) ?? [];
  const noImpact = Form.useWatch<boolean>('noImpact', form);
  const executed = scrapExecution(change, lines).filter(row => Number(row.line.quantity) > 0);
  const lockedLocations = new Set(executed.map(row => row.key));
  const lockedScopes = new Set(executed.filter(row => row.savedScope).map(row => row.key));
  const lockedMaterials = new Set(executed.map(row => row.line.allocation.materialId));
  const options = materials.map(row => ({ value: row.id, label: `${row.code} · ${row.name}` }));

  function syncMaterials(selection: ChangeMaterial[]) {
    const missing = materials.filter(row => lockedMaterials.has(row.id) && !selection.some(item => item.id === row.id));
    const next = [...selection, ...missing];
    if (missing.length) void message.warning('已报废的物料须保留在评估范围内');
    const retained = lines.filter(line => next.some(material => material.id === line.materialId));
    form.setFieldsValue({ materials: next, lines: [...retained, ...next.filter(row => !retained.some(line => line.materialId === row.id))
      .map(row => blankAllocation(row.id))] });
  }

  function clearReference(index: number, clearSource: boolean) {
    const row = form.getFieldValue(['lines', index]) as ChangeAssessmentLine | undefined;
    if (!row?.checkedAt) {
      if (!clearSource && row?.source) form.setFieldValue(['lines', index, 'source'], '');
      return;
    }
    form.setFieldValue(['lines', index], {
      ...row, warehouse: row.originalWarehouse ?? '', checkedAt: undefined, source: '',
      sourceKind: clearSource ? undefined : row.sourceKind,
    });
  }

  function referenceMatches(allocation: ChangeAssessmentLine, row: ChangeInventoryRow, materialId: string) {
    const material = materials.find(item => item.id === materialId);
    const warehouse = [row.warehouse, row.position].filter(Boolean).join(' / ');
    const knownScope = materialDefaultWarehouse(row.warehouse) ?? (row.warehouse.trim() === '原料仓' ? '原材料仓' : undefined);
    return allocation.materialId === materialId && Boolean(allocation.warehouseScope) && allocation.warehouseScope !== workInProgressScope &&
      (!knownScope || knownScope === allocation.warehouseScope) &&
      !allocation.batch.trim() && material?.unit === row.unit &&
      Number(row.stock) >= 0 && (!lockedLocations.has(allocationKey(allocation)) || allocation.warehouse === warehouse);
  }

  function applyReference(index: number, row: ChangeInventoryRow, reference: { materialId: string; fetchedAt: string }) {
    const allocation = form.getFieldValue(['lines', index]) as ChangeAssessmentLine | undefined;
    if (!allocation || !referenceMatches(allocation, row, reference.materialId)) return;
    form.setFieldValue(['lines', index], {
      ...allocation, warehouse: [row.warehouse, row.position].filter(Boolean).join(' / '),
      stock: row.stock, sourceKind: '金蝶即时库存', source: '仓库汇总', checkedAt: reference.fetchedAt,
    });
  }

  return <Space orientation="vertical" className={styles.stack}>
    {!hasExecutedScrap(change) && <Form.Item name="noImpact" valuePropName="checked">
      <Checkbox>无受影响的库存及在制品</Checkbox>
    </Form.Item>}
    {!noImpact && <>
      <Form.Item name="materials" label="受影响物料" className={styles.stack}
        rules={[{ type: 'array', required: true, message: '请选择受影响物料' }]}
        extra={change.draft.materials.length > 0 && <Button type="link" size="small" className={styles.assessmentImport}
          disabled={change.draft.materials.every(row => materials.some(item => item.id === row.id))}
          onClick={() => syncMaterials([...materials, ...change.draft.materials.filter(row => !materials.some(item => item.id === row.id))])}>
          带入工程申请物料
        </Button>}>
        <ChangeMaterialSelect assessmentId={change.id} label="受影响物料" onChange={syncMaterials} />
      </Form.Item>
      {materials.length > 0 && <>
        <ChangeInventoryReference changeId={change.id} materials={materials} autoQuery renderApply={(row, reference) => {
          const targets = lines.flatMap((line, index) => referenceMatches(line, row, reference.materialId)
            ? [{ value: index, label: `明细 ${index + 1}` }] : []);
          return <Select<number> aria-label="引用到明细" placeholder="引用到明细" className={styles.referenceSelect} value={undefined}
            disabled={!targets.length} options={targets} onChange={index => applyReference(index, row, reference)} />;
        }} />
        <Form.List name="lines" rules={[{ validator: async (_, rows: ChangeAssessmentLine[] | undefined) => {
          if (!rows?.length) throw new Error('请至少填写一项处置明细');
        } }]}>
          {(fields, { add, remove }, { errors }) => <>
            <Space orientation="vertical" className={styles.stack}>
              {fields.map((field, index) => {
                const line = lines[index];
                const locked = Boolean(line && lockedLocations.has(allocationKey(line)));
                const inProgress = line?.warehouseScope === workInProgressScope;
                const materialReadOnly = materials.length === 1 || locked;
                const material = options.find(option => option.value === line?.materialId);
                return <Card size="small" title={`处置明细 ${index + 1}`} key={field.key}
                  extra={locked ? '已报废 · 位置和批次已锁定' : <Button type="link" danger onClick={() => remove(field.name)}>移除此行</Button>}>
                  <div className={styles.formGrid}>
                    {materialReadOnly ? <>
                      <Form.Item name={[field.name, 'materialId']} hidden><Input type="hidden" /></Form.Item>
                      <Form.Item label="物料"><Typography.Text>{material?.label}</Typography.Text></Form.Item>
                    </> : <Form.Item name={[field.name, 'materialId']} label="物料" rules={[{ required: true }]}>
                      <Select options={options} onChange={value => form.setFieldValue(['lines', index], { ...blankAllocation(value), warehouseScope: line?.warehouseScope })} />
                    </Form.Item>}
                    <Form.Item name={[field.name, 'warehouseScope']} label="仓库／工单范围" rules={[{ required: true }]}>
                      <Select options={selectOptions(warehouseScopes)} placeholder="选择范围"
                        disabled={Boolean(line && lockedScopes.has(allocationKey(line)))}
                        onChange={value => {
                          if (line?.warehouseScope && line.warehouseScope !== value) {
                            form.setFieldValue(['lines', index], { ...blankAllocation(line.materialId), warehouseScope: value, batch: line.batch });
                          }
                        }} />
                    </Form.Item>
                    {inProgress ? <Form.Item key="wip" name={[field.name, 'wip']} label="在制数量" rules={[{ required: true }]}>
                      <Input inputMode="decimal" />
                    </Form.Item> : <Form.Item key="stock" name={[field.name, 'stock']} label="库存数量" rules={[{ required: true }]}>
                      <Input inputMode="decimal" onChange={() => clearReference(index, true)} />
                    </Form.Item>}
                    <Form.Item name={[field.name, 'sourceKind']} label="数量来源" rules={[{ required: true }]}
                      extra={line?.checkedAt && `查询时间 ${changeTime(line.checkedAt)}`}>
                      <Select options={selectOptions(quantitySources)} placeholder="选择实际来源" onChange={() => clearReference(index, false)} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'disposition']} label="剩余物料处置"
                      extra={line?.disposition && !changeDispositions.includes(line.disposition) ? `上次填报：${line.disposition}` : undefined}
                      getValueProps={(value?: string) => ({ value: value && changeDispositions.includes(value) ? value : undefined })}
                      rules={[{ required: true, type: 'enum', enum: [...changeDispositions], message: '请选择剩余物料处置' }]}>
                      <Select placeholder="选择处置方式" options={selectOptions(changeDispositions)} />
                    </Form.Item>
                    <div className={styles.scrapToggle}>
                      <Form.Item name={[field.name, 'needsScrap']} valuePropName="checked">
                        <Checkbox disabled={locked}>需要报废</Checkbox>
                      </Form.Item>
                    </div>
                    {line?.needsScrap && <Form.Item name={[field.name, 'scrap']} label="拟报废数量"
                      rules={[{ required: true }, { validator: async (_, value?: string) => {
                        if (value && !(Number(value) > 0)) throw new Error('拟报废数量须大于 0');
                      } }]}>
                      <Input inputMode="decimal" />
                    </Form.Item>}
                  </div>
                  <details className={styles.assessmentExtras}>
                    <summary>补充明细{line?.batch ? ` · 批次 ${line.batch}` : ''}</summary>
                    {line?.warehouse && line.warehouse !== line.warehouseScope &&
                      <Typography.Text type="secondary">{line.warehouse}</Typography.Text>}
                    <div className={styles.formGrid}>
                      <Form.Item name={[field.name, 'batch']} label="批次">
                        <Input maxLength={120} placeholder="每行填写一个批次" disabled={locked}
                          onChange={event => { if (event.target.value.trim()) clearReference(index, true); }} />
                      </Form.Item>
                      {line?.legacyMixed && (inProgress
                        ? <Form.Item key="stock" name={[field.name, 'stock']} label="库存数量" rules={[{ required: true }]}>
                          <Input inputMode="decimal" />
                        </Form.Item>
                        : <Form.Item key="wip" name={[field.name, 'wip']} label="在制数量" rules={[{ required: true }]}>
                          <Input inputMode="decimal" />
                        </Form.Item>)}
                    </div>
                  </details>
                </Card>;
              })}
              <Button icon={<PlusOutlined />} onClick={() => add(blankAllocation(materials[0].id))}>新增处置明细</Button>
            </Space>
            <Form.ErrorList errors={errors} />
          </>}
        </Form.List>
        {lines.some(line => !line.checkedAt) && <div onKeyDown={event => {
          if (event.key === 'Enter') event.preventDefault();
        }}>
          <Form.Item name="manualCheckedAt" label="数量核对时间"
            rules={[{ required: true, message: '请选择手填明细的核对时间' }]}
            getValueProps={(value?: string) => ({ value: value ? dayjs(value) : null })}
            normalize={(value: Dayjs | null) => value?.toISOString()}>
            <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
        </div>}
      </>}
    </>}
    <Form.Item name="note" label={noImpact ? '无影响说明' : '评估说明 / 无需报废原因'}
      rules={noImpact ? [{ required: true, whitespace: true }] : undefined}>
      <Input.TextArea rows={2} maxLength={2000} />
    </Form.Item>
  </Space>;
}
