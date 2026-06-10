import { useEffect, useState, useCallback } from "react";
import { Table, Button, Tag, message, Popconfirm, Typography, Switch } from "antd";
import type { TableColumnsType } from "antd";
import { api } from "../lib/api";
import type { User } from "../types/auth";
import styles from "./AdminPage.module.css";

const { Title } = Typography;

const PERMISSION_OPTIONS = [
  { key: "business", label: "业务" },
  { key: "production", label: "装配" },
  { key: "hr", label: "人事" },
  { key: "tools", label: "工具" },
];

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<User[]>("/api/admin/users");
      setUsers(data);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/api/admin/users/${id}/approve`);
      message.success("已通过审核");
      fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.post(`/api/admin/users/${id}/reject`);
      message.success("已驳回");
      fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleTogglePermission = async (id: string, permission: string, enabled: boolean) => {
    try {
      await api.put(`/api/admin/users/${id}/permissions`, { permission, enabled });
      fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const columns: TableColumnsType<User> = [
    { title: "姓名", dataIndex: "name", key: "name" },
    { title: "用户名", dataIndex: "username", key: "username" },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "red" : "blue"}>
          {role === "admin" ? "管理员" : "普通用户"}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "active" ? "green" : "orange"}>
          {status === "active" ? "已激活" : "待审核"}
        </Tag>
      ),
    },
    {
      title: "模块权限",
      key: "permissions",
      width: 260,
      render: (_: React.Key, record: User) => {
        if (record.role === "admin") return <Tag color="red">全部权限</Tag>;
        if (record.status !== "active") return <Tag>待审核</Tag>;
        return (
          <div className={styles.permissionRow}>
            {PERMISSION_OPTIONS.map((p) => (
              <span key={p.key} className={styles.permissionItem}>
                <Switch
                  checked={record.permissions?.includes(p.key)}
                  onChange={(checked) => handleTogglePermission(record.id, p.key, checked)}
                  size="small"
                />
                {p.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      render: (_: React.Key, record: User) => {
        if (record.status !== "pending" || record.role === "admin") return null;
        return (
          <div className={styles.actionRow}>
            <Popconfirm
              title="确认通过该用户的注册申请？"
              onConfirm={() => handleApprove(record.id)}
            >
              <Button type="link" size="small">
                通过
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认驳回该用户的注册申请？此操作不可撤销。"
              onConfirm={() => handleReject(record.id)}
            >
              <Button type="link" danger size="small">
                驳回
              </Button>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.container}>
      <Title level={4} style={{ marginBottom: 16 }}>用户管理</Title>
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
    </div>
  );
}
