import { useEffect, useState, useCallback } from "react";
import { Button, Tag, message, Popconfirm, Typography, Tooltip, Modal, Form, Input } from "antd";
import type { TableColumnsType } from "antd";
import { api } from "../lib/api";
import type { User } from "../types/auth";
import styles from "./AdminPage.module.css";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { UserPermissionDrawer } from "../components/admin/UserPermissionDrawer";
import { summarizeUserPermissions } from "../lib/userPermissions";

const { Title } = Typography;

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetForm] = Form.useForm<{ newPassword: string; confirmPassword: string }>();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [permissionTargetId, setPermissionTargetId] = useState<string | null>(null);
  const permissionUser = users.find(user => user.id === permissionTargetId) ?? null;

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleRecoveryReview = async (record: User, approve: boolean) => {
    if (!record.passwordResetRequest) return;
    setReviewingId(record.id);
    try {
      await api.post(`/api/admin/users/${record.id}/password-recovery/review`, { requestId: record.passwordResetRequest.id, approve });
      message.success(approve ? "已通过，新密码已生效" : "已驳回，原密码保持有效");
      await fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
      await fetchUsers();
    } finally {
      setReviewingId(null);
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
    const result = await api.put<{ ok: boolean; permissions: string[] }>(`/api/admin/users/${id}/permissions`, { permission, enabled });
    setUsers(current => current.map(user => user.id === id ? { ...user, permissions: result.permissions } : user));
  };

  const handleUpdateWecom = async (id: string, value: string) => {
    try {
      await api.put(`/api/admin/users/${id}/wecom`, { wecomUserid: value.trim() });
      fetchUsers();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const openResetModal = (user: User) => {
    resetForm.resetFields();
    setResetTarget(user);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    const values = await resetForm.validateFields();
    if (values.newPassword !== values.confirmPassword) {
      resetForm.setFields([{ name: "confirmPassword", errors: ["两次输入的密码不一致"] }]);
      return;
    }
    setResetting(true);
    try {
      await api.post(`/api/admin/users/${resetTarget.id}/reset-password`, { newPassword: values.newPassword });
      message.success("密码已重置");
      setResetTarget(null);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setResetting(false);
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
      title: "企业微信账号",
      dataIndex: "wecomUserid",
      key: "wecomUserid",
      width: 180,
      render: (_: React.Key, record: User) => (
        <Input
          key={`${record.id}-${record.wecomUserid || ""}`}
          defaultValue={record.wecomUserid || ""}
          placeholder="用于审核@提醒"
          size="small"
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value !== (record.wecomUserid || "")) handleUpdateWecom(record.id, value);
          }}
        />
      ),
    },
    {
      title: "权限配置",
      key: "permissions",
      width: 230,
      render: (_: React.Key, record: User) => {
        if (record.role === "admin") return <Tag color="red">全部权限</Tag>;
        if (record.status !== "active") return <Tag>待审核</Tag>;
        const summary = summarizeUserPermissions(record.permissions ?? []);
        return (
          <div className={styles.permissionRow}>
            {summary.map(section => <Tooltip key={section.key} title={section.labels.join("、") || "未配置"}>
              <Tag color={section.key === "pages" ? "blue" : "gold"}>{section.key === "pages" ? "页面" : "操作"} {section.labels.length}</Tag>
            </Tooltip>)}
            <Button type="link" size="small" onClick={() => setPermissionTargetId(record.id)}>配置权限</Button>
          </div>
        );
      },
    },
    {
      title: "密码找回申请",
      key: "passwordRecovery",
      width: 210,
      render: (_: React.Key, record: User) => record.passwordResetRequest ? (
        <div className={styles.recoveryCell}>
          <Tag color="orange">待审核</Tag>
          <span>{new Date(record.passwordResetRequest.requestedAt).toLocaleString("zh-CN", { hour12: false })}</span>
          <div className={styles.actionRow}>
            <Popconfirm title={`确认已核实 ${record.name}（${record.username}）本人申请？`} description="通过后申请中的新密码生效，旧登录会话失效。" okText="确认通过" cancelText="取消" onConfirm={() => handleRecoveryReview(record, true)}>
              <Button size="small" type="primary" disabled={reviewingId !== null}>通过</Button>
            </Popconfirm>
            <Popconfirm title="驳回此密码找回申请？原密码继续有效。" okText="确认驳回" cancelText="取消" onConfirm={() => handleRecoveryReview(record, false)}>
              <Button size="small" danger disabled={reviewingId !== null}>驳回</Button>
            </Popconfirm>
          </div>
        </div>
      ) : "—",
    },
    {
      title: "操作",
      key: "action",
      render: (_: React.Key, record: User) => {
        if (record.role === "admin") return null;
        return (
          <div className={styles.actionRow}>
            {record.status === "pending" ? (
              <>
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
              </>
            ) : (
              <Button type="link" size="small" onClick={() => openResetModal(record)}>
                重置密码
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={4}>用户管理</Title>
        {users.some(user => user.passwordResetRequest) && <Tag color="orange">{users.filter(user => user.passwordResetRequest).length} 条密码找回待审核</Tag>}
        <Button size="small" loading={loading} onClick={() => void fetchUsers()}>刷新</Button>
      </div>
      <ResponsiveTable
        fitViewport
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        minWidth={1170}
      />
      <UserPermissionDrawer key={permissionUser?.id ?? "closed"} open={permissionUser !== null} user={permissionUser}
        onClose={() => setPermissionTargetId(null)} onChange={async (permission, enabled) => {
          if (permissionUser) await handleTogglePermission(permissionUser.id, permission, enabled);
        }} />
      <Modal
        title={`重置密码：${resetTarget?.name || ""}`}
        open={!!resetTarget}
        confirmLoading={resetting}
        onOk={handleResetPassword}
        onCancel={() => setResetTarget(null)}
        okText="确认重置"
        cancelText="取消"
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码至少 6 位" },
              { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: "需同时包含字母和数字" },
            ]}
          >
            <Input.Password placeholder="新密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            rules={[{ required: true, message: "请确认新密码" }]}
          >
            <Input.Password placeholder="确认密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
