import { useEffect, useState } from "react";
import { Form, Input, InputNumber, Modal, Select, Typography } from "antd";
import { api } from "../lib/api";
import type { ScheduleOrder, ScheduleRow } from "../types/assemblyScheduling";

export interface InstructionRowInput {
  id: string;
  date: string;
  qty: number;
  note?: string;
  mode: "add" | "edit";
}

export function AssemblyInstructionRowEditor({date,row,existingIds,close,save}:{
  date:string;
  row?:ScheduleRow;
  existingIds:string[];
  close:()=>void;
  save:(input:InstructionRowInput)=>Promise<void>;
}) {
  const [form] = Form.useForm<{qty:number | null;note?:string}>();
  const [selected,setSelected] = useState(row?.order);
  const [query,setQuery] = useState("");
  const [choices,setChoices] = useState<ScheduleOrder[]>([]);
  const [total,setTotal] = useState(0);
  const [loading,setLoading] = useState(!row);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");

  useEffect(()=>{
    if (row) return;
    const controller = new AbortController();
    const timer = window.setTimeout(()=>{
      setLoading(true);
      void api.get<{rows:ScheduleOrder[];total:number}>(`/api/assembly-scheduling/ledger?kind=candidates&q=${encodeURIComponent(query)}`,{signal:controller.signal})
        .then(result=>{ if (!controller.signal.aborted) {setChoices(result.rows);setTotal(result.total);setError("");} })
        .catch(error=>{if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "读取订单失败");})
        .finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    },250);
    return ()=>{controller.abort();window.clearTimeout(timer);};
  },[query,row]);

  async function submit() {
    if (!selected || saving) return;
    const value = await form.validateFields().catch(()=>null);
    if (value?.qty == null) return;
    setError("");
    setSaving(true);
    try {await save({id:selected.id,date,qty:value.qty,note:value.note?.trim(),mode:row ? "edit" : "add"});}
    catch (error) {setError(error instanceof Error ? error.message : "保存失败");}
    finally {setSaving(false);}
  }

  return <Modal open width={640} title={row ? "编辑出货行" : "新增出货行"} onCancel={close}
    onOk={()=>void submit()} okText="保存到草案" cancelText="取消" confirmLoading={saving}
    okButtonProps={{disabled:!selected}} cancelButtonProps={{disabled:saving}} closable={!saving} mask={{closable:!saving}}>
    <Form form={form} layout="vertical" initialValues={{qty:row && row.demand>0 ? row.demand : row?.order.qty ?? null,note:row?.note}}>
      <Form.Item label="出货日期"><Typography.Text>{date}</Typography.Text></Form.Item>
      {!row && <Form.Item label="销售订单商品行" required extra={total>50 ? "最多显示 50 个匹配项，可用单号、客户或料号进一步缩小范围。" : undefined}>
        <Select aria-label="销售订单商品行" showSearch filterOption={false} loading={loading}
          placeholder="搜索订单号、客户、型号或料号" value={selected?.id} onSearch={setQuery}
          options={choices.map(order=>({value:order.id,disabled:existingIds.includes(order.id),
            label:[order.orderNo,order.customer,order.code,order.product,order.spec,existingIds.includes(order.id) ? "已在当天指令单" : ""].filter(Boolean).join(" · ")}))}
          onChange={id=>{
            const order = choices.find(item=>item.id===id);
            setSelected(order);
            form.setFieldValue("qty",order?.qty ?? null);
          }} />
      </Form.Item>}
      {selected && <Form.Item label="关联订单">
        <Typography.Text>{[selected.orderNo,selected.customer,selected.code,selected.product].filter(Boolean).join(" · ")}</Typography.Text>
        <br />
        <Typography.Text type="secondary">订单交期 {selected.due || "—"} · 未交 {selected.qty ?? "待核实"} {selected.unit}</Typography.Text>
      </Form.Item>}
      <Form.Item name="qty" label={`出货数量${selected?.unit ? `（${selected.unit}）` : ""}`}
        rules={[{required:true,message:"请填写出货数量"},{type:"number",min:1,message:"出货数量至少为 1"}]}>
        <InputNumber min={1} precision={0} />
      </Form.Item>
      <Form.Item name="note" label="备注"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
      {error && <Typography.Text type="danger" role="alert">{error}</Typography.Text>}
    </Form>
  </Modal>;
}
