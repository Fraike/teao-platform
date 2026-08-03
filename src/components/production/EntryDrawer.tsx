import { useState, useEffect } from "react";
import {
  Modal, Form, Select, Input, InputNumber, DatePicker, Divider,
  Button, Space, message, Descriptions, Row, Col, AutoComplete,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import type { ProductionRecord } from "../../types/production";
import { ASSEMBLY_LINES, PROCESS_FIELDS } from "../../types/production";

interface EntryDrawerProps {
  open: boolean;
  record: ProductionRecord | null;
  copyFrom: ProductionRecord | null;
  defaultDate: string;
  onClose: (saved: boolean) => void;
}

interface SelectOption {
  value: string;
  label: string;
  spec?: string;
}

interface FormValues {
  date: Dayjs;
  line: string;
  customer: string;
  spec: string;
  productName: string;
  materialBatch: string;
  workHours: number;
  productionBatch: string;
  orderQty: number;
  dailyQty: number;
  planQty: number;
  cumulativeQty: number;
  defects: number;
  oilInjection: string;
  rubberRing: string;
  capping: string;
  shaftCore: string;
  ultrasonic: string;
  testing: string;
  gear: string;
  filler: string;
  remark: string;
}

export function EntryDrawer({ open, record, copyFrom, defaultDate, onClose }: EntryDrawerProps) {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<SelectOption[]>([]);
  const [customers, setCustomers] = useState<SelectOption[]>([]);
  const [employees, setEmployees] = useState<SelectOption[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const isEdit = !!record;
  const isCopy = !record && !!copyFrom;

  useEffect(() => {
    if (!open) return;
    const resetTimer = window.setTimeout(() => setDataLoaded(false), 0);
    Promise.allSettled([
      api.get<{ ok: boolean; data: Array<{ name: string; spec?: string }> }>("/api/kingdee/materials?category=2314557705978701824"),
      api.get<{ ok: boolean; data: Array<{ name: string }> }>("/api/kingdee/customers"),
      api.get<Array<{ name: string }>>("/api/employees?status=active"),
    ]).then(([mRes, cRes, eRes]) => {
      if (mRes.status === "fulfilled" && mRes.value.ok)
        setMaterials(mRes.value.data.map((m) => ({ value: m.name, label: m.name, spec: m.spec || "" })));
      if (cRes.status === "fulfilled" && cRes.value.ok)
        setCustomers(cRes.value.data.map((c) => ({ value: c.name, label: c.name })));
      if (eRes.status === "fulfilled" && Array.isArray(eRes.value))
        setEmployees(eRes.value.map((e) => ({ value: e.name, label: e.name })));
      setDataLoaded(true);
    });
    return () => window.clearTimeout(resetTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fillRecord = record || copyFrom;
    const defaultFiller = currentUser?.name || currentUser?.username || "";
    if (fillRecord) {
      form.setFieldsValue({
        date: copyFrom ? dayjs() : dayjs(fillRecord.date),
        line: fillRecord.line,
        productName: fillRecord.productName,
        customer: fillRecord.customer,
        spec: fillRecord.spec || "",
        productionBatch: fillRecord.productionBatch || "",
        materialBatch: fillRecord.materialBatch || "",
        workHours: fillRecord.workHours || 10,
        orderQty: copyFrom ? 0 : (fillRecord.orderQty || 0),
        planQty: copyFrom ? 0 : (fillRecord.planQty || 0),
        dailyQty: copyFrom ? 0 : (fillRecord.dailyQty || 0),
        cumulativeQty: copyFrom ? 0 : (fillRecord.cumulativeQty || 0),
        defects: 0,
        oilInjection: fillRecord.oilInjection || "",
        rubberRing: fillRecord.rubberRing || "",
        capping: fillRecord.capping || "",
        shaftCore: fillRecord.shaftCore || "",
        ultrasonic: fillRecord.ultrasonic || "",
        testing: fillRecord.testing || "",
        gear: fillRecord.gear || "",
        filler: fillRecord.filler || defaultFiller,
        remark: fillRecord.remark || "",
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        date: defaultDate ? dayjs(defaultDate) : dayjs(),
        workHours: 10,
        filler: defaultFiller,
      } as Partial<FormValues>);
    }
  }, [open, record, copyFrom, defaultDate, form, currentUser]);

  const handleProductSelect = (value: string) => {
    const mat = materials.find((m) => m.value === value);
    if (mat?.spec) form.setFieldValue("spec", mat.spec);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const payload: Record<string, unknown> = {
        date: values.date.format("YYYY-MM-DD"),
        line: values.line,
        customer: values.customer,
        spec: values.spec || "",
        productName: values.productName,
        materialBatch: values.materialBatch || "",
        workHours: values.workHours ?? 0,
        productionBatch: values.productionBatch || "",
        orderQty: values.orderQty ?? 0,
        dailyQty: values.dailyQty ?? 0,
        planQty: values.planQty ?? 0,
        cumulativeQty: values.cumulativeQty ?? 0,
        defects: values.defects ?? 0,
        oilInjection: values.oilInjection || "",
        rubberRing: values.rubberRing || "",
        capping: values.capping || "",
        shaftCore: values.shaftCore || "",
        ultrasonic: values.ultrasonic || "",
        testing: values.testing || "",
        gear: values.gear || "",
        filler: values.filler || "",
        remark: values.remark || "",
      };
      if (isEdit) {
        await api.put(`/api/production/entries/${record!.id}`, payload);
        message.success("更新成功");
      } else {
        await api.post("/api/production/entries", payload);
        message.success("新增成功");
      }
      onClose(true);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      console.error("Save error:", err);
      message.error((err as Error).message || "保存失败");
    } finally {
      setLoading(false);
    }
  };

  const dailyQty = Form.useWatch("dailyQty", form) || 0;
  const planQty = Form.useWatch("planQty", form) || 0;
  const defects = Form.useWatch("defects", form) || 0;
  const cumulativeQty = Form.useWatch("cumulativeQty", form) || 0;
  const orderQty = Form.useWatch("orderQty", form) || 0;
  const achievementRate = planQty > 0 ? dailyQty / planQty : null;
  const qualifiedRate = dailyQty > 0 ? (dailyQty - defects) / dailyQty : null;
  const ppm = cumulativeQty > 0 ? Math.round((defects / cumulativeQty) * 1000000) : null;
  const backorder = orderQty - cumulativeQty;

  return (
    <Modal
      title={isEdit ? "编辑生产记录" : isCopy ? "复制生产记录（今日）" : "新增生产记录"}
      open={open}
      onCancel={() => onClose(false)}
      width={820}
      footer={
        <Space>
          <Button onClick={() => onClose(false)}>取消</Button>
          <Button type="primary" size="large" onClick={handleSubmit} loading={loading}>保存</Button>
        </Space>
      }
      destroyOnClose
    >
      <Form form={form} layout="vertical" size="middle" style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: 8 }}>
        {/* 基本信息 — 2列 */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="日期" name="date" rules={[{ required: true, message: "必填" }]}>
              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="产线" name="line" rules={[{ required: true, message: "必填" }]}>
              <AutoComplete
                placeholder="选择或输入产线号"
                options={ASSEMBLY_LINES.map((l) => ({ value: l, label: l }))}
                filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input?.toLowerCase() ?? "")}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="工作时间（小时）" name="workHours">
              <InputNumber style={{ width: "100%" }} min={0} max={24} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="品名" name="productName" rules={[{ required: true, message: "必填" }]}>
              <Select showSearch placeholder="搜索并选择商品（成品）"
                loading={!dataLoaded}
                filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                options={materials} onSelect={handleProductSelect} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="客户" name="customer" rules={[{ required: true, message: "必填" }]}>
              <Select showSearch placeholder="搜索并选择客户"
                loading={!dataLoaded}
                filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                options={customers} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="规格" name="spec">
              <Input disabled placeholder="选品名后自动带入" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="生产批号" name="productionBatch">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="原材料批号" name="materialBatch">
          <Input.TextArea rows={3} placeholder="可输入多行批号信息" />
        </Form.Item>

        <Divider style={{ margin: "12px 0" }}>生产数据</Divider>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="订单数量" name="orderQty">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="计划生产数量" name="planQty">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="当天生产数量 *" name="dailyQty" rules={[{ required: true, message: "必填" }]}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="累计生产数量" name="cumulativeQty">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="不良数" name="defects">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            {/* 计算预览 */}
            <div style={{ background: "#fafafa", borderRadius: 6, padding: "8px 12px", fontSize: 12, lineHeight: "22px" }}>
              <div>达成率: <b style={{ color: (achievementRate ?? 0) >= 1 ? "#52c41a" : "#ff4d4f" }}>{achievementRate != null ? `${(achievementRate * 100).toFixed(0)}%` : "-"}</b></div>
              <div>合格率: <b style={{ color: (qualifiedRate ?? 1) >= 0.95 ? "#52c41a" : "#ff4d4f" }}>{qualifiedRate != null ? `${(qualifiedRate * 100).toFixed(1)}%` : "-"}</b></div>
              <div>PPM: <b>{ppm != null ? ppm.toLocaleString() : "-"}</b> 欠数: <b style={{ color: backorder > 0 ? "#faad14" : "#333" }}>{backorder.toLocaleString()}</b></div>
            </div>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0" }}>工序人员</Divider>

        <Row gutter={[12, 0]}>
          {PROCESS_FIELDS.map(({ key, label }) => (
            <Col span={8} key={key}>
              <Form.Item label={label} name={key as keyof FormValues}>
                <Select mode="tags" showSearch placeholder={`选${label}`}
                  loading={!dataLoaded}
                  filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                  options={employees} maxTagCount={3} />
              </Form.Item>
            </Col>
          ))}
        </Row>

        <Divider style={{ margin: "12px 0" }}>其他</Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="填表人" name="filler">
              <Input disabled placeholder={currentUser?.name || currentUser?.username || ""} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="备注" name="remark">
              <Input.TextArea rows={2} placeholder="可选填" />
            </Form.Item>
          </Col>
        </Row>

        {isEdit && record && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="最后编辑">{record.updatedBy}，{dayjs(record.updatedAt).format("YYYY-MM-DD HH:mm")}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Form>
    </Modal>
  );
}
