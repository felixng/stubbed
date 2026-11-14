// The reservation caps object size. Enforce the same limit while reading,
// including when Storage supplies no Content-Length.
export async function readAsset(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error("Missing asset");

  const length = response.headers.get("content-length");
  const expected = length === null ? null : Number(length);
  const reader = response.body.getReader();
  try {
    if (expected !== null && (!Number.isSafeInteger(expected) || expected <= 0 || expected > maxBytes)) {
      throw new Error("Invalid asset length");
    }
    const bytes = new Uint8Array(expected ?? maxBytes);
    let count = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.byteLength > bytes.byteLength - count) throw new Error("Oversized asset");
      bytes.set(value, count);
      count += value.byteLength;
    }
    if (!count || (expected !== null && count !== expected)) throw new Error("Incomplete asset");
    return bytes.subarray(0, count);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
