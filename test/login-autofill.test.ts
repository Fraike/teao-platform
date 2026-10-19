import assert from "node:assert/strict";
import { test } from "node:test";
import "./standard-frontend-dom.ts";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { App } from "antd";
import { LoginPage } from "../src/pages/LoginPage.tsx";
import { useAuthStore } from "../src/lib/authStore.ts";
import type { LoginRequest } from "../src/types/auth.ts";

test("login accepts password-manager DOM autofill without React change events", async () => {
  const original = useAuthStore.getState();
  let submitted: LoginRequest | null = null;
  useAuthStore.setState({ user: null, initialized: true, loading: false, login: async values => { submitted = values; } });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(App, null, createElement(LoginPage)))));
    const form = document.querySelector<HTMLFormElement>("form#login")!;
    assert.equal(form.method, "post");
    const username = form.elements.namedItem("username") as HTMLInputElement;
    const password = form.elements.namedItem("password") as HTMLInputElement;
    assert.equal(username.autocomplete, "username"); assert.equal(password.autocomplete, "current-password");
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(username, "autofill_user");
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(password, "Autofill123");
    // jsdom FormData must match the DOM realm rather than Node's fetch implementation.
    const originalFormData = globalThis.FormData;
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: window.FormData });
    try {
      await act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
      assert.deepEqual(submitted, { username: "autofill_user", password: "Autofill123", rememberLogin: false });
    } finally { Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData }); }
  } finally { await act(() => root.unmount()); useAuthStore.setState(original); }
});
