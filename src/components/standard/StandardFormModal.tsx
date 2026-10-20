import { groupStandardFields, activeStandardFields } from "../../lib/standardFieldGroups";
import { useAuthStore } from "../../lib/authStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Input, Select, Radio, Space, Button, Modal, message } from "antd";
import { api } from "../../lib/api";
import type {
  StandardCategory,
  StandardDetail,
  StandardFields,
  StandardType,
  StandardVersion,
  StandardReviewResponse,
} from "../../types/standard";
import { STANDARD_TYPE_LABELS } from "../../types/standard";
import styles from "./StandardFormModal.module.css";

interface StandardFormModalProps {
  open: boolean;
  categories: StandardCategory[];
  initial: StandardDetail | null;
  copySource?: StandardDetail | null;
  defaultCategoryKey?: string;
  onClose: () => void;
  directPublish?: boolean;
  onSaved: (detail: StandardDetail) => void;
}

interface FormValues {
  serialNo: string;
  categoryKey: string;
  standardType: StandardType;
  customer: string;
  vehicleModel: string;
  model: string;
  customerPartNo: string;
  fields: StandardFields;
}

function pickSource(initial: StandardDetail | null): StandardVersion | null {
  if (!initial) return null;
  return (
    initial.versions.find((v) => v.status === "draft" || v.status === "pending_review") ||
    initial.versions.find((v) => v.status === "published") ||
    initial.versions[0] ||
    null
  );
}

export function StandardFormModal({
  open,
  categories,
  initial,
  copySource,
  defaultCategoryKey,
  onClose,
  onSaved,
  directPublish: publishOverride,
}: StandardFormModalProps) {
  const administrator = useAuthStore(state => state.user?.role === "admin");
  const directPublish = publishOverride ?? administrator;
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const initializedSession = useRef<string | null>(null);
  const categoryDirty = useRef(false);
  const categoryKey = Form.useWatch("categoryKey", form);
  const isEdit = Boolean(initial);
  const isCopy = Boolean(copySource) && !isEdit;

  const activeCategory = useMemo(
    () => categories.find((c) => c.key === categoryKey),
    [categories, categoryKey]
  );

  useEffect(() => {
    if (!open) {
      initializedSession.current = null;
      return;
    }
    const source = pickSource(initial ?? copySource ?? null);
    const sessionKey = JSON.stringify([isEdit ? "edit" : isCopy ? "copy" : "new", (initial ?? copySource)?.id, source?.id]);
    if (initializedSession.current === sessionKey) {
      // 分类首次异步到达时仅填空的、未被用户修改的分类。
      if (!categoryDirty.current && !form.getFieldValue("categoryKey")) {
        form.setFieldsValue({ categoryKey: defaultCategoryKey ?? categories[0]?.key ?? "" });
      }
      return;
    }
    initializedSession.current = sessionKey;
    categoryDirty.current = false;
    const serialNo =
      isCopy && source?.serialNo ? `${source.serialNo}-副本` : (source?.serialNo ?? "");
    form.resetFields();
    form.setFieldsValue({
      serialNo,
      categoryKey: source?.categoryKey ?? defaultCategoryKey ?? categories[0]?.key ?? "",
      standardType: source?.standardType ?? "formal",
      customer: source?.customer ?? "",
      vehicleModel: source?.vehicleModel ?? "",
      model: source?.model ?? "",
      customerPartNo: source?.customerPartNo ?? "",
      fields: source?.fields ?? {},
    });
  }, [open, initial, copySource, isEdit, isCopy, defaultCategoryKey, categories, form]);

  const displayedFields = activeStandardFields(activeCategory, pickSource(initial ?? copySource ?? null)?.fields);

  const handleSubmit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const source = pickSource(initial ?? copySource ?? null);
    const existingFields = source?.categoryKey === values.categoryKey ? source.fields : {};
    setSaving(true);
    try {
      const payload = {
        serialNo: values.serialNo.trim(),
        customer: values.customer?.trim() ?? "",
        vehicleModel: values.vehicleModel?.trim() ?? "",
        model: values.model?.trim() ?? "",
        customerPartNo: values.customerPartNo?.trim() ?? "",
        categoryKey: values.categoryKey,
        standardType: values.standardType,
        fields: { ...existingFields, ...Object.fromEntries(displayedFields.map(field => [field.key, values.fields?.[field.key] ?? ""])) },
        ...(isEdit ? { versionId: pickSource(initial)?.id, revision: pickSource(initial)?.revision } : {}),
      };
      const result = isEdit
        ? await api.put<StandardReviewResponse>(`/api/standards/${initial!.id}`, payload)
        : await api.post<StandardReviewResponse>("/api/standards", payload);
      message.success(result.data.versions[0]?.status === "published" ? "已保存并发布" : isEdit ? "已保存草稿" : "已新增标准草稿");
      if (result.notification && result.notification.status !== "sent") message.warning(result.notification.status === "not_configured"
        ? "标准已生效，未配置企业微信群；公告已留存，可在详情中补发"
        : "标准已生效，请在详情中核查群公告送达状态，勿重复保存来补发");
      onSaved(result.data);
    } catch (err) {
      message.error((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit
    ? `编辑产品标准${activeCategory ? ` · ${activeCategory.name}` : ""}`
    : isCopy
      ? `复制新增产品标准${activeCategory ? ` · ${activeCategory.name}` : ""}`
      : `新增产品标准${activeCategory ? ` · ${activeCategory.name}` : ""}`;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      width={640}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {directPublish ? "保存并发布" : "保存草稿"}
          </Button>
        </Space>
      }
    >
      <div className={styles.body}>
        {directPublish && pickSource(initial)?.status === "pending_review" && <p>此标准正在待审，保存后将直接发布并结束本次待审流程，操作记录保留。</p>}
        <Form form={form} layout="vertical" onValuesChange={(changed: Partial<FormValues>) => {
          if (Object.hasOwn(changed, "categoryKey")) categoryDirty.current = true;
        }}>
          <Form.Item
            name="serialNo"
            label="序号（内部料号）"
            rules={[{ required: true, message: "请输入序号" }]}
          >
            <Input placeholder="如 SP0009-A" disabled={isEdit} />
          </Form.Item>

          <Form.Item name="categoryKey" label="产品分类" rules={[{ required: true, message: "请选择分类" }]}>
            <Select
              options={categories.map((c) => ({ value: c.key, label: c.name }))}
              disabled={isEdit}
            />
          </Form.Item>

          <Form.Item name="standardType" label="拟发布性质" rules={[{ required: true }]}>
            <Radio.Group>
              {Object.entries(STANDARD_TYPE_LABELS).map(([value, label]) => (
                <Radio key={value} value={value}>
                  {value === "formal" ? "常规" : value === "temporary" ? "临时" : label}
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>

          <Form.Item name="customer" label="客户名" rules={[{ required: true, whitespace: true, message: "请输入客户名" }]}>
            <Input placeholder="客户名称" />
          </Form.Item>

          <Form.Item name="vehicleModel" label="项目代号" hidden={categoryKey === "sanitary_damper"}>
            <Input placeholder="如 URE、VF12（没有可留空）" />
          </Form.Item>

          <Form.Item name="model" label="产品型号" rules={[{ required: true, whitespace: true, message: "请输入产品型号" }]}>
            <Input placeholder="型号" />
          </Form.Item>

          <Form.Item name="customerPartNo" label="客户料号" hidden={categoryKey === "sanitary_damper"}>
            <Input placeholder="客户料号" />
          </Form.Item>

          {groupStandardFields(displayedFields).map(group => (
            <section key={group.name} className={styles.fieldGroup} aria-label={group.name || "规格参数"}>
              {group.name && <h4 className={styles.groupTitle}>{group.name}</h4>}
              {group.fields.map(field => <Form.Item key={field.key} name={["fields", field.key]} label={field.key === "winter_test_standard" ? `${field.label}（选填）` : field.label} extra={field.key === "gear_spec" ? "每行填写一种齿轮规格，按回车换行" : undefined} rules={field.key === "part_type" ? [{required:true,message:"请选择盖或座"}] : undefined}>
                {field.key === "part_type" ? <Select options={[{label:"盖",value:"盖"},{label:"座",value:"座"}]} placeholder="请选择盖或座" /> : <Input.TextArea autoSize={{ minRows: field.key === "gear_spec" ? 3 : 1, maxRows: field.key === "gear_spec" ? 8 : 4 }} placeholder={field.label} />}
              </Form.Item>)}
            </section>
          ))}
        </Form>
      </div>
    </Modal>
  );
}
