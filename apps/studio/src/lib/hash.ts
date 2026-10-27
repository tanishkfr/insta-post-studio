/**
 * SHA-256 over raw bytes, encoded as lowercase hex. Used for asset integrity and
 * content-addressed deduplication. Web Crypto is available in all target
 * browsers (including secure localhost development).
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is unavailable; secure asset hashing cannot run.");
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
