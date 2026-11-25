import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Select, Space, Table, Typography } from 'antd';
import type { ReactNode } from 'react';
import { changeApi, changeTime, errorText } from '../../lib/engineeringChange';
import type { ChangeInventoryRow, ChangeMaterial } from '../../types/engineeringChange';
import styles from './EngineeringChange.module.css';

interface Reference {
  materialId: string;
  data: ChangeInventoryRow[];
  fetchedAt: string;
}

interface Props {
  changeId: string;
  materials: ChangeMaterial[];
  autoQuery?: boolean;
  renderApply?: (row: ChangeInventoryRow, reference: Reference) => ReactNode;
}

export function ChangeInventoryReference({ changeId, materials, autoQuery = false, renderApply }: Props) {
  const [picked, setPicked] = useState<string>();
  const [reference, setReference] = useState<Reference>();
  const [error, setError] = useState<{ materialId: string; message: string }>();
  const [busyMaterial, setBusyMaterial] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const materialId = materials.find(row => row.id === picked)?.id ??
    (autoQuery || materials.length === 1 ? materials[0]?.id : undefined);

  const query = useCallback(async () => {
    if (!materialId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusyMaterial(materialId);
    setError(undefined);
    setReference(undefined);
    try {
      const { data } = await changeApi.inventory(changeId, materialId, controller.signal);
      if (!controller.signal.aborted) setReference({ materialId, ...data });
    } catch (reason) {
      if (!controller.signal.aborted) setError({ materialId, message: errorText(reason) });
    } finally {
      if (request.current === controller) setBusyMaterial(undefined);
    }
  }, [changeId, materialId]);

  useEffect(() => {
    const timer = autoQuery ? window.setTimeout(() => void query(), 0) : undefined;
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [autoQuery, query]);

  return <Card size="small" title="金蝶库存参考" className={styles.stack}>
    <Space orientation="vertical" className={styles.stack}>
      <Space wrap>
        <Select className={styles.materialSelect} aria-label="查询物料" placeholder="选择物料" value={materialId}
          options={materials.map(row => ({ value: row.id, label: `${row.code} · ${row.name} · ${row.unit}` }))}
          onChange={id => {
            request.current?.abort();
            setPicked(id);
            setReference(undefined);
            setError(undefined);
          }} />
        <Button onClick={() => void query()} disabled={!materialId} loading={materialId === busyMaterial && Boolean(materialId)}>{autoQuery ? '刷新库存' : '查询金蝶库存'}</Button>
      </Space>
      {error && error.materialId === materialId && <Alert type="warning" showIcon title={error.message} />}
      {reference && reference.materialId === materialId && <>
        <Typography.Text type="secondary">查询时间 {changeTime(reference.fetchedAt)}</Typography.Text>
        <Table<ChangeInventoryRow> size="small" pagination={false} scroll={{ x: renderApply ? 540 : 420 }} dataSource={reference.data.map((row, key) => ({ ...row, key }))}
          locale={{ emptyText: '未返回库存行，请现场核对' }}
          columns={[
            { title: '仓库 / 库位', render: (_, row) => [row.warehouse, row.position].filter(Boolean).join(' / ') },
            { title: '实存量', dataIndex: 'stock' }, { title: '可用量', dataIndex: 'available' }, { title: '单位', dataIndex: 'unit' },
            ...(renderApply ? [{ title: '引用', render: (_: unknown, row: ChangeInventoryRow) => renderApply(row, reference) }] : []),
          ]} />
      </>}
    </Space>
  </Card>;
}
