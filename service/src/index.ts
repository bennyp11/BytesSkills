import OAuthProvider, {
  AuthorizationError,
  CimdFetchError,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { ApiError, json, ownerKey, readBody, type Env } from "./common";
import { Store } from "./store";
import { mcp, libraryResult } from "./mcp";
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const styles = `body{font:17px/1.6 system-ui;background:#f4f3ef;color:#222;margin:0;padding:8vh 24px}main{max-width:620px;margin:auto}h1{font-size:40px;letter-spacing:-1.4px}code{background:#e6e5e0;padding:4px 7px;border-radius:5px;overflow-wrap:anywhere}input[type=password]{box-sizing:border-box;width:100%;padding:14px;border:1px solid #aaa;border-radius:8px;font:inherit}button{padding:12px 20px;border:0;border-radius:8px;font:inherit;cursor:pointer;background:#202a23;color:white;margin:18px 8px 0 0}p{margin:18px 0}.muted{color:#666}label{display:block}`;
function html(body: string, headers = new Headers()) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  // Preserve Origin on same-origin form POSTs; suppress cross-origin referrers.
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BytesSkills</title><style>${styles}</style><main>${body}</main></html>`,
    { headers },
  );
}
async function authorize(req: Request, env: Env) {
  const oauth = env.OAUTH_PROVIDER;
  if (req.method === "GET") {
    const auth = await oauth.parseAuthRequest(req);
    const details = await oauth.describeConsent(auth);
    const consent = await oauth.beginConsent(auth);
    return html(
      `<p class="muted">BYTESSKILLS · PRIVATE WORKSPACE</p><h1>Connect ${escape(details.clientName)}</h1><p>${details.clientDomain ? "Client domain: <strong>" + escape(details.clientDomain) + "</strong>" : "This client registered itself; its name is not verified."}</p><p>Access returns to <strong>${escape(details.redirectHost)}</strong>.</p>${details.redirectIsLoopback ? "<p>This sends access to an app on your computer. Continue only if you started this connection.</p>" : ""}<form method="post"><input type="hidden" name="handle" value="${escape(consent.handle)}"><p>Enter your workspace access key to approve this connection.</p><input type="password" name="key" required autocomplete="current-password" aria-label="Workspace access key"><p>Permissions:</p><label><input type="checkbox" name="scope" value="bytes:read" checked> Read and search workspace content</label><label><input type="checkbox" name="scope" value="bytes:write" ${details.scope.includes("bytes:write") ? "checked" : ""}> Create artifacts and save revisions</label><label><input type="checkbox" name="scope" value="offline_access" checked> Stay connected using refresh tokens</label><button name="decision" value="approve">Connect</button><button name="decision" value="deny" formnovalidate>Cancel</button></form>`,
      consent.headers,
    );
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("Origin") !== env.BASE_URL)
    throw new ApiError(403, "Invalid form origin");
  const form = new URLSearchParams(await readBody(req, 16000)),
    handle = form.get("handle") ?? "";
  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(req, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }
  if (!(await ownerKey(form.get("key") ?? "", env)))
    throw new ApiError(
      401,
      "Invalid workspace access key. Go back and try again.",
    );
  const scopes = form.getAll("scope");
  if (!scopes.includes("bytes:read"))
    throw new ApiError(400, "Read permission is required");
  const approved = await oauth.approveConsent(req, handle, { scope: scopes });
  const { redirectTo } = await oauth.completeAuthorization({
    request: approved.request,
    userId: "owner",
    metadata: { workspace_id: env.WORKSPACE_ID },
    scope: approved.request.scope,
    props: { workspace_id: env.WORKSPACE_ID, scopes: approved.request.scope },
  });
  approved.headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers: approved.headers });
}
async function api(req: Request, env: Env) {
  if (
    !(await ownerKey(
      req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "",
      env,
    ))
  )
    return json({ error: "Owner bearer key required" }, 401);
  const url = new URL(req.url),
    s = new Store(env),
    p = url.pathname;
  if (req.method === "GET") {
    const ptr = url.searchParams.get("pointer") ?? "";
    if (p === "/v1/artifact")
      return json(
        await s.get(ptr, url.searchParams.get("content") !== "false"),
      );
    if (p === "/v1/query") {
      const args: any = Object.fromEntries(url.searchParams);
      if (args.limit) args.limit = Number(args.limit);
      return json(await s.query(args));
    }
    if (p === "/v1/history")
      return json(
        await s.history(
          ptr,
          Number(url.searchParams.get("after") ?? 0),
          Number(url.searchParams.get("limit") ?? 20),
        ),
      );
    if (p === "/v1/related")
      return json(
        await s.related(
          ptr,
          url.searchParams.get("after") ?? "",
          Number(url.searchParams.get("limit") ?? 20),
        ),
      );
    if (p === "/v1/export")
      return json(
        await s.export(
          url.searchParams.get("after") ?? "",
          Number(url.searchParams.get("limit") ?? 20),
          url.searchParams.has("snapshot")
            ? Number(url.searchParams.get("snapshot"))
            : undefined,
        ),
      );
    if (p === "/v1/library")
      return json(libraryResult(url.searchParams.get("path") ?? undefined));
    if (p === "/v1/content") {
      const r = await s.resolve(ptr);
      const blob = await env.BLOBS.get(s.objectKey(r.content.key));
      if (!blob) throw new ApiError(404, "Content missing");
      return new Response(blob.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          ETag: blob.httpEtag,
        },
      });
    }
    if (p === "/v1/grants")
      return json(
        await env.OAUTH_PROVIDER.listUserGrants("owner", {
          limit: 50,
          cursor: url.searchParams.get("cursor") ?? undefined,
        }),
      );
  }
  if (req.method === "POST" && p === "/v1/save")
    return json(await s.save(JSON.parse(await readBody(req))));
  if (req.method === "POST" && p === "/v1/import")
    return json(await s.importRecord(JSON.parse(await readBody(req))));
  if (req.method === "POST" && p === "/v1/revoke") {
    const data = JSON.parse(await readBody(req, 5000));
    if (typeof data.grant_id !== "string")
      throw new ApiError(400, "grant_id required");
    await env.OAUTH_PROVIDER.revokeGrant(data.grant_id, "owner");
    return json({ revoked: true });
  }
  if (req.method === "PUT" && /^\/v1\/blobs\/[a-f0-9]{64}$/.test(p)) {
    if (Number(req.headers.get("content-length")) > 10_000_000)
      throw new ApiError(413, "MVP upload limit is 10 MB");
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, "Body required");
    const parts: Uint8Array[] = [];
    let n = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > 10_000_000) {
        await reader.cancel();
        throw new ApiError(413, "MVP upload limit is 10 MB");
      }
      parts.push(value);
    }
    const all = new Uint8Array(n);
    let i = 0;
    for (const part of parts) {
      all.set(part, i);
      i += part.length;
    }
    return json(await s.putBlob(all, p.split("/").pop()));
  }
  return json({ error: "Not found" }, 404);
}
const provider = new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: {
    async fetch(req, env, ctx) {
      const props = ctx.props as {
        workspace_id?: string;
        scopes?: string[];
        owner?: boolean;
      };
      if (props.workspace_id !== env.WORKSPACE_ID)
        return json({ error: "Workspace access denied" }, 403);
      const auth = (ctx as unknown as { auth: { scope?: string[] } }).auth;
      const scopes = props.owner
        ? ["bytes:read", "bytes:write"]
        : (auth?.scope ?? []);
      if (!scopes.includes("bytes:read"))
        return json({ error: "Read permission required" }, 403);
      return mcp(req, env, scopes.includes("bytes:write"));
    },
  },
  defaultHandler: {
    async fetch(req, env) {
      const url = new URL(req.url);
      if (url.pathname === "/authorize") return authorize(req, env);
      if (url.pathname.startsWith("/v1/")) return api(req, env);
      if (url.pathname === "/health")
        return json({ service: "BytesSkills", version: "0.1.0", status: "ok" });
      if (url.pathname === "/")
        return html(
          `<p class="muted">BYTESSKILLS · MVP</p><h1>Your creative workspace,<br>across AI tools.</h1><p>Persistent concepts, hooks, scripts, and their history. Connect an AI client to your private workspace.</p><p>MCP endpoint</p><code>${escape(env.BASE_URL)}/mcp</code><p>Choose OAuth when connecting. Approve access with your workspace key.</p><p class="muted">Your content requires authentication. This service provides storage and workflow definitions; your AI supplies the creative work.</p>`,
        );
      return json({ error: "Not found" }, 404);
    },
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["bytes:read", "bytes:write", "offline_access"],
  requiredScopes: ["bytes:read"],
  resourceMetadata: {
    resource: "https://api.bytesskills.com/mcp",
    authorization_servers: ["https://api.bytesskills.com"],
  },
  clientIdMetadataDocumentEnabled: true,
  accessTokenTTL: 3600,
  refreshTokenTTL: 60 * 60 * 24 * 30,
  resolveExternalToken: async ({ token, env }) =>
    (await ownerKey(token, env))
      ? {
          props: { workspace_id: env.WORKSPACE_ID, owner: true },
          audience: `${env.BASE_URL}/mcp`,
        }
      : null,
});
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(req.url);
      if (url.hostname === "bytesskills.com") {
        if (url.pathname === "/")
          return html(
            `<p class="muted">BYTESSKILLS</p><h1>A shared home for your creative work.</h1><p>The private workspace MVP is running.</p><p><a href="https://api.bytesskills.com">Connect your AI tools →</a></p>`,
          );
        return Response.redirect(env.BASE_URL + url.pathname + url.search, 308);
      }
      const origin = req.headers.get("Origin");
      if (
        url.pathname.startsWith("/mcp") &&
        origin &&
        ![env.BASE_URL, "https://chatgpt.com", "https://claude.ai"].includes(
          origin,
        )
      )
        throw new ApiError(403, "Origin not allowed");
      // Bound all JSON/form payloads before the SDK/provider allocates them.
      if (req.method === "POST") {
        const body = await readBody(req);
        req = new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body,
        });
      }
      return await provider.fetch(req, env, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError || e instanceof SyntaxError)
        return json(
          {
            error: "Invalid request",
            details:
              e instanceof z.ZodError
                ? e.issues.map((x) => ({ path: x.path, message: x.message }))
                : undefined,
          },
          400,
        );
      if (e instanceof AuthorizationError) {
        // Report only known safe categories, never OAuth parameters or credentials.
        const description = e.description ?? "";
        const reason = description.includes("not started in this browser")
          ? "consent_cookie_missing"
          : description.includes("different browser session")
            ? "consent_cookie_mismatch"
            : description.includes("expired or was already used")
              ? "consent_expired"
              : description.includes("Missing transaction handle")
                ? "consent_handle_missing"
                : e.code;
        const messages: Record<string, string> = {
          consent_cookie_missing: "The authorization cookie is missing. Start Connect again and complete it in the same browser, allowing cookies for api.bytesskills.com.",
          consent_cookie_mismatch: "This form belongs to a different browser session. Start Connect again and complete it in the same browser.",
          consent_expired: "This authorization expired or was already submitted. Start a fresh Connect attempt from ChatGPT.",
          consent_handle_missing: "The authorization form is incomplete. Start a fresh Connect attempt from ChatGPT.",
        };
        console.warn("OAuth authorization rejected", reason);
        return json({ error: messages[reason] ?? "Authorization request rejected. Start a fresh connection from your AI client.", reason }, 400);
      }
      if (e instanceof CimdFetchError)
        return json({ error: "Could not verify the AI client's identity. Try connecting again shortly.", reason: "client_metadata_unavailable" }, 400);
      console.error(
        "Request failed",
        e instanceof Error ? e.message : "unknown",
      );
      return json({ error: "Internal service error" }, 500);
    }
  },
};
