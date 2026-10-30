import {useContext} from 'react';
import {TabPageContext} from '../lib/tabPageContext';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Spin } from 'antd';
import styles from './ProductDrawings.module.css';

export function ProductPrintPreview({ blob, onClose }: { blob: Blob | null; onClose: () => void }) {
  const tabContext=useContext(TabPageContext);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    if (!blob || !frame.current?.contentWindow) return;
    const target = frame.current.contentWindow, controller = new AbortController();
    void import('../lib/productPdf').then(async ({ renderProductPrint }) => {
      if (!controller.signal.aborted) await renderProductPrint(blob, target, controller.signal);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '打印预览生成失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [blob]);
  return <Modal getContainer={tabContext?.container||false} title="受控图纸打印预览" open width="90vw" onCancel={onClose} footer={null} destroyOnHidden>
    {error && <Alert type="error" message={error} />}
    <Spin spinning={loading} tip="正在准备受控打印文件…"><iframe ref={frame} title="受控图纸打印页面" className={styles.printFrame} /></Spin>
  </Modal>;
}
