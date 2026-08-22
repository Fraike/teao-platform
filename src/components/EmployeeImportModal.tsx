import { useState } from "react";
import { Alert, Button, Modal, Popconfirm, Space, Table, Tag, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import { api } from "../lib/api";
import { parseEmployeeImportRows, type EmployeeImportPreview, type EmployeeImportRecord } from "../lib/employeeImport";
import styles from "./EmployeeImportModal.module.css";

interface EmployeeImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const { Dragger } = Upload;

const columns: ColumnsType<EmployeeImportRecord> = [
  { title: "Excel 行", dataIndex: "rowNumber", width: 76 },
  { title: "姓名", dataIndex: "name", width: 88 },
  { title: "工号", dataIndex: "employeeNo", width: 96 },
  { title: "部门", dataIndex: "department", width: 88, render: (value: string) => <Tag>{value}</Tag> },
  { title: "职位", dataIndex: "position", width: 100 },
  { title: "手机号", dataIndex: "phone", width: 124 },
  { title: "入职日期", dataIndex: "entryDate", width: 108 },
  { title: "合同", dataIndex: "signedContract", width: 78, render: (value: boolean) => value ? "已签" : "未签" },
];

function getFileExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf(".")).toLowerCase();
}

export function EmployeeImportModal({ open, onClose, onSuccess }: EmployeeImportModalProps) {
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPreview(null);
    setFilename("");
  };

  const close = () => {
    if (parsing || submitting) return;
    reset();
    onClose();
  };

  const parseFile = async (file: File) => {
    const extension = getFileExtension(file.name);
    if (extension !== ".xlsx" && extension !== ".xls") {
      message.error("仅支持 Excel 文件（.xlsx 或 .xls）");
      return;
    }
    setParsing(true);
    try {
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(await file.arrayBuffer(), { type: "array" });
      const preferredSheet = workbook.SheetNames.includes("入厂日期") ? "入厂日期" : workbook.SheetNames[0];
      const sheet = preferredSheet ? workbook.Sheets[preferredSheet] : undefined;
      if (!sheet) throw new Error("未找到可读取的工作表");
      const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
      const nextPreview = parseEmployeeImportRows(rows);
      setFilename(file.name);
      setPreview(nextPreview);
      if (nextPreview.errors.length > 0) message.warning(`发现 ${nextPreview.errors.length} 个阻断问题，请修正后再导入`);
    } catch (error) {
      setPreview(null);
      message.error(error instanceof Error ? error.message : "Excel 解析失败");
    } finally {
      setParsing(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls",
    multiple: false,
    showUploadList: false,
    beforeUpload: (file) => {
      void parseFile(file);
      return false;
    },
  };

  const submit = async () => {
    if (!preview || preview.errors.length > 0) return;
    setSubmitting(true);
    try {
      const result = await api.post<{ ok: boolean; data: { count: number } }>("/api/employees/import", { records: preview.records });
      message.success(`已覆盖导入 ${result.data.count} 名在职员工`);
      reset();
      onSuccess();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="导入在职员工清单"
      open={open}
      onCancel={close}
      width={1080}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close} disabled={parsing || submitting}>取消</Button>
          <Popconfirm
            title="确认覆盖当前全部员工资料？"
            description="系统会先保留一份备份，再写入本次清单。"
            okText="确认覆盖"
            cancelText="返回检查"
            onConfirm={submit}
            disabled={!preview || preview.errors.length > 0 || submitting}
          >
            <Button type="primary" loading={submitting} disabled={!preview || preview.errors.length > 0}>
              确认覆盖导入{preview ? `（${preview.records.length} 人）` : ""}
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Dragger {...uploadProps} className={styles.dropzone} disabled={parsing || submitting}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">拖入或选择 Excel 在职人员清单</p>
        <p className="ant-upload-hint">优先读取“入厂日期”工作表。系统将先解析、校验并预览，确认后才会覆盖旧数据。</p>
      </Dragger>

      {preview && (
        <div className={styles.result}>
          <Alert
            type={preview.errors.length > 0 ? "error" : preview.warnings.length > 0 ? "warning" : "success"}
            showIcon
            message={`${filename}：识别 ${preview.records.length} 名员工，${preview.errors.length} 个错误，${preview.warnings.length} 个提示`}
          />

          {preview.errors.length > 0 && (
            <Alert className={styles.issueList} type="error" showIcon message="以下问题必须修正后才能导入" description={<ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>} />
          )}
          {preview.warnings.length > 0 && (
            <Alert className={styles.issueList} type="warning" showIcon message="以下内容将按提示规则导入" description={<ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>} />
          )}

          <Table<EmployeeImportRecord>
            className={styles.previewTable}
            columns={columns}
            dataSource={preview.records}
            rowKey={(record) => `${record.rowNumber}-${record.employeeNo}`}
            size="small"
            scroll={{ x: 760, y: 260 }}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 人` }}
          />
        </div>
      )}
    </Modal>
  );
}
