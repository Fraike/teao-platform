import React from "react";
import { Card, Form, Input } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";
import { useIntlQuotationStore } from "../lib/store";
import { useIsMobile } from "../lib/useIsMobile";
import type { CustomerInfo } from "../types/quotation";

interface CustomerField {
  key: keyof CustomerInfo;
  label: string;
  placeholder: string;
}

const DOMESTIC_FIELDS: CustomerField[] = [
  { key: "name", label: "客户名称", placeholder: "请输入客户名称" },
  { key: "contact", label: "联系人", placeholder: "联系人" },
  { key: "tel", label: "电话", placeholder: "电话" },
  { key: "address", label: "地址", placeholder: "地址" },
];

const INTL_FIELDS: CustomerField[] = [
  { key: "name", label: "Company Name", placeholder: "Customer company name" },
  { key: "contact", label: "Contact Person", placeholder: "Contact name" },
  { key: "email", label: "Email", placeholder: "Customer email" },
  { key: "tel", label: "Phone", placeholder: "Phone number" },
  { key: "address", label: "Address", placeholder: "Street address" },
  { key: "postalCode", label: "Postal Code / ZIP", placeholder: "Postal code" },
  { key: "country", label: "Country", placeholder: "Country" },
];

function CustomerCardInner({
  fields,
  title,
  customer,
  setCustomer,
}: {
  fields: CustomerField[];
  title: string;
  customer: CustomerInfo;
  setCustomer: (fn: (prev: CustomerInfo) => CustomerInfo) => void;
}) {
  const isMobile = useIsMobile();

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <UserOutlined style={{ marginRight: 6 }} />
          {title}
        </span>
      }
      size="small"
      styles={{ body: { padding: isMobile ? "10px 12px" : "12px 16px" } }}
    >
      <Form layout="vertical" size="small">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
          {fields.map((f) => (
            <Form.Item key={f.key} label={f.label} style={{ marginBottom: 8 }}>
              <Input
                placeholder={f.placeholder}
                value={(customer[f.key] as string) ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCustomer((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </Form.Item>
          ))}
        </div>
      </Form>
    </Card>
  );
}

export function DomesticCustomerCard() {
  const customer = useQuotationStore((s) => s.quotation.customer);
  const setCustomer = useQuotationStore((s) => s.setCustomer);
  return <CustomerCardInner fields={DOMESTIC_FIELDS} title="客户信息" customer={customer} setCustomer={setCustomer} />;
}

export function CustomerCardIntl() {
  const customer = useIntlQuotationStore((s) => s.quotation.customer);
  const setCustomer = useIntlQuotationStore((s) => s.setCustomer);
  return <CustomerCardInner fields={INTL_FIELDS} title="To / Customer Information" customer={customer} setCustomer={setCustomer} />;
}
