import assert from "node:assert/strict";
import { test } from "node:test";
import "./standard-frontend-dom.ts";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { message } from "antd";
import { api, ApiError } from "../src/lib/api.ts";
import { StandardRemindButton } from "../src/components/standard/StandardRemindButton.tsx";

test("manual reminder exposes truthful delivery state, cooldown and request identity", async () => {
  const originalPost = api.post;
  const originals = { success: message.success, warning: message.warning, error: message.error };
  const notices: string[] = [];
  for (const key of ["success", "warning", "error"] as const) message[key] = ((content: unknown) => { notices.push(String(content)); }) as typeof message[typeof key];
  try {
    for (const status of ["sent", "not_configured", "unbound", "cancelled", "unknown", "cooldown"] as const) {
      const root = createRoot(document.getElementById("root")!);
      notices.length = 0;
      const retryAt = new Date(Date.now() + 300000).toISOString();
      let calls = 0;
      api.post = (async (url: string, body: unknown) => {
        calls++; assert.equal(url, "/api/standards/standard-1/remind"); assert.deepEqual(body, { versionNo: 3 });
        if (status === "cooldown") throw new ApiError("稍后再催", 429, "REMINDER_COOLDOWN", retryAt);
        return { ok: true, status, retryAt: ["not_configured", "unbound", "cancelled"].includes(status) ? undefined : retryAt, recipientDelivered: status === "sent" };
      }) as typeof api.post;
      try {
        await act(async () => root.render(createElement(StandardRemindButton, { standardId: "standard-1", versionNo: 3, serialNo: "SP-TEST" })));
        const button = document.querySelector<HTMLButtonElement>('button[aria-label="催促审核 SP-TEST"]')!;
        await act(async () => { button.click(); });
        assert.equal(calls, 1); assert.equal(button.disabled, !["not_configured", "unbound", "cancelled"].includes(status));
        assert.equal(notices.length, 1);
        if (status === "sent") assert(notices[0].includes("指定审核人") && notices[0].includes("应用"));
        if (status === "not_configured") assert(notices[0].includes("未发送"));
        if (status === "unbound") assert(notices[0].includes("未绑定") && notices[0].includes("未发送"));
        if (status === "cancelled") assert(notices[0].includes("已变化"));
        if (status === "unknown") assert(notices[0].includes("不确定"));
        if (status === "cooldown") assert(notices[0].includes("稍后再催"));
      } finally { await act(() => root.unmount()); }
    }
  } finally { api.post = originalPost; Object.assign(message, originals); }
});
