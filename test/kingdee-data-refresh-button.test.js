import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const button = await vite.ssrLoadModule("/src/components/production/KingdeeDataRefreshButton.tsx").catch(() => null);
  assert.ok(button?.KingdeeDataRefreshButton, "装配和注塑应使用同一个更新按钮组件");
  const html = renderToStaticMarkup(React.createElement(button.KingdeeDataRefreshButton));
  assert.match(html, /更新金蝶数据/);
} finally {
  await vite.close();
}

console.log("Kingdee data refresh button tests passed.");
