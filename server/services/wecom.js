export async function sendWecomMessage(webhook, content) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown_v2",
      markdown_v2: { content },
    }),
  });
  const json = await res.json();
  if (json.errcode !== 0) throw new Error(`WeCom error: ${json.errmsg}`);
  return json;
}
