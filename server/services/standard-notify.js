import { pushAllowed } from "./push-settings.ts";
import { capturePushGuard } from "./push-policy.ts";
import { readConfig } from "../config.js";
import { sendWecomText } from "./wecom.js";
import { findUserByName, getUserById } from "./users.js";
import { listCategories, getDB } from "./standard-store.js";
import { buildStandardPublication, splitStandardPublication } from "./standard-publication.js";
import { enqueueStandardPublication, publicationResponse } from "./standard-publication-outbox.js";
import { withPublicationQueue } from "./standard-notification-queue.js";
import { standardNotificationIdentity } from "./standard-notification-identity.js";
export { withPublicationQueue } from "./standard-notification-queue.js";

import { sendWecomAppText, appNotificationStatus } from './wecom-app.ts';
import { canDirectRetire } from './standard-retirement-permissions.js';

function validReviewer(user, submitterId, retirement = false) {
  return user?.status === 'active' && user.id !== submitterId && (retirement ? canDirectRetire(user) : user.role === 'admin' || user.permissions?.includes('engineering_review'));
}
async function sendPrivate(reviewerId, submitterId, content, guard, retirement = false) {
  if (!pushAllowed("standardReview")) return { status: "disabled", channel: "app" };
  const allowed = capturePushGuard("standardReview");
  const reviewer = getUserById(reviewerId);
  if (!validReviewer(reviewer, submitterId, retirement)) return { status: 'invalid_reviewer' };
  const binding = reviewer.wecomUserid;
  try {
    for (const part of splitStandardPublication(content, 1800)) await sendWecomAppText(binding, part, { shouldSend: () => {
      const current = getUserById(reviewerId);
      return allowed() && validReviewer(current, submitterId, retirement) && current.wecomUserid === binding && guard();
    } });
    return { status: 'sent', channel: 'app', recipientDelivered: true };
  } catch (error) { return { status: appNotificationStatus(error), channel: 'app' }; }
}

function stripMarkers(value) {
  return String(value ?? "").replace(/[▲*]/g, "").trim();
}

function resolveWebhook() {
  try {
    return readConfig().wecomWebhook || "";
  } catch (err) {
    console.error("[standards-notify] 读取企微配置失败，跳过提醒：", err.message);
    return "";
  }
}

function latestInfo(standard) {
  const version = standard?.versions?.[0] ?? null;
  return {
    serialNo: standard?.serialNo || "",
    customer: stripMarkers(version?.customer),
    model: version?.model || "",
    submitterName: version?.submittedBy || version?.createdBy || "",
    submitterId: version?.submittedById || "",
    reviewerId: version?.assignedReviewerId || "",
  };
}

// 待审消息只发送给指定审核人的自建应用账号。
export async function notifyReviewRequested(standard, submitter) {
  const version = standard.versions[0];
  const info = latestInfo(standard);
  const identity = standardNotificationIdentity(standard, version, new Map(listCategories().map(c => [c.key, c.name])));
  const content = `【产品标准待审核】\n${identity.details}\n版本：V${version.versionNo}\n提交人：${submitter.name}`;
  const guard = () => Boolean(getDB().prepare(`SELECT id FROM product_standard_versions WHERE id=? AND status='pending_review'
    AND assigned_reviewer_id=? AND submitted_at=? AND NOT EXISTS (SELECT 1 FROM product_standard_versions newer WHERE newer.standard_id=? AND newer.version_no>?)`)
    .get(version.id, info.reviewerId, version.submittedAt, standard.id, version.versionNo));
  return sendPrivate(info.reviewerId, info.submitterId || submitter.id, content, guard);
}

export async function notifyRetirementRequested(standard, request) {
  const version = standard.versions.find(v => v.id === request.versionId);
  const identity = standardNotificationIdentity(standard, version, new Map(listCategories().map(c => [c.key, c.name])));
  const content = `【申请停用 · 待审核】\n${identity.details}\n版本：V${version?.versionNo}\n申请人：${request.applicantName}\n停用原因：${request.reason}`;
  const guard = () => Boolean(getDB().prepare(`SELECT r.id FROM standard_retirement_requests r JOIN product_standard_versions v ON v.id=r.version_id
    WHERE r.id=? AND r.status='pending' AND r.reviewer_id=? AND r.revision=? AND v.status='published' AND v.revision=r.version_revision`)
    .get(request.id, request.reviewerId, request.revision));
  return sendPrivate(request.reviewerId, request.applicantId, content, guard, true);
}

// 审核结果：提醒提交人
export async function notifyReviewDone(standard, { approve, comment, reviewerName, directPublish = false }) {
  const webhook = resolveWebhook();
  if (approve) {
    const d = getDB();
    const id = enqueueStandardPublication(d, standard, standard.versions[0], listCategories().find(category => category.key === standard.categoryKey), { comment, reviewerName, directPublish });
    return publicationResponse(d, id, { webhook });
  }
  if (!pushAllowed("standardReview")) return { status: "disabled", sentParts: 0, totalParts: 0 };
  const allowed = capturePushGuard("standardReview");
  if (!webhook) return { status: "not_configured", sentParts: 0, totalParts: 0 };
  const info = latestInfo(standard);
  const submitter = info.submitterId ? getUserById(info.submitterId) : findUserByName(info.submitterName);
  const mentions = approve ? ["@all"] : submitter?.wecomUserid ? [submitter.wecomUserid] : [];
  const result = approve ? "已审核通过并发布" : "被驳回";
  const commentPart = !approve && comment ? ` 驳回意见：${comment}` : "";
  const content = approve ? buildStandardPublication(standard, standard.versions[0], listCategories().find(category => category.key === standard.categoryKey), { comment, reviewerName })
    : `【产品标准审核结果】序号 ${info.serialNo}「${info.customer} ${info.model}」${result}，审核人：${reviewerName}。${commentPart}`;
  const identity = [standard.serialNo, standard.versions[0].customer, standard.versions[0].model]
    .map(value => [...String(value || "").replace(/[\r\n]/g, " ")].slice(0, 30).join("")).join(" / ");
  const heading = `${identity} V${standard.versions[0].versionNo}`;
  const kind = approve ? "标准发布" : "审核结果";
  const reserve = Buffer.byteLength(`【${kind} ${heading} · 999999/999999】\n`, "utf8");
  const parts = splitStandardPublication(content, Math.min(1900, 2048 - reserve));
  let sentParts = 0;
  return withPublicationQueue(webhook, async () => {
    try {
      for (const [index, part] of parts.entries()) {
        const prefix = parts.length > 1 ? `【${kind} ${heading} · ${index + 1}/${parts.length}】\n` : "";
        await sendWecomText(webhook, prefix + part, index === 0 ? mentions : [], { channel: "standardReview", shouldSend: allowed });
        sentParts++;
      }
      return { status: "sent", sentParts, totalParts: parts.length, mentionedSubmitter: !approve && mentions.length > 0 };
    } catch (err) {
      console.error("[standards-notify] 审核结果提醒发送失败：", err.message);
      return { status: err.code === "PUSH_DISABLED" ? "disabled" : err.code === "SEND_REJECTED" ? "failed" : "unknown", sentParts, totalParts: parts.length };
    }
  });
}
