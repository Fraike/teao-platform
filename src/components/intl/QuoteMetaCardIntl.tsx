import React, { useEffect } from "react";
import { Card, Form, Input, DatePicker, Select } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { quoteNoForDate, useIntlQuotationStore } from "../../lib/store-intl";
import { DEFAULT_TRADE_TERMS, DEFAULT_PAYMENT_TERMS } from "../../lib/constants";
import { useIsMobile } from "../../lib/useIsMobile";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

export default function QuoteMetaCardIntl() {
  const meta = useIntlQuotationStore((s) => s.quotation.quoteMeta);
  const setMeta = useIntlQuotationStore((s) => s.setQuoteMeta);
  const isMobile = useIsMobile();

  useEffect(() => {
    const syncedNo = quoteNoForDate(meta.no, meta.date);
    if (syncedNo !== meta.no) {
      setMeta((prev) => ({ ...prev, no: quoteNoForDate(prev.no, prev.date) }));
    }
  }, [meta.date, meta.no, setMeta]);

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <FileTextOutlined style={{ marginRight: 6 }} />
          Quotation Info / From
        </span>
      }
      size="small"
      styles={{ body: { padding: isMobile ? "10px 12px" : "12px 16px" } }}
    >
      <Form layout="vertical" size="small">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
          <Form.Item label="Quotation No." style={{ marginBottom: 8 }}>
            <Input
              value={meta.no}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeta((prev) => ({ ...prev, no: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Date" style={{ marginBottom: 8 }}>
            <DatePicker
              style={{ width: "100%" }}
              value={meta.date ? dayjs(meta.date) : null}
              onChange={(d: Dayjs | null) => setMeta((prev) => ({ ...prev, date: d ? d.format("YYYY-MM-DD") : "" }))}
            />
          </Form.Item>
          <Form.Item label="Currency" style={{ marginBottom: 8 }}>
            <Select
              value={meta.currency}
              onChange={(v: string) => setMeta((prev) => ({ ...prev, currency: v }))}
              options={[
                { value: "USD", label: "USD (US Dollar)" },
                { value: "HKD", label: "HKD (Hong Kong Dollar)" },
                { value: "EUR", label: "EUR (Euro)" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Trade Term" style={{ marginBottom: 8 }}>
            <Select
              value={meta.tradeTerm || "EXW"}
              onChange={(v: string) => setMeta((prev) => ({ ...prev, tradeTerm: v }))}
              options={DEFAULT_TRADE_TERMS.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>
          <Form.Item label="Payment Term" style={{ marginBottom: 8 }}>
            <Select
              value={meta.paymentTerm || DEFAULT_PAYMENT_TERMS[0]}
              onChange={(v: string) => setMeta((prev) => ({ ...prev, paymentTerm: v }))}
              options={DEFAULT_PAYMENT_TERMS.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>
          <Form.Item label="Sales Person" style={{ marginBottom: 8 }}>
            <Input
              value={meta.salesName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeta((prev) => ({ ...prev, salesName: e.target.value }))}
              placeholder="Sales person"
            />
          </Form.Item>
          <Form.Item label="Contact (WhatsApp / Tel)" style={{ marginBottom: 8 }}>
            <Input
              value={meta.salesTel}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeta((prev) => ({ ...prev, salesTel: e.target.value }))}
              placeholder="Contact number"
            />
          </Form.Item>
        </div>
      </Form>
    </Card>
  );
}
