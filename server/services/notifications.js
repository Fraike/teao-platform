import { initDB, listCategories, listPendingStandardNotifications } from "./standard-store.js";
import { listPasswordRecoveryRequests, listPendingRegistrations } from "./users.js";
import { standardNotificationIdentity } from "./standard-notification-identity.js";

initDB();

// 站内通知仅读取轻量 pending 索引，不加载标准详情或发送外部消息。
export function listNotificationsPage(user) {
  if (!user) return { total: 0, data: [] };
  const { total, items } = listPendingStandardNotifications(user, { limit: 20 });
  const names = new Map(listCategories().map(category => [category.key, category.name]));
  const data = items.map((item) => {
    const identity = standardNotificationIdentity(item, { ...item, status: item.kind === 'retirement' ? 'published' : 'pending_review' }, names);
    return {
      id: item.kind === "retirement" ? `standard_retirement:${item.requestId}` : `standard_review:${item.id}`,
      type: item.kind === "retirement" ? "standard_retirement" : "standard_review",
      title: item.kind === "retirement" ? "申请停用待审核" : "产品标准待审核",
      description: identity.description,
      time: item.updatedAt || "",
      link: identity.link,
    };
  });
  const recoveries = user.role === "admin" ? listPasswordRecoveryRequests().map(item => ({
    id: `password_recovery:${item.id}`, type: "password_recovery", title: "密码找回待审核",
    description: `${item.name} · ${item.username}`, time: item.requestedAt, link: "/admin",
  })) : [];
  const registrations = user.role === "admin" ? listPendingRegistrations().map(item => ({
    id: `user_registration:${item.id}`, type: "user_registration", title: "新用户待审核",
    description: `${item.name} · ${item.username}`, time: item.createdAt, link: "/admin",
  })) : [];
  return { total: total + recoveries.length + registrations.length,
    data: [...registrations, ...recoveries, ...data].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20) };
}

// 保持旧调用方的数组返回值；同样限制为轻量首页。
export function listNotifications(user) {
  return listNotificationsPage(user).data;
}
