import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { test } from "node:test";
import { sha256Hex } from "../src/lib/sha256.ts";

test("HTTP fallback and native SHA-256 preserve source and identity hashes", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    for (const crypto of [webcrypto, undefined]) {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: crypto });
      for (const value of ["", "abc", "卫浴／盖\n座", "x".repeat(100000)]) {
        const bytes = new TextEncoder().encode(value);
        assert.equal(await sha256Hex(bytes), createHash("sha256").update(bytes).digest("hex"));
      }
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
  }
});
