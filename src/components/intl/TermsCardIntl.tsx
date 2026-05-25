import React from "react";
import { Card, Button, Input, Space } from "antd";
import { PlusOutlined, DeleteOutlined, UndoOutlined } from "@ant-design/icons";
import { useIntlQuotationStore } from "../../lib/store-intl";

export default function TermsCardIntl() {
  const terms = useIntlQuotationStore((s) => s.quotation.terms);
  const setTerms = useIntlQuotationStore((s) => s.setTerms);
  const resetTerms = useIntlQuotationStore((s) => s.resetTerms);

  const add = () => setTerms([...terms, `Term ${terms.length + 1}`]);
  const remove = (idx: number) => setTerms(terms.filter((_, i) => i !== idx));
  const update = (idx: number, value: string) => {
    setTerms(terms.map((t, i) => (i === idx ? value : t)));
  };

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>Terms & Remarks</span>
      }
      extra={
        <Space size="small">
          <Button size="small" icon={<UndoOutlined />} onClick={resetTerms}>
            Reset Default
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={add}>
            Add Term
          </Button>
        </Space>
      }
      size="small"
      styles={{ body: { padding: "8px 16px" } }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {terms.map((term, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: "#999", fontSize: 12, minWidth: 20, marginTop: 6 }}>
              {idx + 1}.
            </span>
            <Input.TextArea
              size="small"
              value={term}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(idx, e.target.value)}
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{ flex: 1 }}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => remove(idx)}
              style={{ marginTop: 2 }}
            />
          </div>
        ))}
        {terms.length === 0 && (
          <span style={{ color: "#ccc", fontSize: 12 }}>No terms</span>
        )}
      </div>
    </Card>
  );
}
