import { activeStandardFields } from "../../lib/standardFieldGroups";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Descriptions, Modal, Radio, Space, Table, Tag, Upload, message } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import { parseStandardImportInWorker } from "../../lib/standardImportWorker";
import { sanitaryMigrationPayload, sanitaryLegacySourcePayload } from "../../lib/standardMigrationExport";
import type { SourcedStandardImportRecord, StandardImportSource, StandardImportScope } from "../../types/standardImport";
import type { StandardImportRecord, StandardCategory } from "../../types/standard";
import { STANDARD_TYPE_LABELS } from "../../types/standard";
import styles from "./StandardImportModal.module.css";

interface StandardImportModalProps {
  categories?: StandardCategory[];
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportIssue {
  row?: number;
  message: string;
}

interface ImportPreview {
  total: number;
  valid: number;
  errors: ImportIssue[];
  token: string | null;
  skipped: number;
  obsolete?: number;
  warnings?: (string | ImportIssue)[];
}

interface PreviewResponse {
  ok: boolean;
  data: ImportPreview;
  error?: string;
}

interface ConfirmResponse {
  ok: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

interface ImportSession {
  fileName: string;
  sheetName: string;
  records: SourcedStandardImportRecord[];
  fileHash: string;
  source: StandardImportSource;
  warnings: string[];
  preview: ImportPreview;
}

function issueText(issue: string | ImportIssue): string {
  if (typeof issue === "string") return issue;
  return `${issue.row ? `记录 ${issue.row}：` : ""}${issue.message}`;
}

function previewIsValid(preview: ImportPreview, total: number): boolean {
  return preview.total === total && Number.isInteger(preview.valid) && preview.valid > 0
    && Number.isInteger(preview.skipped) && preview.skipped >= 0
    && preview.valid === total && preview.skipped < preview.valid
    && Array.isArray(preview.errors) && preview.errors.length === 0
    && typeof preview.token === "string" && preview.token.trim().length > 0;
}

export function StandardImportModal({ open, onClose, onImported, categories }: StandardImportModalProps) {
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  if (!open) return null;
  return <StandardImportContent key={isAdmin ? "admin" : "restricted"} open={open}
    onClose={onClose} onImported={onImported} isAdmin={isAdmin} categories={categories} />;
}

function StandardImportContent({ open, onClose, onImported, isAdmin, categories }: StandardImportModalProps & { isAdmin: boolean }) {
  const [scope, setScope] = useState<StandardImportScope>("main");
  const [session, setSession] = useState<ImportSession | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const generation = useRef(0);
  const working = useRef(false);
  const parsing = useRef<AbortController | null>(null);

  useEffect(() => {
    const requestGeneration = generation;
    return () => { requestGeneration.current++; parsing.current?.abort(); };
  }, []);

  const selectFile = async (file: File) => {
    if (!open || !isAdmin || busy === "confirm") return false;
    parsing.current?.abort();
    working.current = false;
    setBusy(null);
    const requestId = ++generation.current;
    setSession(null);
    setError("");
    setAcknowledged(false);
    if (!/\.(xls|xlsx)$/i.test(file.name) || file.size > 10 * 1024 * 1024 || file.size === 0) {
      setError("请选择非空的 XLS / XLSX 文件，大小不超过 10MB。");
      return false;
    }
    working.current = true;
    setBusy("preview");
    try {
      const controller = new AbortController();
      parsing.current = controller;
      const parsed = await parseStandardImportInWorker(file, controller.signal, scope);
      if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
      if (requestId !== generation.current) return false;
      const result = await api.post<PreviewResponse>("/api/standards/import/preview", { records: parsed.records });
      if (requestId !== generation.current) return false;
      if (!result.ok || !result.data) throw new Error(result.error || "导入预览失败。");
      setSession({ fileName: file.name, sheetName: parsed.source.sheetName, fileHash: parsed.fileHash, source: parsed.source, records: parsed.records, warnings: parsed.warnings, preview: result.data });
      if (!previewIsValid(result.data, parsed.records.length)) setError("预览未通过，或缺少有效预览凭证；请修正问题后重新选择文件。全部重复的记录无需导入。");
    } catch (err) {
      if (requestId === generation.current) setError(err instanceof Error ? err.message : "解析或预览失败。");
    } finally {
      if (requestId === generation.current) { working.current = false; setBusy(null); }
    }
    return false;
  };

  const warnings = session ? [...session.warnings, ...(session.preview.warnings ?? []).map(issueText)] : [];
  const canConfirm = isAdmin && Boolean(session && previewIsValid(session.preview, session.records.length))
    && acknowledged && !busy;

  const confirmImport = async () => {
    if (!canConfirm || !session || working.current) return;
    const requestId = generation.current;
    working.current = true;
    setBusy("confirm");
    setError("");
    let imported = false;
    try {
      const result = await api.post<ConfirmResponse>("/api/standards/import/confirm", {
        records: session.records, token: session.preview.token,
      });
      if (requestId !== generation.current) return;
      if (!result.ok) throw new Error(result.error || "导入失败。");
      message.success(`已导入 ${result.inserted} 条标准，跳过 ${result.skipped} 条重复记录。`);
      setSession(null);
      imported = true;
    } catch (err) {
      if (requestId === generation.current) {
        setError(`${err instanceof Error ? err.message : "导入失败。"} 请重新预览后确认，避免重复提交。`);
        setSession(null);
        setAcknowledged(false);
      }
    } finally {
      if (requestId === generation.current) { working.current = false; setBusy(null); }
    }
    if (imported) { onImported(); onClose(); }
  };

  const migration = session && scope === "sanitary" ? sanitaryMigrationPayload(session) || sanitaryLegacySourcePayload(session) : null;
  const exportMigration = () => {
    if (!migration) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(migration, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = migration.format === "teao-sanitary-migration-v1" ? "sanitary-migration-preview.json" : "sanitary-legacy-source-preview.json"; link.hidden = true;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    message.info("已导出迁移预览，仅含原表标准数据；正式执行仍需服务器预检和摘要确认");
  };

  const close = () => {
    if (busy === "confirm") return;
    generation.current++;
    parsing.current?.abort();
    working.current = false;
    onClose();
  };

  return (
    <Modal title="初始化导入产品标准（管理员）" open={open} width={960}
      onCancel={close} closable={busy !== "confirm"} maskClosable={busy !== "confirm"} keyboard={busy !== "confirm"}
      footer={<Space><Button disabled={busy === "confirm"} onClick={close}>取消</Button>
        {migration && isAdmin && <Button disabled={Boolean(busy)} onClick={exportMigration}>导出迁移预览 JSON</Button>}
        <Button type="primary" danger disabled={!canConfirm} loading={busy === "confirm"} onClick={confirmImport}>确认导入</Button></Space>}>
      <div className={styles.body}>
        <Alert type="warning" showIcon message="初始化导入：普通标准发布，确认作废标准停用"
            description="仅供管理员初始化使用。服务端按完整身份确认的作废标准将导入为停用；其他作废项阻止发布。服务端确认导入前会备份数据库；请核查预览、备份安排及临时标准。" />
        {!isAdmin ? <Alert type="error" showIcon message="仅管理员可执行初始化导入。" /> : <>
          <Radio.Group value={scope} disabled={busy === "confirm"} aria-label="导入内容" onChange={event => {
            generation.current++; parsing.current?.abort(); working.current = false;
            setScope(event.target.value); setSession(null); setBusy(null); setError(""); setAcknowledged(false);
          }} options={[{label: "常规标准", value: "main"}, {label: "智能卫浴（盖、座独立产品）", value: "sanitary"}]} />
          <Upload accept=".xls,.xlsx" maxCount={1} showUploadList={false} beforeUpload={selectFile} disabled={busy === "confirm"}>
            <Button icon={<UploadOutlined />} disabled={busy === "confirm"}>{busy === "preview" ? "重新选择 Excel（取消当前解析）" : "选择 Excel 并预览"}</Button>
          </Upload>
          <span className={styles.hint}>支持 XLS / XLSX，最大 10MB；按所选内容读取工作表。新卫浴表按左右SP序号分别导入盖、座产品，旧表保留兼容；原始单位和批注完整保留。</span>
        </>}
        {error && <Alert type="error" showIcon message={error} />}
        {session && <>
          <div className={styles.summary} aria-live="polite">
            <span>{session.fileName} · {session.sheetName}</span>
            <Space wrap><Tag>总计 {session.preview.total}</Tag><Tag>批注 {session.records.reduce((sum, record) => sum + (record.comments?.length || 0), 0)}</Tag><Tag color="green">有效 {session.preview.valid}</Tag>
              <Tag color="orange">将停用 {session.preview.obsolete ?? 0}</Tag><Tag>跳过 {session.preview.skipped}</Tag><Tag color="red">错误 {session.preview.errors.length}</Tag></Space>
          </div>
          {session.preview.errors.length > 0 && <Alert type="error" showIcon message="预览校验错误"
            description={<ul className={styles.issues}>{session.preview.errors.map((issue, index) => <li key={index}>{issueText(issue)}</li>)}</ul>} />}
          {warnings.length > 0 && <Alert type="warning" showIcon message="需要重点核查"
            description={<ul className={styles.issues}>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>} />}
          <Table<SourcedStandardImportRecord> size="small" dataSource={session.records}
            rowKey={(record) => `${record.sourceHash}:${record.sourceSheet}:${record.sourceRow}`}
            expandable={scope === "sanitary" ? { expandedRowRender: record => <>
              <Descriptions size="small" column={1} bordered items={(categories?.some(c => c.key === record.categoryKey) ? activeStandardFields(categories.find(c => c.key === record.categoryKey), record.fields) : Object.keys(record.fields).map(key => ({key, label: key}))).map(field => ({key: field.key, label: field.label, children: <span className={styles.text}>{record.fields[field.key] || "—"}</span>}))} />
              <ul className={styles.issues}>{record.comments?.map(comment => <li key={comment.cell}>{comment.cell} · {comment.fieldLabel} · {comment.author}：<span className={styles.text}>{comment.text}</span></li>)}</ul>
            </> } : undefined}
            pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 760 }} columns={[
              { title: "序号", dataIndex: "serialNo", width: 125 },
              { title: "客户", dataIndex: "customer", width: 150, render: (value: string) => <span className={styles.text}>{value || "（空白）"}</span> },
              { title: "型号", dataIndex: "model", width: 130 },
              { title: "类型", dataIndex: "standardType", width: 95, render: (value: StandardImportRecord["standardType"]) => STANDARD_TYPE_LABELS[value] },
              { title: scope === "sanitary" ? "产品部位 / 标准" : "装锁方向", render: (_value: unknown, record) => scope === "sanitary" ? record.fields.part_type ? `${record.fields.part_type} · ${record.fields.product_standard}` : `${record.fields.lid_standard || "—"} / ${record.fields.seat_standard || "—"}` : record.fields.lock_direction || "—", width: 180 },
              { title: "备注 / 附加说明", render: (_value: unknown, record) => <span className={styles.text}>{[record.fields.remark, record.fields.import_note].filter(Boolean).join("\n") || "—"}</span> },
            ]} />
          <Checkbox checked={acknowledged} disabled={Boolean(busy)} onChange={(event) => setAcknowledged(event.target.checked)}>
            我已核查备份安排、预览及警告，确认按预览结果导入（普通标准发布，确认作废标准停用）。
          </Checkbox>
        </>}
      </div>
    </Modal>
  );
}
