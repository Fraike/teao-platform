import { useTabPage, useTabBusy } from "../../lib/tabPageContext";
import { useRef, useState } from "react";
import { Alert, Button, Drawer, Switch, Tag, message } from "antd";
import type { User } from "../../types/auth";
import { USER_PERMISSION_SECTIONS } from "../../lib/userPermissions";
import styles from "./UserPermissionDrawer.module.css";

interface UserPermissionDrawerProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onChange: (permission: string, enabled: boolean) => Promise<void>;
}

export function UserPermissionDrawer({ open, user, onClose, onChange }: UserPermissionDrawerProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saving = useRef(false);
  const tab = useTabPage();
  useTabBusy(savingKey !== null);
  const change = async (key: string, enabled: boolean) => {
    if (saving.current || !user || user.role === "admin" || user.status !== "active") return;
    saving.current = true;
    setSavingKey(key);
    try { await onChange(key, enabled); }
    catch (error) { message.error((error as Error).message || "权限保存失败，请重试"); }
    finally { saving.current = false; setSavingKey(null); }
  };

  return (
    <Drawer getContainer={tab.container ?? undefined} title="配置权限" open={open} width={560} rootClassName={styles.drawer}
      onClose={() => { if (!saving.current) onClose(); }}
      footer={<div className={styles.footer}><span>{savingKey ? "正在保存…" : "开关变更后自动保存"}</span><Button disabled={savingKey !== null} onClick={onClose}>完成</Button></div>}>
      {user && <>
        <div className={styles.identity}>
          <div><strong>{user.name}</strong><span>{user.username}</span></div>
          <Tag color={user.status === "active" ? "green" : "orange"}>{user.status === "active" ? "已激活" : "待审核"}</Tag>
        </div>
        <Alert className={styles.notice} showIcon type="info" message="已激活账号默认可查看产品标准；新增与提交需单独授权。" />
        {USER_PERMISSION_SECTIONS.map(section => (
          <section key={section.key} className={styles.section} aria-label={section.title}>
            <header className={styles.sectionHeader}><h3>{section.title}</h3><p>{section.description}</p></header>
            {section.permissions.map(permission => {
              const checked = user.permissions.includes(permission.key);
              const unavailable = Boolean(permission.requires && !user.permissions.includes(permission.requires));
              const descriptionId = `permission-${user.id}-${permission.key}`;
              return <div key={permission.key} className={styles.permissionRow}>
                <div className={styles.permissionCopy}>
                  <div className={styles.permissionTitle}><span>{permission.label}</span>{unavailable && checked && <Tag>未生效</Tag>}</div>
                  <p id={descriptionId}>{permission.description}</p>
                </div>
                <Switch aria-label={permission.label} aria-describedby={descriptionId} checked={checked}
                  loading={savingKey === permission.key} disabled={(unavailable && !checked) || savingKey !== null || user.role === "admin" || user.status !== "active"}
                  onChange={enabled => { void change(permission.key, enabled); }} />
              </div>;
            })}
          </section>
        ))}
      </>}
    </Drawer>
  );
}
