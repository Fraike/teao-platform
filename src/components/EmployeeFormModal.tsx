import { useEffect, useState } from "react";
import {
  Modal, Form, Input, Select, DatePicker, Radio, Button, message,
  Row, Col, Divider,
} from "antd";
import dayjs from "dayjs";
import { api } from "../lib/api";
import type { Employee } from "../types/employee";

interface EmployeeFormModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DEPARTMENT_OPTIONS = [
  "装配部", "注塑部", "品质部", "生管部", "工程部",
  "行政部", "业务部", "财务部", "总经办",
];

const EDUCATION_OPTIONS = ["小学", "初中", "职高", "中专", "高中", "大专", "本科", "硕士"];

function parseIdCard(idCard: string): { birthDate: string; gender: "男" | "女" } | null {
  const cleaned = idCard.trim();
  if (cleaned.length === 18 && /^\d{17}[\dXx]$/.test(cleaned)) {
    const birth = `${cleaned.slice(6, 10)}-${cleaned.slice(10, 12)}-${cleaned.slice(12, 14)}`;
    const genderNum = parseInt(cleaned.charAt(16));
    return { birthDate: birth, gender: genderNum % 2 === 1 ? "男" : "女" };
  }
  if (cleaned.length === 15 && /^\d{15}$/.test(cleaned)) {
    const birth = `19${cleaned.slice(6, 8)}-${cleaned.slice(8, 10)}-${cleaned.slice(10, 12)}`;
    const genderNum = parseInt(cleaned.charAt(14));
    return { birthDate: birth, gender: genderNum % 2 === 1 ? "男" : "女" };
  }
  return null;
}

export function EmployeeFormModal({
  open, employee, onClose, onSuccess,
}: EmployeeFormModalProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!employee;

  useEffect(() => {
    if (open) {
      if (employee) {
        form.setFieldsValue({
          ...employee,
          entryDate: employee.entryDate ? dayjs(employee.entryDate) : null,
          birthDate: employee.birthDate ? dayjs(employee.birthDate) : null,
          contractStartDate: employee.contractStartDate ? dayjs(employee.contractStartDate) : null,
          contractEndDate: employee.contractEndDate ? dayjs(employee.contractEndDate) : null,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, employee, form]);

  const handleIdCardBlur = () => {
    const idCard: string = form.getFieldValue("idCard") || "";
    if (!idCard) return;
    const parsed = parseIdCard(idCard);
    if (parsed) {
      form.setFieldsValue({
        birthDate: dayjs(parsed.birthDate),
        gender: parsed.gender,
      });
      message.success("已自动解析出生日期和性别");
    }
  };

  const onFinish = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const data = {
        ...values,
        birthDate: values.birthDate
          ? (values.birthDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
        entryDate: values.entryDate
          ? (values.entryDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
        contractStartDate: values.contractStartDate
          ? (values.contractStartDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
        contractEndDate: values.contractEndDate
          ? (values.contractEndDate as dayjs.Dayjs).format("YYYY-MM-DD")
          : "",
      };

      if (isEdit) {
        await api.put(`/api/employees/${employee!.id}`, data);
        message.success("员工信息已更新");
      } else {
        await api.post("/api/employees", data);
        message.success("员工已添加");
      }
      onSuccess();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? "编辑员工" : "新增员工"}
      open={open}
      onCancel={onClose}
      width={720}
      footer={null}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          gender: "男",
          education: "初中",
          dormitory: false,
          signedContract: true,
          contractType: "劳动合同",
        }}
      >
        <Divider plain>基本信息</Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: "必填" }]}>
              <Input placeholder="请输入姓名" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="employeeNo" label="工号">
              <Input placeholder="如 TA-004" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
              <Radio.Group>
                <Radio value="男">男</Radio>
                <Radio value="女">女</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="department" label="部门" rules={[{ required: true, message: "必填" }]}>
              <Select placeholder="选择部门" options={DEPARTMENT_OPTIONS.map((d) => ({ label: d, value: d }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="position" label="职位" rules={[{ required: true, message: "必填" }]}>
              <Input placeholder="如 主管、员工" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="phone" label="手机号" rules={[
              { required: true, message: "必填" },
              { pattern: /^1[3-9]\d{9}$/, message: "请输入正确的11位手机号" },
            ]}>
              <Input placeholder="请输入手机号" maxLength={11} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="idCard" label="身份证号">
              <Input placeholder="输入后自动解析生日性别" onBlur={handleIdCardBlur} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="birthDate" label="出生日期">
              <DatePicker style={{ width: "100%" }} placeholder="自动解析或手动选择" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="entryDate" label="入职日期" rules={[{ required: true, message: "必填" }]}>
              <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="education" label="学历">
              <Select options={EDUCATION_OPTIONS.map((d) => ({ label: d, value: d }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="dormitory" label="是否住宿">
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="remark" label="备注">
              <Input placeholder="备注信息" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="address" label="家庭地址">
              <Input placeholder="请输入地址" />
            </Form.Item>
          </Col>
        </Row>

        <Divider plain>合同信息</Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="contractType" label="合同类型">
              <Select options={[
                { label: "劳动合同", value: "劳动合同" },
                { label: "劳务合同", value: "劳务合同" },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="signedContract" label="是否签署合同">
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="idCardExpiry" label="身份证有效期限">
              <Input placeholder="如 长期 或 2038/2/9" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="contractStartDate" label="合同起始时间" rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const endDate = getFieldValue("contractEndDate");
                  if (value && endDate && (value as dayjs.Dayjs).isAfter(endDate as dayjs.Dayjs)) {
                    return Promise.reject(new Error("起始时间不能晚于结束时间"));
                  }
                  return Promise.resolve();
                },
              }),
            ]}>
              <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="contractEndDate" label="合同结束时间" rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("contractStartDate");
                  if (value && startDate && (value as dayjs.Dayjs).isBefore(startDate as dayjs.Dayjs)) {
                    return Promise.reject(new Error("结束时间不能早于起始时间"));
                  }
                  return Promise.resolve();
                },
              }),
            ]}>
              <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ textAlign: "right", marginTop: 16 }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "保存" : "添加"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
