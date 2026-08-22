import { useEffect, useState, useCallback } from "react";
import {
  Button, Tag, Input, Select, Space, Typography,
  Popconfirm, message, Tabs, Alert,
} from "antd";
import {
  PlusOutlined, SearchOutlined, ExportOutlined, UploadOutlined,
} from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { api } from "../lib/api";
import type { Employee } from "../types/employee";
import { EmployeeFormModal } from "../components/EmployeeFormModal";
import { EmployeeImportModal } from "../components/EmployeeImportModal";
import { ResponsiveTable } from "../components/ResponsiveTable";
import styles from "./EmployeePage.module.css";

const { Title } = Typography;

const DEPARTMENT_OPTIONS = [
  "装配部", "注塑部", "品质部", "生管部", "工程部",
  "行政部", "业务部", "财务部", "总经办", "其他",
];

export function EmployeePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reminders, setReminders] = useState<{ expired: number; expiring: number } | null>(null);

  useEffect(() => {
    api.get<{ expired: { length: number }; expiring: { length: number } }>("/api/employees/reminders")
      .then((r) => setReminders({ expired: r.expired.length, expiring: r.expiring.length }))
      .catch((err) => console.error("获取合同提醒失败:", err));
  }, []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Employee[]>("/api/employees");
      setEmployees(data);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmployees();
  }, [fetchEmployees]);

  const handleAdd = () => {
    setEditingEmployee(null);
    setModalOpen(true);
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/employees/${id}`);
      message.success("已标记为离职");
      fetchEmployees();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingEmployee(null);
  };

  const handleModalSuccess = () => {
    handleModalClose();
    fetchEmployees();
  };

  const handleExport = () => {
    const headers = ["姓名","工号","部门","职位","性别","手机号","入职日期","工龄","学历","合同到期","合同类型","出生日期","身份证号","是否住宿","合同起始","合同结束","家庭地址","身份证有效期"];
    const keys = ["name","employeeNo","department","position","gender","phone","entryDate","yearsOfService","education","contractEndDate","contractType","birthDate","idCard","dormitory","contractStartDate","contractEndDate","address","idCardExpiry"];

    const rows = filtered.map((e) =>
      keys.map((k) => {
        const v = (e as unknown as Record<string, unknown>)[k];
        if (typeof v === "boolean") return v ? "是" : "否";
        return v ?? "";
      })
    );

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const BOM = "﻿";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `员工名单_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("导出成功");
  };

  // Sort by employee number (TA-004 → extract numeric part)
  const sortedByNo = [...employees].sort((a, b) => {
    const numA = parseInt((a.employeeNo || "").replace(/\D/g, "")) || 9999;
    const numB = parseInt((b.employeeNo || "").replace(/\D/g, "")) || 9999;
    return numA - numB;
  });

  const filteredByStatus = sortedByNo.filter((e) => e.status === activeTab);

  const filtered = filteredByStatus.filter((e) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !e.name.toLowerCase().includes(s) &&
        !(e.employeeNo || "").toLowerCase().includes(s) &&
        !e.phone.includes(s)
      ) return false;
    }
    if (deptFilter && e.department !== deptFilter) return false;
    return true;
  });

  const columns: TableColumnsType<Employee> = [
    { title: "姓名", dataIndex: "name", key: "name", width: 80, fixed: "left" },
    { title: "工号", dataIndex: "employeeNo", key: "employeeNo", width: 90 },
    { title: "部门", dataIndex: "department", key: "department", width: 80,
      render: (d: string) => <Tag>{d}</Tag>,
    },
    { title: "职位", dataIndex: "position", key: "position", width: 110 },
    { title: "性别", dataIndex: "gender", key: "gender", width: 55 },
    { title: "出生日期", dataIndex: "birthDate", key: "birthDate", width: 105 },
    { title: "手机号", dataIndex: "phone", key: "phone", width: 125 },
    { title: "入职日期", dataIndex: "entryDate", key: "entryDate", width: 105 },
    { title: "工龄", dataIndex: "yearsOfService", key: "yearsOfService", width: 85 },
    { title: "学历", dataIndex: "education", key: "education", width: 65 },
    {
      title: "合同到期", dataIndex: "contractEndDate", key: "contractEndDate", width: 155,
      render: (_: string, record: Employee) => {
        const days = record.contractRemainingDays;
        if (days < 0) return <span className={styles.contractExpired}>⚠ 过期 {Math.abs(days)}天</span>;
        if (days <= 60) return <span className={styles.contractExpiring}>⚠ {record.contractEndDate} ({days}天)</span>;
        return <span className={styles.contractNormal}>{record.contractEndDate}</span>;
      },
    },
    { title: "合同类型", dataIndex: "contractType", key: "contractType", width: 85 },
    {
      title: "操作", key: "action", width: 130, fixed: "right",
      render: (_: unknown, record: Employee) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          {record.status === "active" && (
            <Popconfirm
              title="确认将该员工标记为离职？"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" danger size="small">离职</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: "active", label: "在职员工" },
    { key: "resigned", label: "离职员工" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={4} style={{ margin: 0 }}>员工管理</Title>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>导入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增员工
          </Button>
        </Space>
      </div>

      {reminders && (reminders.expired > 0 || reminders.expiring > 0) && (
        <Alert
          type={reminders.expired > 0 ? "error" : "warning"}
          showIcon
          message={
            reminders.expired > 0
              ? `合同到期提醒：${reminders.expired} 人合同已过期，${reminders.expiring} 人即将到期（60天内），请及时处理`
              : `合同到期提醒：${reminders.expiring} 人合同即将到期（60天内），请及时处理`
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems.map((t) => ({
          key: t.key,
          label: `${t.label} (${employees.filter(e => e.status === t.key).length})`,
        }))}
      />

      <div className={styles.filterBar}>
        <Input
          placeholder="搜索姓名/工号/手机号"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          placeholder="部门筛选"
          value={deptFilter}
          onChange={setDeptFilter}
          allowClear
          style={{ width: 140 }}
          options={DEPARTMENT_OPTIONS.map((d) => ({ label: d, value: d }))}
        />
      </div>

      <ResponsiveTable
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        minWidth={1400}
        size="middle"
        pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (t) => `共 ${t} 人` }}
      />

      <EmployeeFormModal
        open={modalOpen}
        employee={editingEmployee}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
      <EmployeeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false);
          void fetchEmployees();
        }}
      />
    </div>
  );
}
