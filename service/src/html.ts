import {artifactRefreshScript} from './artifact-refresh';
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
input[type=password],input[type=email],input[name=q],input[name=title],input[readonly],textarea{box-sizing:border-box;max-width:100%;width:100%;font:16px Arial,sans-serif;padding:7px 9px;border:1px solid #888;border-radius:0;background:#fff;color:#222}
textarea{display:block;resize:vertical;margin-bottom:16px}img,video{max-width:100%;height:auto}audio{max-width:100%}.artifact-link{display:block}.artifact-link:hover{background:#f5f5f5}details{margin:12px 0}summary{cursor:pointer}
button{font:16px 'Times New Roman',serif;padding:6px 14px;margin:10px 8px 10px 0;cursor:pointer}
:focus-visible{outline:2px solid #551a8b;outline-offset:3px}
code{font:14px/1.5 monospace;overflow-wrap:anywhere}
pre{font:15px/1.6 monospace;white-space:pre-wrap;overflow-wrap:anywhere;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:14px 0}
input[readonly]{font:14px/1.5 monospace}.copy-row{display:flex;gap:8px;align-items:center;margin-bottom:14px}.copy-row input{min-width:0;flex:1}.copy-row button{flex-shrink:0;margin:0}.copy-status{margin:4px 0;font-size:15px}.copy-status:empty{display:none}.artifact-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.artifact-actions button{margin:0}.copy-primary{font-weight:bold;background:#551a8b;color:#fff;border:1px solid #551a8b}.copy-primary:hover{background:#3f126b}.copy-icon{width:16px;height:16px;vertical-align:-3px;margin-right:5px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.copy-options{margin:0}.copy-options summary{font:15px Arial,sans-serif;color:#551a8b;padding:6px;cursor:pointer}.copy-options[open]{padding:6px;border:1px solid #ddd}.copy-options button{display:block;margin:4px 0}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:16px 0}.filters label{margin:0;font-size:15px}.filters select,.filters input[name=format]{font:16px Georgia,serif;padding:5px;max-width:100%}.filters button{margin:0}.listing h2{font-size:18px;margin:0 0 4px}.listing p{margin:4px 0}.listing button{font-size:15px;padding:2px 8px;margin:4px 0 0 8px}.reference-details{margin-top:24px}
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
  enableCopy = false,
  enableArtifactRefresh = false,
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
  const nonce=(enableCopy||enableArtifactRefresh)?crypto.randomUUID().replaceAll("-", ""):null;
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; ${nonce ? `script-src 'nonce-${nonce}';` : ''} ${enableArtifactRefresh ? "connect-src 'self';" : ''} img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
  );
  // Preserve Origin on same-origin form POSTs; suppress cross-origin referrers.
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>bytesskills — your workspace</title><style>${styles}</style><body><main><header><p class="brand"><a href="https://bytesskills.com">bytesskills</a></p><p class="tagline">Your AI Coordination System</p></header>${body}${nonce?`<script nonce="${nonce}">${copyScript}${enableArtifactRefresh?artifactRefreshScript:""}</script>`:""}<footer><a href="https://bytesskills.com">bytesskills home</a> &nbsp;|&nbsp; your private workspace</footer></main></body></html>`,
    { headers },
  );
}

// Static code only: all copied content comes from escaped DOM text or values.
const copyScript = `document.querySelectorAll('time[datetime]').forEach(node=>{const date=new Date(node.dateTime);if(!Number.isNaN(date.valueOf()))node.textContent=date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});});
document.addEventListener('click', async event => {
 const button=event.target.closest('button[data-copy],button[data-copy-value]');if(!button)return;
 const field=button.dataset.copy?document.getElementById(button.dataset.copy):null;
 const value=field?(field.value??field.textContent):button.dataset.copyValue;
 const status=document.getElementById('copy-status');
 try {await navigator.clipboard.writeText(value);status.textContent=(button.dataset.label??'Reference')+' copied.';}
 catch {
  let selected=field;
  if(!selected||typeof selected.select!=='function'){
   document.querySelectorAll('.copy-fallback').forEach(e=>e.remove());
   selected=document.createElement('textarea');selected.readOnly=true;selected.className='copy-fallback';selected.setAttribute('aria-label','Text to copy');selected.value=value;button.parentElement.after(selected);
  }
  const details=selected.closest('details');if(details)details.open=true;
  selected.focus();selected.select();status.textContent='Selected. Press Ctrl+C or ⌘C, or use your device’s Copy menu.';
 }
});
document.querySelectorAll('input[readonly][data-reference]').forEach(field=>field.addEventListener('focus',()=>field.select()));`;
export const copyStatus=()=>`<p id="copy-status" class="muted copy-status" role="status" aria-live="polite"></p>`;
const clipboardIcon='<svg class="copy-icon" aria-hidden="true" viewBox="0 0 20 20"><rect x="6" y="5" width="11" height="13" rx="1.5"></rect><path d="M13 5V3.5A1.5 1.5 0 0 0 11.5 2h-8A1.5 1.5 0 0 0 2 3.5v11A1.5 1.5 0 0 0 3.5 16H6"></path></svg>';
export function copyButton(label:string,value:string,primary=false){return `<button type="button" class="${primary?'copy-primary':''}" data-copy-value="${escape(value)}" data-label="${escape(label)}">${clipboardIcon}${escape(label)}</button>`;}
export function copyContentButton(){return `<button type="button" data-copy="artifact-content" data-label="Content">${clipboardIcon}Copy content</button>`;}
export function copyAiButton(title:string,pointer:string,content?:string){
 const text=[
  'BytesSkills artifact',
  `Title: ${title}`,
  `Pointer: ${pointer}`,
  content===undefined?'If BytesSkills is connected to this workspace, retrieve this exact revision.':'Content:',
  ...(content===undefined?[]:[content]),
 ].join('\n');
 return copyButton('Copy for AI',text,true);
}
export function copyOptions(actions:string[]){return `<details class="copy-options"><summary>More copy options</summary>${actions.join('')}</details>`;}
export function artifactReferences(item:{id:string;type:string;pointer:string}) {
 const field=(id:string,label:string,value:string)=>`<label for="${id}">${label}</label><div class="copy-row"><input id="${id}" data-reference readonly value="${escape(value)}" spellcheck="false"><button type="button" data-copy="${id}" data-label="${label}" aria-label="Copy ${label.toLowerCase()}">copy</button></div>`;
 return `<details class="reference-details"><summary>Reference details</summary><p class="muted">Copy reference uses this exact revision. Use the latest reference to follow future edits.</p>`+
 field('artifact-reference','Artifact reference (latest)',`@${item.type}/${item.id}`)+field('revision-reference','Revision reference',item.pointer)+field('artifact-id','Artifact ID',item.id)+`</details>`;
}
