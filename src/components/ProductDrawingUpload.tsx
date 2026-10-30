import {useContext} from 'react';
import {TabPageContext} from '../lib/tabPageContext';
import {useTabBusy,useTabDirty,useTabForm} from '../lib/tabPageContext';
import {productPdfResources} from '../lib/productPdfResources';
import {DRAWING_NUMBER_PATTERN} from '../../server/shared/product-drawing-input';
import {identifyProductSeries} from '../lib/productSeries';
import {usesGearDrawingStructure} from '../lib/productDrawingPresentation';
import { useEffect, useRef, useState } from 'react';
import {inspectProductPdf} from '../lib/productPdfValidation';
import { Alert, Form, Input, Modal, Select, message } from 'antd';
import type { DrawingUploadProps, ProductDrawingInput } from '../types/product';
import { uploadProductFile } from '../lib/productFiles';
import styles from './ProductDrawings.module.css';

export function ProductDrawingUpload({ product, open, onClose, onSaved }: DrawingUploadProps) {
  const tabContext=useContext(TabPageContext);
  const [form] = Form.useForm<ProductDrawingInput>();
  const series = identifyProductSeries(product);
  const showStructure=usesGearDrawingStructure(product);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking,setChecking]=useState(false),[fileError,setFileError]=useState('');
  const [pageCount,setPageCount]=useState(0);
  const [dirty,setDirty]=useState(false);
  useTabBusy(saving||checking);
  useTabDirty(dirty||Boolean(file));
  useTabForm(form,`drawingUpload:${product.id}`,{dirty:dirty||Boolean(file)});
  function close(){if(saving)return;if(dirty||file){Modal.confirm({title:'放弃未保存的图纸？',onOk:onClose});}else onClose();}
  const inspection=useRef<AbortController|null>(null);
  useEffect(()=>()=>inspection.current?.abort(),[]);
  async function chooseFile(selected:File|null) {
    inspection.current?.abort();
    const controller=new AbortController();inspection.current=controller;
    setFile(null);setFileError('');setPageCount(0);setChecking(Boolean(selected));
    if(!selected)return;
    try {
      const pages=await inspectProductPdf(selected,controller.signal);
      if(!controller.signal.aborted){setPageCount(pages);setFile(selected);}
    }catch(error){if(!controller.signal.aborted)setFileError(error instanceof Error?error.message:'PDF校验失败');}
    finally{if(!controller.signal.aborted)setChecking(false);}
  }
  async function upload() {
    const values = await form.validateFields().catch(()=>null);
    if(!values||checking||saving)return;
    if (!file) { message.warning('请选择文件'); return; }
    if (file.size > 25 * 1024 * 1024) { message.warning('文件不能超过25MiB'); return; }
    setSaving(true);
    try {
      await uploadProductFile(product.id, { ...values, structure:showStructure?values.structure:'unspecified', kind:'pdf', standardIds: values.standardIds || [], filename: file.name }, file);
      productPdfResources.clear(); setDirty(false); message.success('图纸已上传并发布'); form.resetFields(); setFile(null); onSaved(); onClose();
    } catch (error) { message.error(error instanceof Error ? error.message : '上传失败'); }
    finally { setSaving(false); }
  }
  return <Modal getContainer={tabContext?.container||false} title="上传工程资料" open={open} onCancel={close} onOk={() => void upload()} confirmLoading={saving||checking} okButtonProps={{disabled:!file||checking}} okText="确认上传并发布" destroyOnHidden>
    <Alert type="info" showIcon message={`确认上传后直接发布，无需审核或再次点击发布，产线即可使用。${showStructure?'相同图号、范围和结构的新版本会替换旧版本；不同结构可以同时保留。':'请确认图号、版本和适用范围，上传后核对默认图纸。'}`} className={styles.notice} />
    <Form onValuesChange={()=>setDirty(true)} form={form} layout="vertical" initialValues={{ kind: 'pdf', standardIds: [],role:'primary',structure:showStructure?'geared':'unspecified',version:'A1',drawingNo:series.pending?'':`RD-${series.name}` }}>
      <Alert type="warning" showIcon className={styles.notice} message="仅支持横向PDF，每一页都必须横向。请在导出前确认主要文字正向；页面尺寸校验不识别文字是否倒置。" />
      <Form.Item name="role" label="图纸主次"><Select options={[{value:'primary',label:'主图'},{value:'supplement',label:'补充图'}]} /></Form.Item>
      {showStructure&&<Form.Item name="structure" label="图纸结构"><Select options={[{value:'geared',label:'有齿轮'},{value:'gearless',label:'无齿轮'},{value:'unspecified',label:'未区分结构'}]} /></Form.Item>}
      <Form.Item name="drawingNo" label="图号" rules={[{ required: true }, { pattern: DRAWING_NUMBER_PATTERN, message: '支持中文、字母、数字、空格、括号、点、下划线和短横线' }]}><Input placeholder="例如 RD-T008，可追加说明文字" maxLength={100} /></Form.Item>
      <Form.Item name="version" label="版本" rules={[{ required: true }, { pattern: /^[A-Za-z0-9_.-]{1,40}$/, message: '使用字母、数字、点、下划线或短横线' }]}><Input placeholder="例如 A1、A2" maxLength={40} /></Form.Item>
      <Form.Item name="standardIds" label="适用客户标准（不选即通用）"><Select mode="multiple" allowClear optionFilterProp="label" options={product.standards.map(s => ({ value: s.id, label: `${s.customer} · ${s.customerPartNo || s.model} · 标准V${s.versionNo}` }))} /></Form.Item>
      <div className={styles.fileInput}><label htmlFor="drawing-file">选择文件（最大25MiB）</label><input id="drawing-file" type="file" disabled={saving} onChange={event => void chooseFile(event.target.files?.[0] || null)} accept=".pdf,application/pdf" /></div>
      {checking && <Alert type="info" message="正在逐页检查PDF方向…" />}
      {fileError && <Alert type="error" showIcon message={fileError} />}
      {file && <Alert type="success" message={`${file.name}：${pageCount} 页，已通过横向校验`} />}
    </Form>
  </Modal>;
}
