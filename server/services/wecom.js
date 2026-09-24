export async function sendWecomMessage(webhook, content) {
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ msgtype: "markdown_v2", markdown_v2: { content } }),
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
    if (cause.code === "SEND_REJECTED") throw cause;
    const error = new Error("发送结果不确定，请先核查企业微信群，勿直接重试");
    error.code = "SEND_RESULT_UNCERTAIN";
    error.status = 502;
    throw error;
  }
}
