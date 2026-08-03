import { useMemo, useState } from "react";
import { Alert, Button, Modal, Popconfirm, Table, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import { api } from "../../lib/api";

type Department = "assembly" | "injection";
type ImportedRecord = Record<string, string | number>;

interface ProductionImportModalProps {
  department: Department;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportConfig {
  label: string;
  endpoint: string;
  columns: readonly string[];
  columnLabels: Record<string, string>;
}

const CONFIG: Record<Department, ImportConfig> = {
  assembly: {
    label: "装配部",
    endpoint: "/api/production/entries/import",
    columns: ["date", "line", "customer", "productName", "dailyQty", "defects"],
    columnLabels: { date: "日期", line: "产线", customer: "客户", productName: "品名", dailyQty: "当天生产", defects: "不良数" },
  },
  injection: {
    label: "注塑部",
    endpoint: "/api/production/injection/entries/import",
    columns: ["date", "machine", "shift", "productName", "dailyQty", "defects"],
    columnLabels: { date: "日期", machine: "机台", shift: "班次", productName: "品名", dailyQty: "当天生产", defects: "不良数" },
  },
};

function getValue(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const normalized = toText(value).replace(/[^\d.-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function toDate(value: unknown): string {
  const parsed = dayjs(toText(value));
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

function parseAssembly(row: Record<string, unknown>): ImportedRecord {
  return {
    date: toDate(getValue(row, ["日期"])),
    line: toText(getValue(row, ["产线"])),
    customer: toText(getValue(row, ["客户名称", "客户"])),
    spec: toText(getValue(row, ["规格"])),
    productName: toText(getValue(row, ["品名", "品名/型号"])),
    materialBatch: toText(getValue(row, ["原材料批号"])),
    workHours: toNumber(getValue(row, ["当天工作时间（小时）", "工作时间（小时）"])),
    productionBatch: toText(getValue(row, ["生产批号"])),
    orderQty: toNumber(getValue(row, ["订单数量"])),
    dailyQty: toNumber(getValue(row, ["当天生产数量"])),
    planQty: toNumber(getValue(row, ["计划生产数量"])),
    cumulativeQty: toNumber(getValue(row, ["实际生产数量（累计生产）", "累计生产"])),
    defects: toNumber(getValue(row, ["不良数"])),
    oilInjection: toText(getValue(row, ["注油"])),
    rubberRing: toText(getValue(row, ["装胶圈"])),
    capping: toText(getValue(row, ["盖盖子"])),
    shaftCore: toText(getValue(row, ["放轴芯"])),
    ultrasonic: toText(getValue(row, ["超声"])),
    testing: toText(getValue(row, ["测试"])),
    gear: toText(getValue(row, ["装齿轮"])),
    filler: toText(getValue(row, ["填表人"])),
    remark: toText(getValue(row, ["备注"])),
  };
}

function parseInjection(row: Record<string, unknown>): ImportedRecord {
  return {
    date: toDate(getValue(row, ["日期"])),
    machine: toText(getValue(row, ["机台"])),
    productName: toText(getValue(row, ["品名/型号", "品名"])),
    material: toText(getValue(row, ["原材料"])),
    materialBatch: toText(getValue(row, ["原材料批号"])),
    shift: toText(getValue(row, ["班次"])),
    operator: toText(getValue(row, ["操作人"])),
    orderQty: toNumber(getValue(row, ["订单数量"])),
    dailyQty: toNumber(getValue(row, ["当天生产数量"])),
    cumulativeQty: toNumber(getValue(row, ["实际生产数量（累计生产）", "累计生产"])),
    defects: toNumber(getValue(row, ["不良数"])),
    batchNo: toText(getValue(row, ["半成品生产批号", "生产批号"])),
    remark: toText(getValue(row, ["备注"])),
  };
}

function validate(record: ImportedRecord, department: Department): string | null {
  const fields = department === "assembly" ? ["date", "line", "customer", "productName"] : ["date", "machine", "shift", "productName"];
  const missing = fields.find((field) => !toText(record[field]));
  if (missing) return `缺少 ${missing}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toText(record.date))) return "日期无效";
  if (Number(record.defects) > Number(record.dailyQty)) return "不良数大于当天生产数量";
  return null;
}

export function ProductionImportModal({ department, open, onClose, onImported }: ProductionImportModalProps) {
  const config = CONFIG[department];
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<ImportedRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const previewColumns = useMemo(
    () => config.columns.map((key) => ({
      title: config.columnLabels[key],
      dataIndex: key,
      key,
      ellipsis: true,
    })),
    [config]
  );

  const reset = () => {
    setFileName("");
    setRecords([]);
    setErrors([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseFile = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("文件中没有可读取的工作表");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: false });
      const [headerRow, ...dataRows] = rows;
      const headers = (headerRow || []).map((value) => toText(value));
      if (headers.length === 0) throw new Error("未识别到表头");

      const parsed: ImportedRecord[] = [];
      const rowErrors: string[] = [];
      dataRows.forEach((values, index) => {
        if (!values.some((value) => toText(value))) return;
        const row = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
        const record = department === "assembly" ? parseAssembly(row) : parseInjection(row);
        const error = validate(record, department);
        if (error) rowErrors.push(`第 ${index + 2} 行：${error}`);
        else parsed.push(record);
      });

      if (parsed.length === 0) throw new Error("没有可导入的有效记录");
      setFileName(file.name);
      setRecords(parsed);
      setErrors(rowErrors);
    } catch (error) {
      reset();
      message.error(error instanceof Error ? error.message : "文件解析失败");
    }
  };

  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls,.csv",
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      void parseFile(file as File);
      return false;
    },
  };

  const importRecords = async () => {
    setImporting(true);
    try {
      const result = await api.post<{ ok: boolean; count: number }>(config.endpoint, { records });
      message.success(`${config.label}生产日报已覆盖导入 ${result.count} 条记录`);
      handleClose();
      onImported();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      title={`${config.label}生产日报导入`}
      open={open}
      onCancel={handleClose}
      width={920}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Popconfirm
          key="confirm"
          title={`确认覆盖${config.label}全部生产日报记录？`}
          description="原记录将从当前日报列表中移除，此操作不能撤销。"
          onConfirm={importRecords}
          okText="确认覆盖"
          cancelText="返回检查"
          disabled={records.length === 0 || errors.length > 0}
        >
          <Button type="primary" danger loading={importing} disabled={records.length === 0 || errors.length > 0}>
            确认覆盖导入
          </Button>
        </Popconfirm>,
      ]}
      destroyOnClose
    >
      <Upload.Dragger {...uploadProps}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">选择 Excel 或 CSV 日报文件</p>
        <p className="ant-upload-hint">系统会先解析和校验，确认后才会覆盖当前部门的全部记录。</p>
      </Upload.Dragger>

      {fileName && (
        <Alert
          style={{ marginTop: 16 }}
          type={errors.length > 0 ? "warning" : "success"}
          showIcon
          message={`${fileName}：识别到 ${records.length} 条有效记录`}
          description={errors.length > 0 ? `存在 ${errors.length} 条错误，修正后才能覆盖导入。${errors.slice(0, 3).join("；")}` : "字段校验通过，可查看预览后确认覆盖。"}
        />
      )}

      {records.length > 0 && (
        <Table
          style={{ marginTop: 16 }}
          columns={previewColumns}
          dataSource={records.slice(0, 8).map((record, index) => ({ ...record, key: index }))}
          pagination={false}
          size="small"
          scroll={{ x: 760 }}
        />
      )}
    </Modal>
  );
}
