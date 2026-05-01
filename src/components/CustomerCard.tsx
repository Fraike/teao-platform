import React from "react";
import { Card, Form, Input } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";

export default function CustomerCard() {
  const customer = useQuotationStore((s) => s.quotation.customer);
  const setCustomer = useQuotationStore((s) => s.setCustomer);

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          <UserOutlined style={{ marginRight: 6 }} />
          客户信息
        </span>
      }
      size="small"
      styles={{ body: { padding: "12px 16px" } }}
    >
      <Form layout="vertical" size="small">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Form.Item label="客户名称" style={{ marginBottom: 8 }}>
            <Input
              placeholder="请输入客户名称"
              value={customer.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, name: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="联系人" style={{ marginBottom: 8 }}>
            <Input
              placeholder="联系人"
              value={customer.contact ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, contact: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="电话" style={{ marginBottom: 8 }}>
            <Input
              placeholder="电话"
              value={customer.tel ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, tel: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="地址" style={{ marginBottom: 8 }}>
            <Input
              placeholder="地址"
              value={customer.address ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomer((prev) => ({ ...prev, address: e.target.value }))}
            />
          </Form.Item>
        </div>
      </Form>
    </Card>
  );
}
