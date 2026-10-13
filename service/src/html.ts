export const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const styles = `
html{color-scheme:light}
body{margin:48px 24px;background:#fff;color:#222;font:18px/1.5 Georgia,'Times New Roman',serif}
main{max-width:670px;margin:auto}
.brand{margin:0;font:bold 38px/1.1 'Times New Roman',serif;letter-spacing:-1px}
.brand a{color:#551a8b;text-decoration:none}
.tagline{margin:8px 0 0}
header{border-bottom:1px solid #ccc;padding-bottom:22px;margin-bottom:24px}
h1{font-size:25px;line-height:1.25;letter-spacing:0;margin:20px 0 16px;padding:5px 9px;background:#eee;border-top:1px solid #ccc;border-bottom:1px solid #ccc}
h2{font-size:20px;margin:24px 0 12px}
a{color:#551a8b}a:hover{color:#0000ee}
p{margin:16px 0}label{display:block;margin-bottom:7px}
input[type=password],input[type=email],input[name=q],input[name=title],textarea{box-sizing:border-box;max-width:100%;width:100%;font:16px Arial,sans-serif;padding:7px 9px;border:1px solid #888;border-radius:0;background:#fff;color:#222}
textarea{display:block;resize:vertical;margin-bottom:16px}img,video{max-width:100%;height:auto}audio{max-width:100%}.artifact-link{display:block}.artifact-link:hover{background:#f5f5f5}details{margin:12px 0}summary{cursor:pointer}
button{font:16px 'Times New Roman',serif;padding:6px 14px;margin:10px 8px 10px 0;cursor:pointer}
:focus-visible{outline:2px solid #551a8b;outline-offset:3px}
code{font:14px/1.5 monospace;overflow-wrap:anywhere}
pre{font:15px/1.6 monospace;white-space:pre-wrap;overflow-wrap:anywhere;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:14px 0}
nav,footer,.muted{font-size:15px}.muted,footer{color:#666}
.workspace-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid #ccc;padding-bottom:12px}
.workspace-nav form{margin:0}.workspace-nav button{margin:0;font-size:15px;padding:2px 8px}
nav{display:flex;gap:12px;flex-wrap:wrap}
.listing{padding:10px 0;margin:0;border-bottom:1px solid #ddd}.listing code{color:#666}
section{border-bottom:1px solid #ddd;padding-bottom:10px}
footer{border-top:1px solid #ccc;margin-top:32px;padding-top:14px}
@media(max-width:420px){body{margin:28px 20px}.brand{font-size:34px}h1{font-size:23px}.workspace-nav{align-items:flex-start}}
`;
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
    `default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
  );
  // Preserve Origin on same-origin form POSTs; suppress cross-origin referrers.
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>bytesskills — your workspace</title><style>${styles}</style><body><main><header><p class="brand"><a href="https://bytesskills.com">bytesskills</a></p><p class="tagline">Your AI Coordination System</p></header>${body}<footer><a href="https://bytesskills.com">bytesskills home</a> &nbsp;|&nbsp; your private workspace</footer></main></body></html>`,
    { headers },
  );
}
