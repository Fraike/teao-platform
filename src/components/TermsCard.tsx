import React from "react";
import { Card, Button, Input, Space } from "antd";
import { PlusOutlined, DeleteOutlined, UndoOutlined } from "@ant-design/icons";
import { useQuotationStore, useIntlQuotationStore } from "../lib/store";

type StoreHook = typeof useQuotationStore | typeof useIntlQuotationStore;

export interface TermsCardLabels {
  title: string;
  resetButton: string;
  addButton: string;
  emptyText: string;
  defaultTermPrefix: string;
  useTextArea: boolean;
}

const CN: TermsCardLabels = {
  title: "条款与备注",
  resetButton: "恢复默认",
  addButton: "添加条款",
  emptyText: "暂无条款",
  defaultTermPrefix: "条款",
  useTextArea: false,
};

const EN: TermsCardLabels = {
  title: "Terms & Remarks",
  resetButton: "Reset Default",
  addButton: "Add Term",
  emptyText: "No terms",
  defaultTermPrefix: "Term",
  useTextArea: true,
};

function TermsCard({ useStore, labels }: { useStore: StoreHook; labels: TermsCardLabels }) {
  const terms = useStore((s) => s.quotation.terms);
  const setTerms = useStore((s) => s.setTerms);
  const resetTerms = useStore((s) => s.resetTerms);

  const add = () => setTerms([...terms, `${labels.defaultTermPrefix} ${terms.length + 1}`]);
  const remove = (idx: number) => setTerms(terms.filter((_, i) => i !== idx));
  const update = (idx: number, value: string) => {
    setTerms(terms.map((t, i) => (i === idx ? value : t)));
  };

  return (
    <Card
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>{labels.title}</span>}
      extra={
        <Space size="small">
          <Button size="small" icon={<UndoOutlined />} onClick={resetTerms}>
            {labels.resetButton}
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={add}>
            {labels.addButton}
          </Button>
        </Space>
      }
      size="small"
      styles={{ body: { padding: "8px 16px" } }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {terms.map((term, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: labels.useTextArea ? "flex-start" : "center", gap: 8 }}>
            <span style={{ color: "#999", fontSize: 12, minWidth: 20, marginTop: labels.useTextArea ? 6 : 0 }}>
              {idx + 1}.
            </span>
            {labels.useTextArea ? (
              <Input.TextArea
                size="small"
                value={term}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(idx, e.target.value)}
                autoSize={{ minRows: 1, maxRows: 6 }}
                style={{ flex: 1 }}
              />
            ) : (
              <Input
                size="small"
                value={term}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(idx, e.target.value)}
                style={{ flex: 1 }}
              />
            )}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => remove(idx)}
              style={labels.useTextArea ? { marginTop: 2 } : undefined}
            />
          </div>
        ))}
        {terms.length === 0 && (
          <span style={{ color: "#ccc", fontSize: 12 }}>{labels.emptyText}</span>
        )}
      </div>
    </Card>
  );
}

export default function DomesticTermsCard() {
  return <TermsCard useStore={useQuotationStore} labels={CN} />;
}

export function TermsCardIntl() {
  return <TermsCard useStore={useIntlQuotationStore} labels={EN} />;
}
