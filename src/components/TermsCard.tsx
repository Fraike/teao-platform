import React from "react";
import { Card, Button, Input, Space } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";

export default function TermsCard() {
  const terms = useQuotationStore((s) => s.quotation.terms);
  const setTerms = useQuotationStore((s) => s.setTerms);
  const resetTerms = useQuotationStore((s) => s.resetTerms);

  const add = () => setTerms([...terms, `条款 ${terms.length + 1}`]);
  const remove = (idx: number) => setTerms(terms.filter((_, i) => i !== idx));
  const update = (idx: number, value: string) => {
    setTerms(terms.map((t, i) => (i === idx ? value : t)));
  };

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>条款与备注</span>
      }
      extra={
        <Space size="small">
          <Button size="small" icon={<UndoOutlined />} onClick={resetTerms}>
            恢复默认
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={add}>
            添加条款
          </Button>
        </Space>
      }
      size="small"
      styles={{ body: { padding: "8px 16px" } }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {terms.map((term, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#999", fontSize: 12, minWidth: 20 }}>
              {idx + 1}.
            </span>
            <Input
              size="small"
              value={term}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(idx, e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => remove(idx)}
            />
          </div>
        ))}
        {terms.length === 0 && (
          <span style={{ color: "#ccc", fontSize: 12 }}>暂无条款</span>
        )}
      </div>
    </Card>
  );
}
