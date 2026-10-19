import { useState } from "react";
import { Button, Drawer, Form, Input, Select, Tabs, Upload, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import { FEEDBACK_CATEGORY_LABELS } from "../../types/feedback";
import type { FeedbackInput } from "../../types/feedback";
import { FeedbackList } from "./FeedbackList";
import styles from "./Feedback.module.css";

interface FeedbackDrawerProps {
  open: boolean;
  onClose: () => void;
  pagePath: string;
  pageTitle: string;
}

function readScreenshot(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取截图失败，请重新选择"));
    reader.readAsDataURL(file);
  });
}

export function FeedbackDrawer({ open, onClose, pagePath, pageTitle }: FeedbackDrawerProps) {
  const user = useAuthStore(state => state.user);
  const [active, setActive] = useState("new");
  const [form] = Form.useForm<Pick<FeedbackInput, "category" | "description">>();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const submit = async (values: Pick<FeedbackInput, "category" | "description">) => {
    setSaving(true);
    try {
      const screenshots = await Promise.all(files.map(async file => {
        if (!file.originFileObj) throw new Error("截图读取失败，请重新选择");
        return { name: file.name.slice(0, 100), dataUrl: await readScreenshot(file.originFileObj) };
      }));
      await api.post("/api/feedback", { ...values, pagePath, pageTitle, screenshots });
      message.success("反馈已提交，可在“我的反馈”查看处理进度");
      form.resetFields(); setFiles([]); setReload(value => value + 1); setActive("mine");
    } catch (error) { message.error(error instanceof Error ? error.message : "提交失败"); }
    finally { setSaving(false); }
  };
  return <Drawer title="问题与建议" open={open} onClose={onClose} width={860}>
    <Tabs activeKey={active} onChange={setActive} items={[
      { key: "new", label: "提交反馈", children: <Form form={form} layout="vertical" initialValues={{ category: "data" }} onFinish={submit}>
        <div className={styles.context}>当前页面：{pageTitle} <span>{pagePath}</span></div>
        <Form.Item label="反馈类型" name="category" rules={[{ required: true }]}>
          <Select options={Object.entries(FEEDBACK_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item label="问题或建议" name="description" rules={[{ required: true, whitespace: true, message: "请填写问题或建议" }]}>
          <Input.TextArea placeholder="请说明发现的问题、操作步骤或改进建议" maxLength={2000} showCount autoSize={{ minRows: 5, maxRows: 12 }} />
        </Form.Item>
        <Form.Item label="截图（选填）" extra="最多3张，每张不超过2MB，支持 PNG、JPEG、WebP">
          <Upload accept="image/png,image/jpeg,image/webp" listType="picture" fileList={files} maxCount={3} disabled={saving}
            beforeUpload={file => {
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
                message.error("请选择2MB以内的 PNG、JPEG 或 WebP 图片"); return Upload.LIST_IGNORE;
              }
              return false;
            }} onChange={({ fileList }) => setFiles(fileList)}>
            <Button icon={<PlusOutlined />} disabled={files.length >= 3 || saving}>添加截图</Button>
          </Upload>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>提交反馈</Button>
      </Form> },
      { key: "mine", label: "我的反馈", children: open && active === "mine" ? <FeedbackList key={`mine-${reload}`} scope="mine" /> : null },
      ...(user?.role === "admin" ? [{ key: "all", label: "反馈管理", children: open && active === "all" ? <FeedbackList scope="all" /> : null }] : []),
    ]} />
  </Drawer>;
}
