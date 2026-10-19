import { lazy, Suspense, useState } from "react";
import { Button, Tooltip } from "antd";
import { CommentOutlined } from "@ant-design/icons";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "../../lib/authStore";
import { getNavigationItem } from "../../lib/navigation";
import styles from "./Feedback.module.css";

const FeedbackDrawer = lazy(() => import("./FeedbackDrawer").then(module => ({ default: module.FeedbackDrawer })));

export function FeedbackEntry({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore(state => state.user);
  const location = useLocation();
  if (!user) return null;
  return <div className={styles.entry}>
    <Tooltip title={collapsed ? "问题与建议" : undefined} placement="right">
      <Button className={`${styles.entryButton} ${collapsed ? styles.collapsed : ""}`} type="text" icon={<CommentOutlined />} aria-label="问题与建议" onClick={() => { setMounted(true); setOpen(true); }}>
        {!collapsed && "问题与建议"}
      </Button>
    </Tooltip>
    {mounted && <Suspense fallback={null}><FeedbackDrawer key={user.id} open={open} onClose={() => setOpen(false)}
      pagePath={location.pathname} pageTitle={getNavigationItem(location.pathname)?.title || "当前页面"} /></Suspense>}
  </div>;
}
