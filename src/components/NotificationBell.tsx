import { useEffect, useState } from "react";
import { Badge, Button, Empty, List, Popover, Typography } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, getToken, isApiError } from "../lib/api";
import { useAuthStore } from "../lib/authStore";
import type { NotificationItem } from "../types/notification";
import styles from "./NotificationBell.module.css";

const { Text } = Typography;

/**
 * 右上角通用通知铃铛：聚合各业务线的待审核/待办/提醒，点击跳转到对应页面。
 * 对所有登录用户可见，具体能看到哪些通知由后端按权限过滤。
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = getToken();
  const sessionKey = JSON.stringify([token, user?.id, user?.role, user?.status, user?.name, user?.username, user?.permissions]);
  const [snapshot, setSnapshot] = useState<{
    owner: typeof user; sessionKey: string; items: NotificationItem[]; total: number;
  } | null>(null);
  const current = snapshot?.owner === user && snapshot?.sessionKey === sessionKey ? snapshot : null;
  const items = current?.items ?? [];
  const total = current?.total ?? 0;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const cancel = () => { controller?.abort(); controller = null; };
    const clear = () => setSnapshot({ owner: null, sessionKey: "", items: [], total: 0 });
    const fetchNotifications = async () => {
      if (disposed || useAuthStore.getState().user !== user) return;
      if (getToken() !== token) { clear(); return; }
      if (!user || !token || document.visibilityState === "hidden" || controller) return;
      const request = new AbortController();
      controller = request;
      try {
        const res = await api.get<{ ok: boolean; data: NotificationItem[]; total: number }>(
          "/api/notifications", { signal: request.signal },
        );
        if (disposed || request.signal.aborted || useAuthStore.getState().user !== user) return;
        if (getToken() !== token) { clear(); return; }
        if (res.ok) setSnapshot({ owner: user, sessionKey, items: res.data, total: res.total });
      } catch (err) {
        if (!disposed && !request.signal.aborted && useAuthStore.getState().user === user
          && isApiError(err) && (err.status === 401 || err.status === 403)) clear();
      } finally {
        if (controller === request) controller = null;
      }
    };
    const updateVisibility = () => {
      clearInterval(timer);
      timer = undefined;
      if (getToken() !== token) clear();
      if (document.visibilityState === "hidden") { cancel(); return; }
      void fetchNotifications();
      timer = setInterval(() => void fetchNotifications(), 30_000);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("storage", updateVisibility);
    updateVisibility();
    return () => {
      disposed = true;
      cancel();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("storage", updateVisibility);
    };
  }, [user, token, sessionKey]);

  const go = (link: string) => {
    setOpen(false);
    navigate(link);
  };

  const content =
    items.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
    ) : (
      <List
        size="small"
        className={styles.list}
        dataSource={items}
        renderItem={(it) => (
          <List.Item
            actions={[
              <a key="go" onClick={() => go(it.link)}>
                去处理
              </a>,
            ]}
          >
            <List.Item.Meta
              title={<Text strong>{it.title}</Text>}
              description={
                <Text type="secondary">
                  {it.description}
                  {it.time ? ` · ${new Date(it.time).toLocaleString("zh-CN", { hour12: false })}` : ""}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    );

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      title="通知"
      content={<>
        {content}
        {total > 20 && <>
          <Text type="secondary">共 {total} 条通知，仅展示最新 20 条</Text>
          <Button type="link" onClick={() => go("/product-standards?status=pending_review")}>查看标准审核</Button>
          {user?.role === "admin" && <Button type="link" onClick={() => go("/admin")}>查看用户管理</Button>}
        </>}
      </>}
    >
      <Badge count={total} size="small" offset={[-2, 2]}>
        <Button type="text" aria-label="通知" icon={<BellOutlined />} />
      </Badge>
    </Popover>
  );
}
