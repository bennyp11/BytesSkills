import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
export interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  BASE_URL: string;
  WORKSPACE_ID: string;
  OWNER_KEY_SHA256: string;
  RELEASE_VERSION?: string;
  RELEASE_COMMIT?: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function sha(
  data: string | ArrayBuffer | Uint8Array,
): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function ownerKey(key: string, env: Env) {
  if (!env.OWNER_KEY_SHA256 || key.length < 32 || key.length > 256)
    return false;
  const hash = await sha(key);
  let diff = 0;
  for (let i = 0; i < 64; i++)
    diff |= hash.charCodeAt(i) ^ env.OWNER_KEY_SHA256.charCodeAt(i);
  return diff === 0;
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function readBody(req: Request, limit = 300_000) {
  if (Number(req.headers.get("content-length")) > limit)
    throw new ApiError(413, "Request too large");
  if (!req.body) return "";
  const reader = req.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "Request too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(all);
}
