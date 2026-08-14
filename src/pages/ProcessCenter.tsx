import { useMemo, useState } from "react";
import {
  Alert,
  Card,
  Collapse,
  Descriptions,
  Input,
  List,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  DownloadOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import FlowChart from "../components/process/FlowChart";
import processes from "../data/processes";
import { useIsMobile } from "../lib/useIsMobile";
import type { ProcessStep } from "../types/process";
import styles from "./ProcessCenter.module.css";

const { Title, Paragraph, Text } = Typography;

const DEPARTMENTS = [
  "全部",
  "工程部",
  "生产部",
  "生管部",
  "品质部",
  "行政部",
  "采购部",
  "仓库部",
  "业务部",
  "财务部",
  "总经办",
];

const STATUS_COLOR: Record<string, string> = {
  生效中: "green",
  修订中: "orange",
  已作废: "red",
};

const DEPARTMENT_COUNTS = DEPARTMENTS.reduce<Record<string, number>>((counts, item) => {
  counts[item] = item === "全部"
    ? processes.length
    : processes.filter((process) => process.department === item).length;
  return counts;
}, {});

interface ProcessStepListProps {
  steps: ProcessStep[];
}

function ProcessStepList({ steps }: ProcessStepListProps) {
  return (
    <ol className={styles.stepList}>
      {steps.map((step, index) => (
        <li key={`${step.title}-${index}`} className={styles.stepItem}>
          <div>
            <Text strong>{step.title}</Text>
            {step.responsible && <Tag className={styles.responsibleTag}>{step.responsible}</Tag>}
          </div>
          {step.description && <Paragraph className={styles.stepDescription}>{step.description}</Paragraph>}
          {(step.input || step.output) && (
            <div className={styles.ioRow}>
              {step.input && <Text type="secondary">输入：{step.input}</Text>}
              {step.output && <Text type="secondary">输出：{step.output}</Text>}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function ProcessCenter() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("全部");

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return processes.filter((process) => {
      const matchesDepartment = department === "全部" || process.department === department;
      const searchable = [
        process.title,
        process.department,
        process.category,
        process.summary,
        process.purpose,
        process.scope,
        process.source,
        ...process.relatedDepartments,
        ...process.forms,
        ...process.notes,
        ...process.responsibilities.flatMap((item) => [item.department, item.duty]),
        ...process.steps.flatMap((step) => [
          step.title,
          step.description ?? "",
          step.responsible ?? "",
          step.input ?? "",
          step.output ?? "",
        ]),
        ...(process.subprocesses ?? []).flatMap((subprocess) => [
          subprocess.title,
          subprocess.inputDocuments ?? "",
          ...subprocess.steps.flatMap((step) => [
            step.title,
            step.description ?? "",
            step.responsible ?? "",
            step.input ?? "",
            step.output ?? "",
          ]),
        ]),
      ];

      return matchesDepartment && (!keyword || searchable.some((value) => value.toLowerCase().includes(keyword)));
    });
  }, [department, search]);

  return (
    <div className={`${styles.page} ${isMobile ? styles.mobilePage : ""}`}>
      <Title level={isMobile ? 4 : 3} className={styles.title}>
        流程查阅中心
      </Title>
      <Paragraph type="secondary" className={styles.intro}>
        用于查看公司各部门标准流程、操作说明和相关表单。生产部包含装配和注塑两个执行部门。
      </Paragraph>

      <Alert
        message="如需发起申请或审批，请前往企业微信对应审批流程。"
        type="info"
        showIcon
        className={styles.alert}
      />

      <Space direction="vertical" size={16} className={styles.filters}>
        <Input
          placeholder="搜索流程名称、部门、责任人、输入输出或表单"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
          className={styles.search}
        />
        <div className={styles.departmentList}>
          {DEPARTMENTS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setDepartment(item)}
              className={`${styles.departmentButton} ${department === item ? styles.departmentButtonActive : ""}`}
            >
              <span>{item}</span>
              <span className={`${styles.departmentCount} ${department === item ? styles.departmentCountActive : ""}`}>
                {DEPARTMENT_COUNTS[item]}
              </span>
            </button>
          ))}
        </div>
      </Space>

      {filtered.length === 0 ? (
        <div className={styles.empty}>未找到匹配的流程</div>
      ) : (
        <Space direction="vertical" size={24} className={styles.processList}>
          {filtered.map((process) => (
            <Card
              key={process.id}
              id={process.id}
              className={styles.processCard}
              title={
                <Space size={12} wrap>
                  <Text strong className={styles.cardTitle}>{process.title}</Text>
                  <Tag color={STATUS_COLOR[process.status]}>{process.status}</Tag>
                  <Text type="secondary" className={styles.cardMeta}>
                    {process.department} · {process.category} · {process.version}
                  </Text>
                </Space>
              }
            >
              <Paragraph type="secondary" className={styles.summary}>{process.summary}</Paragraph>

              <Descriptions
                size="small"
                bordered
                column={{ xs: 1, sm: 1, md: 2 }}
                className={styles.descriptions}
                items={[
                  { key: "source", label: "来源文件", children: process.source },
                  { key: "type", label: "文件性质", children: process.documentType },
                  { key: "owner", label: "主责部门", children: process.owner },
                  { key: "updated", label: "整理日期", children: process.updatedAt },
                  { key: "purpose", label: "目的", children: process.purpose, span: 2 },
                  { key: "scope", label: "适用范围", children: process.scope, span: 2 },
                ]}
              />

              <section className={styles.section}>
                <Text strong className={styles.sectionTitle}>关联部门</Text>
                <Space size={[6, 6]} wrap>
                  {process.relatedDepartments.map((item) => <Tag key={item}>{item}</Tag>)}
                </Space>
              </section>

              <section className={styles.section}>
                <Text strong className={styles.sectionTitle}>职责分工</Text>
                <List
                  size="small"
                  dataSource={process.responsibilities}
                  renderItem={(item) => (
                    <List.Item className={styles.responsibilityItem}>
                      <Text strong>{item.department}：</Text>
                      <Text>{item.duty}</Text>
                    </List.Item>
                  )}
                />
              </section>

              <section className={styles.section}>
                <Text strong className={styles.sectionTitle}>流程图</Text>
                <FlowChart steps={process.steps} />
              </section>

              <section className={styles.section}>
                <Text strong className={styles.sectionTitle}>流程步骤</Text>
                <ProcessStepList steps={process.steps} />
              </section>

              {process.subprocesses && process.subprocesses.length > 0 && (
                <section className={styles.section}>
                  <Text strong className={styles.sectionTitle}>子流程明细</Text>
                  <Collapse
                    items={process.subprocesses.map((subprocess, index) => ({
                      key: `${process.id}-${index}`,
                      label: subprocess.title,
                      children: (
                        <div>
                          {subprocess.inputDocuments && (
                            <Paragraph type="secondary">输入文件：{subprocess.inputDocuments}</Paragraph>
                          )}
                          <ProcessStepList steps={subprocess.steps} />
                        </div>
                      ),
                    }))}
                  />
                </section>
              )}

              {process.forms.length > 0 && (
                <section className={styles.section}>
                  <Text strong className={styles.sectionTitle}>相关表单与记录</Text>
                  <Space size={[6, 6]} wrap>
                    {process.forms.map((form) => <Tag color="blue" key={form}>{form}</Tag>)}
                  </Space>
                </section>
              )}

              <section className={styles.section}>
                <Text strong className={styles.sectionTitle}>注意事项</Text>
                <List
                  size="small"
                  dataSource={process.notes}
                  renderItem={(note) => (
                    <List.Item className={styles.noteItem}>
                      <ExclamationCircleOutlined className={styles.noteIcon} />
                      <Text>{note}</Text>
                    </List.Item>
                  )}
                />
              </section>

              {process.attachments.length > 0 && (
                <Space size={8} wrap>
                  <Text type="secondary">附件：</Text>
                  {process.attachments.map((attachment) => (
                    <a key={attachment.url} href={attachment.url} target="_blank" rel="noopener noreferrer">
                      <DownloadOutlined /> {attachment.name}
                    </a>
                  ))}
                </Space>
              )}
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
}
