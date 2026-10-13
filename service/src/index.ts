import { observeMcp, timed, identifyRpc, oauthStarted, oauthAccepted } from './telemetry';
import { WorkspaceAccess } from "./access";
import OAuthProvider, {
  AuthorizationError,
  CimdFetchError,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { ApiError, json, ownerKey, releaseKey, readBody, type Env } from "./common";
import { Store } from "./store";
import { Releases } from "./releases";
import { mcp, libraryResult } from "./mcp";
import {escape,html} from "./html";
import {loginRoutes, browserSession, sessionCsrf, loginRedirect} from "./login";
async function authorize(req: Request, env: Env) {
  const oauth = env.OAUTH_PROVIDER;
  if (req.method === "GET") {
    const auth = await oauth.parseAuthRequest(req);
    const session = await browserSession(req, env);
    if (env.LOGIN_ENABLED === "true" && !session) return loginRedirect(new URL(req.url).pathname + new URL(req.url).search);
    const details = await oauth.describeConsent(auth);
    const consent = await oauth.beginConsent(auth);
    return html(
      `<p class="muted">BYTESSKILLS · PRIVATE WORKSPACE</p><h1>Connect ${escape(details.clientName)}</h1><p>${details.clientDomain ? "Client domain: <strong>" + escape(details.clientDomain) + "</strong>" : "This client registered itself; its name is not verified."}</p><p>Access returns to <strong>${escape(details.redirectHost)}</strong>.</p>${details.redirectIsLoopback ? "<p>This sends access to an app on your computer. Continue only if you started this connection.</p>" : ""}<form method="post"><input type="hidden" name="handle" value="${escape(consent.handle)}">${session ? `<input type="hidden" name="csrf" value="${session.csrf}"><p>Connect to your signed-in private workspace.</p>` : `<p>Enter your workspace access key to approve this connection.</p><input type="password" name="key" required autocomplete="current-password" aria-label="Workspace access key">`}<p>Permissions:</p><label><input type="checkbox" name="scope" value="bytes:read" checked> Read and search workspace content</label><label><input type="checkbox" name="scope" value="bytes:write" ${details.scope.includes("bytes:write") ? "checked" : ""}> Create artifacts and save revisions</label>${session ? "" : `<label><input type="checkbox" name="scope" value="bytes:manage"> Publish skill instructions for this workspace</label>`}<label><input type="checkbox" name="scope" value="offline_access" checked> Stay connected using refresh tokens</label><button name="decision" value="approve">Connect</button><button name="decision" value="deny" formnovalidate>Cancel</button></form>`,
      consent.headers,
      auth.redirectUri,
    );
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("Origin") !== env.BASE_URL)
    throw new ApiError(403, "Invalid form origin");
  const form = new URLSearchParams(await readBody(req, 16000)),
    handle = form.get("handle") ?? "";
  const session = await browserSession(req, env);
  if (env.LOGIN_ENABLED === "true") {
    if (!session) throw new ApiError(401, "Sign in again");
    sessionCsrf(req, env, form, session);
  }
  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(req, handle);
    return new Response(null, { status: 303, headers: denied.headers });
  }
  if (!session && !(await ownerKey(form.get("key") ?? "", env)))
    throw new ApiError(
      401,
      "Invalid workspace access key. Go back and try again.",
    );
  const scopes = form.getAll("scope");
  if (session && scopes.some(s=>!["bytes:read","bytes:write","offline_access"].includes(s)))
    throw new ApiError(403, "Scope not allowed");
  if (!scopes.includes("bytes:read"))
    throw new ApiError(400, "Read permission is required");
  const approved = await oauth.approveConsent(req, handle, { scope: scopes });
  const { redirectTo } = await oauth.completeAuthorization({
    request: approved.request,
    userId: session?.account_id ?? "owner",
    metadata: { workspace_id: session?.workspace_id ?? env.WORKSPACE_ID },
    scope: approved.request.scope,
    props: { workspace_id: session?.workspace_id ?? env.WORKSPACE_ID, ...(session ? {account_id:session.account_id} : {}), scopes: approved.request.scope },
  });
  approved.headers.set("Location", redirectTo);
  return new Response(null, { status: 303, headers: approved.headers });
}
async function api(req: Request, env: Env) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const isReleaseRoute = ["/v1/releases", "/v1/releases/revoke"].includes(new URL(req.url).pathname);
  const isOwner = await ownerKey(token, env);
  // Compatibility fallback only until the operator provisions a dedicated release key.
  const canPublish = env.RELEASE_KEY_SHA256 ? await releaseKey(token, env) : isOwner;
  if (isReleaseRoute ? !canPublish : !isOwner)
    return json({ error: isReleaseRoute ? "Release bearer key required" : "Owner bearer key required" }, 401);
  const access = await timed("membership", () => WorkspaceAccess.authorize(env, "legacy-owner", env.WORKSPACE_ID, true, isReleaseRoute && canPublish));
  if (
    req.method === "POST" &&
    new URL(req.url).pathname === "/v1/releases/revoke"
  )
    return json(
      await new Releases(env, access).revoke(JSON.parse(await readBody(req))),
    );
  if (req.method === "POST" && new URL(req.url).pathname === "/v1/releases")
    return json(
      await new Releases(env, access).publish(JSON.parse(await readBody(req))),
    );
  if (req.method === "GET" && new URL(req.url).pathname === "/v1/releases")
    return json({ releases: (await new Releases(env, access).rows()).map(r => ({skill: r.skill, version: r.version, checksum: r.checksum, revoked: r.revoked})) });
  const url = new URL(req.url),
    s = new Store(env, access),
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
      oauthAccepted();
      const props = ctx.props as {
        workspace_id?: string;
        scopes?: string[];
        owner?: boolean;
        account_id?: string;
      };
      // Existing signed grants without account_id remain confined to the original workspace.
      const legacy = props.account_id === undefined && props.workspace_id === env.WORKSPACE_ID;
      const access = await timed("membership", () => WorkspaceAccess.authorize(env,
        legacy ? "legacy-owner" : (props.account_id ?? ""), props.workspace_id ?? "",
        legacy, legacy && props.owner === true && !env.RELEASE_KEY_SHA256));
      const auth = (ctx as unknown as { auth: { scope?: string[] } }).auth;
      const scopes = legacy && props.owner
        ? ["bytes:read", "bytes:write", "bytes:manage"]
        : (auth?.scope ?? []);
      if (!scopes.includes("bytes:read"))
        return json({ error: "Read permission required" }, 403);
      return mcp(req, env, scopes, access);
    },
  },
  defaultHandler: {
    async fetch(req, env) {
      const url = new URL(req.url);
      const login = await loginRoutes(req, env);
      if (login) return login;
      if (url.pathname === "/authorize") return authorize(req, env);
      if (url.pathname.startsWith("/v1/")) return api(req, env);
      if (url.pathname === "/health")
        return json({ service: "BytesSkills", version: "0.2.0", status: "ok", login_mode: env.LOGIN_ENABLED === "true" ? "magic-link" : "owner-key", storage_contract: env.STORAGE_BACKEND === "postgres" ? "postgres-rls-v1" : "workspace-v1", release: env.RELEASE_VERSION ?? null, commit: env.RELEASE_COMMIT ?? null });
      if (url.pathname === "/")
        return html(
          `<p class="muted">BYTESSKILLS · MVP</p><h1>Your creative workspace,<br>across AI tools.</h1><p>Persistent concepts, hooks, scripts, and their history. Connect an AI client to your private workspace.</p><p>MCP endpoint</p><code>${escape(env.BASE_URL)}/mcp</code><p>Choose OAuth when connecting. Sign in with your invited email address to approve access.</p><p class="muted">Your content requires authentication. This service provides storage and workflow definitions; your AI supplies the creative work.</p>`,
        );
      return json({ error: "Not found" }, 404);
    },
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: [
    "bytes:read",
    "bytes:write",
    "bytes:manage",
    "offline_access",
  ],
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
const handler = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(req.url);
      if (env.APP_URL && url.origin === env.APP_URL && url.pathname === "/") return new Response(null,{status:303,headers:{Location:"/app"}});
      if (env.APP_URL && url.origin === env.APP_URL && !["/login","/app"].includes(url.pathname) && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/app/")) return json({error:"Not found"},404);
      if (url.hostname === "bytesskills.com") {
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
        const body = await timed("request_body", () => readBody(req));
        if (url.pathname === "/mcp") identifyRpc(body);
        req = new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body,
        });
      }
      oauthStarted();
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
          consent_cookie_missing:
            "The authorization cookie is missing. Start Connect again and complete it in the same browser, allowing cookies for api.bytesskills.com.",
          consent_cookie_mismatch:
            "This form belongs to a different browser session. Start Connect again and complete it in the same browser.",
          consent_expired:
            "This authorization expired or was already submitted. Start a fresh Connect attempt from ChatGPT.",
          consent_handle_missing:
            "The authorization form is incomplete. Start a fresh Connect attempt from ChatGPT.",
        };
        console.warn("OAuth authorization rejected", reason);
        return json(
          {
            error:
              messages[reason] ??
              "Authorization request rejected. Start a fresh connection from your AI client.",
            reason,
          },
          400,
        );
      }
      if (e instanceof CimdFetchError)
        return json(
          {
            error:
              "Could not verify the AI client's identity. Try connecting again shortly.",
            reason: "client_metadata_unavailable",
          },
          400,
        );
      console.error(
        "Request failed",
        e instanceof Error ? e.name : "unknown",
      );
      return json({ error: "Internal service error" }, 500);
    }
  },
};


export default {
  fetch(req:Request, env:Env, ctx:ExecutionContext) {
    return observeMcp(req, env.RELEASE_VERSION, () => handler.fetch(req,env,ctx));
  },
};
