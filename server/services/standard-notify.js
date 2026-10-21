import { readConfig } from "../config.js";
import { sendWecomText } from "./wecom.js";
import { listReviewers, findUserByName, getUserById } from "./users.js";
import { listCategories, getDB } from "./standard-store.js";
import { buildStandardPublication, splitStandardPublication } from "./standard-publication.js";
import { enqueueStandardPublication, publicationResponse } from "./standard-publication-outbox.js";
import { withPublicationQueue } from "./standard-notification-queue.js";
import { standardNotificationIdentity } from "./standard-notification-identity.js";
export { withPublicationQueue } from "./standard-notification-queue.js";

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

// 提交审核：提醒指定审核人；兼容旧未指定流程。
export async function notifyReviewRequested(standard, submitterName) {
  const webhook = resolveWebhook();
  if (!webhook) return;
  const info = latestInfo(standard);
  const mentions = (info.reviewerId ? [getUserById(info.reviewerId)].filter(Boolean) : listReviewers())
    .filter((r) => r.id !== submitterName.id)
    .map((r) => r.wecomUserid)
    .filter(Boolean);
  const reviewerName = standard?.versions?.[0]?.assignedReviewerName || (info.reviewerId && getUserById(info.reviewerId)?.name) || "未指定（历史任务）";
  const identity = standardNotificationIdentity(standard, standard.versions[0], new Map(listCategories().map(category => [category.key, category.name])));
  const content = `【产品标准待审核】\n${identity.details}\n提交人：${submitterName.name}\n指定审核人：${reviewerName}\n查看并审核：${identity.url}`;
  const parts = splitStandardPublication(content,1800);
  return withPublicationQueue(webhook,async () => {
    try {
      for (const [index,part] of parts.entries()) await sendWecomText(webhook,part,index===0?mentions:[]);
    } catch (err) {
      console.error("[standards-notify] 提交审核提醒发送失败：", err.message);
    }
  });
}

export async function notifyRetirementRequested(standard, request) {
  const webhook = resolveWebhook();
  if (!webhook) return { status: "not_configured" };
  const reviewer = getUserById(request.reviewerId);
  const version = standard.versions.find(v => v.id === request.versionId);
  const identity = standardNotificationIdentity(standard, version, new Map(listCategories().map(category => [category.key, category.name])));
  const content = `【申请停用 · 待审核】\n${identity.details}\n申请人：${request.applicantName}\n指定审核人：${request.reviewerName}\n停用原因：${request.reason}\n查看并处理：${identity.url}\n审核通过前，当前标准继续生效。`;
  const parts = splitStandardPublication(content,1800);
  return withPublicationQueue(webhook,async () => {
    try {
      for (const [index,part] of parts.entries()) await sendWecomText(webhook,part,index===0 && reviewer?.wecomUserid ? [reviewer.wecomUserid] : []);
      return {status:"sent",mentionedReviewer:Boolean(reviewer?.wecomUserid)};
    } catch(error) {return {status:error.code==="SEND_REJECTED"?"failed":"unknown"};}
  });
}

// 审核结果：提醒提交人
export async function notifyReviewDone(standard, { approve, comment, reviewerName, directPublish = false }) {
  const webhook = resolveWebhook();
  if (approve) {
    const d = getDB();
    const id = enqueueStandardPublication(d, standard, standard.versions[0], listCategories().find(category => category.key === standard.categoryKey), { comment, reviewerName, directPublish });
    return publicationResponse(d, id, { webhook });
  }
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
        await sendWecomText(webhook, prefix + part, index === 0 ? mentions : []);
        sentParts++;
      }
      return { status: "sent", sentParts, totalParts: parts.length, mentionedSubmitter: !approve && mentions.length > 0 };
    } catch (err) {
      console.error("[standards-notify] 审核结果提醒发送失败：", err.message);
      return { status: err.code === "SEND_REJECTED" ? "failed" : "unknown", sentParts, totalParts: parts.length };
    }
  });
}
