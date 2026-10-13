export const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const styles = `body{font:17px/1.6 system-ui;background:#f4f3ef;color:#222;margin:0;padding:8vh 24px}main{max-width:620px;margin:auto}h1{font-size:40px;letter-spacing:-1.4px}code{background:#e6e5e0;padding:4px 7px;border-radius:5px;overflow-wrap:anywhere}input[type=password]{box-sizing:border-box;width:100%;padding:14px;border:1px solid #aaa;border-radius:8px;font:inherit}button{padding:12px 20px;border:0;border-radius:8px;font:inherit;cursor:pointer;background:#202a23;color:white;margin:18px 8px 0 0}p{margin:18px 0}.muted{color:#666}label{display:block}`;
export function html(
  body: string,
  headers = new Headers(),
  validatedRedirectUri?: string,
) {
  // Chrome applies form-action to the OAuth redirect as well as the form POST.
  // Only accept a redirect already validated by the OAuth provider.
  const callbackOrigin = validatedRedirectUri
    ? new URL(validatedRedirectUri).origin
    : undefined;
  const formAction =
    callbackOrigin && callbackOrigin !== "null"
      ? `'self' ${callbackOrigin}`
      : "'self'";
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
  );
  // Preserve Origin on same-origin form POSTs; suppress cross-origin referrers.
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BytesSkills</title><style>${styles}</style><main>${body}</main></html>`,
    { headers },
  );
}
