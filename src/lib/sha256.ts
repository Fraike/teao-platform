/** HTTP 局域网页面可能没有 SubtleCrypto，保留同一 SHA-256 结果。 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const digest = subtle
    ? new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes).buffer))
    : (await import("@noble/hashes/sha2.js")).sha256(bytes);
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
