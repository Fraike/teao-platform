import { useEffect, useState } from 'react';
import { Alert, Select, Tag } from 'antd';
import { changeApi, errorText } from '../../lib/engineeringChange';
import type { ChangeMaterial } from '../../types/engineeringChange';
import styles from './EngineeringChange.module.css';

interface Props {
  id?: string;
  label?: string;
  value?: ChangeMaterial[];
  onChange?: (value: ChangeMaterial[]) => void;
  assessmentId?: string;
}

export function ChangeMaterialSelect({ value = [], onChange, assessmentId, id, label = '关联物料' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChangeMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      void changeApi.materials(query.trim(), controller.signal, assessmentId).then(({ data }) => {
        if (!controller.signal.aborted) setResults(data);
      }).catch(reason => {
        if (!controller.signal.aborted) setError(errorText(reason));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, assessmentId]);
  const options = new Map([...value, ...results].map(item => [item.id, item]));
  return <>
    {error && <Alert type="warning" showIcon title={error} />}
    <Select id={id} aria-label={label} className={styles.materialPicker} mode="multiple" virtual={false} showSearch={{ filterOption: false, onSearch: term => {
      setResults([]); setLoading(false); setError(''); setQuery(term);
    } }} placeholder="搜索产品名称或内部料号" loading={loading}
      notFoundContent={loading ? '搜索中…' : query.trim() ? '未找到匹配的物料' : '可搜索成品和半成品'}
      optionRender={option => <span className={styles.materialResult}>{option.label}</span>}
      value={value.map(row => row.id)} options={[...options.values()].map(row => ({
        value: row.id,
        label: <span className={styles.materialOption}>
          <strong>{row.code}</strong><span className={styles.materialName}>{row.name}</span>
          {row.defaultWarehouse && <Tag className={styles.materialWarehouse}
            color={row.defaultWarehouse === '成品仓' ? 'blue' : 'purple'}>{row.defaultWarehouse}</Tag>}
        </span>,
      }))} onChange={ids => onChange?.(ids.flatMap(id => options.get(id) ?? []))} />
  </>;
}
