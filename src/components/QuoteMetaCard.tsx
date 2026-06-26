import React, { useEffect } from "react";
import { Card, Form, Input, DatePicker, Select } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { quoteNoForDate, useQuotationStore, useIntlQuotationStore } from "../lib/store";
import { DEFAULT_TRADE_TERMS, DEFAULT_PAYMENT_TERMS } from "../lib/constants";
import { useIsMobile } from "../lib/useIsMobile";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { QuoteMeta } from "../types/quotation";

interface MetaField {
  key: keyof QuoteMeta;
  label: string;
  placeholder?: string;
  type: "input" | "date" | "select";
  selectOptions?: { value: string; label: string }[];
}

const DOMESTIC_FIELDS: MetaField[] = [
  { key: "no", label: "报价单号", type: "input" },
  { key: "date", label: "报价日期", type: "date" },
  {
    key: "currency", label: "币种", type: "select",
    selectOptions: [
      { value: "CNY", label: "CNY (人民币)" },
      { value: "USD", label: "USD (美元)" },
      { value: "EUR", label: "EUR (欧元)" },
    ],
  },
  { key: "taxNote", label: "税率说明", placeholder: "如：不含税", type: "input" },
  { key: "salesName", label: "报价人", placeholder: "报价人", type: "input" },
  { key: "salesTel", label: "联系方式", placeholder: "联系电话", type: "input" },
];

const INTL_FIELDS: MetaField[] = [
  { key: "no", label: "Quotation No.", type: "input" },
  { key: "date", label: "Date", type: "date" },
  {
    key: "currency", label: "Currency", type: "select",
    selectOptions: [
      { value: "USD", label: "USD (US Dollar)" },
      { value: "HKD", label: "HKD (Hong Kong Dollar)" },
      { value: "EUR", label: "EUR (Euro)" },
    ],
  },
  {
    key: "tradeTerm", label: "Trade Term", type: "select",
    selectOptions: DEFAULT_TRADE_TERMS.map((t) => ({ value: t, label: t })),
  },
  {
    key: "paymentTerm", label: "Payment Term", type: "select",
    selectOptions: DEFAULT_PAYMENT_TERMS.map((t) => ({ value: t, label: t })),
  },
  { key: "salesName", label: "Sales Person", placeholder: "Sales person", type: "input" },
  { key: "salesTel", label: "Contact (WhatsApp / Tel)", placeholder: "Contact number", type: "input" },
];

function QuoteMetaCardInner({
  fields,
  title,
  meta,
  setMeta,
}: {
  fields: MetaField[];
  title: string;
  meta: QuoteMeta;
  setMeta: (fn: (prev: QuoteMeta) => QuoteMeta) => void;
}) {
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
          {title}
        </span>
      }
      size="small"
      styles={{ body: { padding: isMobile ? "10px 12px" : "12px 16px" } }}
    >
      <Form layout="vertical" size="small">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
          {fields.map((f) => {
            if (f.type === "date") {
              return (
                <Form.Item key={f.key} label={f.label} style={{ marginBottom: 8 }}>
                  <DatePicker
                    style={{ width: "100%" }}
                    value={meta.date ? dayjs(meta.date) : null}
                    onChange={(d: Dayjs | null) => setMeta((prev) => ({ ...prev, date: d ? d.format("YYYY-MM-DD") : "" }))}
                  />
                </Form.Item>
              );
            }
            if (f.type === "select" && f.selectOptions) {
              return (
                <Form.Item key={f.key} label={f.label} style={{ marginBottom: 8 }}>
                  <Select
                    value={(meta[f.key] as string) || f.selectOptions[0]?.value || ""}
                    onChange={(v: string) => setMeta((prev) => ({ ...prev, [f.key]: v }))}
                    options={f.selectOptions}
                  />
                </Form.Item>
              );
            }
            return (
              <Form.Item key={f.key} label={f.label} style={{ marginBottom: 8 }}>
                <Input
                  value={(meta[f.key] as string) ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setMeta((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                />
              </Form.Item>
            );
          })}
        </div>
      </Form>
    </Card>
  );
}

export function DomesticQuoteMetaCard() {
  const meta = useQuotationStore((s) => s.quotation.quoteMeta);
  const setMeta = useQuotationStore((s) => s.setQuoteMeta);
  return <QuoteMetaCardInner fields={DOMESTIC_FIELDS} title="报价信息" meta={meta} setMeta={setMeta} />;
}

export function QuoteMetaCardIntl() {
  const meta = useIntlQuotationStore((s) => s.quotation.quoteMeta);
  const setMeta = useIntlQuotationStore((s) => s.setQuoteMeta);
  return <QuoteMetaCardInner fields={INTL_FIELDS} title="Quotation Info / From" meta={meta} setMeta={setMeta} />;
}
