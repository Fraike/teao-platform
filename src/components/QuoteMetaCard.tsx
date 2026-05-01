import React from "react";
import { Card, Form, Input, DatePicker, Select } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

export default function QuoteMetaCard() {
  const meta = useQuotationStore((s) => s.quotation.quoteMeta);
  const setMeta = useQuotationStore((s) => s.setQuoteMeta);

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <FileTextOutlined style={{ marginRight: 6 }} />
          报价信息
        </span>
      }
      size="small"
      styles={{ body: { padding: "12px 16px" } }}
    >
      <Form layout="vertical" size="small">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Form.Item label="报价单号" style={{ marginBottom: 8 }}>
            <Input
              value={meta.no}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeta((prev) => ({ ...prev, no: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="报价日期" style={{ marginBottom: 8 }}>
            <DatePicker
              style={{ width: "100%" }}
              value={meta.date ? dayjs(meta.date) : null}
              onChange={(d: Dayjs | null) => setMeta((prev) => ({ ...prev, date: d ? d.format("YYYY-MM-DD") : "" }))}
            />
          </Form.Item>
          <Form.Item label="币种" style={{ marginBottom: 8 }}>
            <Select
              value={meta.currency}
              onChange={(v: string) => setMeta((prev) => ({ ...prev, currency: v }))}
              options={[
                { value: "CNY", label: "CNY (人民币)" },
                { value: "USD", label: "USD (美元)" },
                { value: "EUR", label: "EUR (欧元)" },
              ]}
            />
          </Form.Item>
          <Form.Item label="税率说明" style={{ marginBottom: 8 }}>
            <Input
              value={meta.taxNote}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeta((prev) => ({ ...prev, taxNote: e.target.value }))}
              placeholder="如：不含税"
            />
          </Form.Item>
        </div>
      </Form>
    </Card>
  );
}
