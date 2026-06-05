import React from "react";
import { Card, Form, Input } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useIntlQuotationStore } from "../../lib/store";
import { useIsMobile } from "../../lib/useIsMobile";

export default function CustomerCardIntl() {
  const customer = useIntlQuotationStore((s) => s.quotation.customer);
  const setCustomer = useIntlQuotationStore((s) => s.setCustomer);
  const isMobile = useIsMobile();

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <UserOutlined style={{ marginRight: 6 }} />
          To / Customer Information
        </span>
      }
      size="small"
      styles={{ body: { padding: isMobile ? "10px 12px" : "12px 16px" } }}
    >
      <Form layout="vertical" size="small">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
          <Form.Item label="Company Name" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Customer company name"
              value={customer.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, name: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Contact Person" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Contact name"
              value={customer.contact ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, contact: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Email" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Customer email"
              value={customer.email ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, email: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Phone" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Phone number"
              value={customer.tel ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, tel: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Address" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Street address"
              value={customer.address ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, address: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Postal Code / ZIP" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Postal code"
              value={customer.postalCode ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, postalCode: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="Country" style={{ marginBottom: 8 }}>
            <Input
              placeholder="Country"
              value={customer.country ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, country: e.target.value }))}
            />
          </Form.Item>
        </div>
      </Form>
    </Card>
  );
}
