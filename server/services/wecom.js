import { createWecomRateLimiter } from "./wecom-rate-limit.js";

const reserveMessageSlot = createWecomRateLimiter();

async function postWebhook(webhook, payload, { shouldSend } = {}) {
  try {
    await reserveMessageSlot(webhook);
    if (shouldSend && !shouldSend()) throw Object.assign(new Error("公告已停止发送"), { code: "SEND_CANCELLED" });
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("HTTP response not successful");
    const json = await res.json();
    if (!Number.isInteger(json.errcode)) throw new Error("Unrecognized response");
    if (json.errcode !== 0) {
      const error = new Error(`企业微信明确拒绝发送（错误码 ${json.errcode}）`);
      error.code = "SEND_REJECTED";
      error.status = 502;
      throw error;
    }
    return json;
  } catch (cause) {
    if (["SEND_REJECTED", "SEND_CANCELLED"].includes(cause.code)) throw cause;
    const error = new Error("发送结果不确定，请先核查企业微信群，勿直接重试");
    error.code = "SEND_RESULT_UNCERTAIN";
    error.status = 502;
    throw error;
  }
}

export async function sendWecomMessage(webhook, content, options) {
  return postWebhook(webhook, { msgtype: "markdown_v2", markdown_v2: { content } }, options);
}

/** 文本消息，支持 @ 群成员（mentionedUserids 为企业微信 userid 列表）。 */
export async function sendWecomText(webhook, content, mentionedUserids = [], options) {
  const mentioned = (Array.isArray(mentionedUserids) ? mentionedUserids : []).filter(Boolean);
  return postWebhook(webhook, {
    msgtype: "text",
    text: { content, mentioned_list: mentioned },
  }, options);
}
