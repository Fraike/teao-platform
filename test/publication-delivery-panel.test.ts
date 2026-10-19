import assert from "node:assert/strict";
import { test } from "node:test";
import "./standard-frontend-dom.ts";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { App, message } from "antd";
import { api } from "../src/lib/api.ts";
import { PublicationDeliveryPanel } from "../src/components/standard/PublicationDeliveryPanel.tsx";

test("uncertain publication requires explicit group verification before resuming", async () => {
  const oldGet = api.get, oldPost = api.post, oldSuccess = message.success;
  const delivery = { status: "unknown", versionId: "v1", revision: 4, sentParts: 1, totalParts: 2 };
  let posts = 0;
  api.get = (async () => ({ data: delivery })) as typeof api.get;
  api.post = (async (url: string, body: unknown) => {
    posts++; assert.equal(url, "/api/standards/s1/publication/retry");
    assert.deepEqual(body, { versionId: "v1", revision: 4, acknowledgeUncertain: true });
    return { data: { ...delivery, status: "sent", sentParts: 2, revision: 6 } };
  }) as typeof api.post;
  message.success = (() => undefined) as unknown as typeof message.success;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(App, null, createElement(PublicationDeliveryPanel, { standardId: "s1" }))));
    assert(document.body.textContent?.includes("结果不确定"));
    const retry = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("补发未确认部分"))!;
    await act(async () => { retry.click(); });
    assert.equal(posts, 0);
    assert(document.body.textContent?.includes("消息可能已经到群"));
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("已核查，继续发送"))!;
    await act(async () => { confirm.click(); });
    assert.equal(posts, 1); assert(document.body.textContent?.includes("群公告已发送"));
  } finally { await act(() => root.unmount()); api.get = oldGet; api.post = oldPost; message.success = oldSuccess; }
});
