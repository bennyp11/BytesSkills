export const agentInstructions = `# Connect BytesSkills

Configure this user's AI client to use the remote MCP endpoint:
https://api.bytesskills.com/mcp
Transport: Streamable HTTP. Authentication: OAuth through the client.

First identify the client: Claude web/Desktop, Claude Code, or another MCP host.
Inspect existing connections before adding one; reuse a matching BytesSkills endpoint.
Do not overwrite an unrelated connection with the same name or replace existing config.

For Claude Code with an available CLI, inspect with claude mcp list. If absent, run:
claude mcp add --transport http --scope user bytesskills https://api.bytesskills.com/mcp
Then have the user open /mcp in Claude Code and authenticate BytesSkills.
User scope makes the connection available across that user's projects on this machine.

For Claude web/Desktop, use Customize > Connectors > Add custom connector.
Name: BytesSkills. URL: https://api.bytesskills.com/mcp.
Use OAuth sign-in. If the client needs registration, use automatic registration.
If you cannot change connector settings, explain these exact manual steps.
The user must complete email sign-in and review consent themselves. Use the same
BytesSkills email as on their other devices to reach the same workspace.
Never ask for an owner key, email login link, password, or access token in chat.
Do not copy credentials between devices or commit them to a repository.

After authorization, inspect available BytesSkills tools and call bytes_workspace
once to verify workspace access. For help, call bytes_begin with command /bytes help
and a fresh UUID request_id. Do not create or modify an artifact just to test setup.
Report the verified workspace and any missing tools; do not claim success based only
on a saved config. If tools are absent, explain how to enable/reconnect the connector.

/bytes is conversational shorthand, not a guaranteed native slash command.
The user can instead say: Use BytesSkills to show help or find my saved artifacts.
Other clients must support remote Streamable HTTP MCP and OAuth. Use their supported
configuration interface; if unavailable, give manual steps rather than inventing one.
`;
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const docs=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BytesSkills — connect your AI</title><meta name="description" content="Connect BytesSkills to Claude with agent setup instructions and manual OAuth installation steps."><style>
body{max-width:760px;margin:40px auto;padding:0 24px;background:#fff;color:#222;font:18px/1.5 Georgia,'Times New Roman',serif}a{color:#551a8b}h1{color:#551a8b}h2{font-size:24px}nav,footer{font-size:15px}hr{border:0;border-top:1px solid #ccc;margin:28px 0}pre{background:#f5f5f5;border:1px solid #ccc;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 monospace}code{overflow-wrap:anywhere}li{margin:10px 0}a:focus-visible{outline:2px solid #551a8b;outline-offset:3px}
</style></head><body><main><nav><a href="/">← bytesskills</a> | <a href="https://app.bytesskills.com">open workspace</a> | <a href="/docs/install.md">agent instructions (plain text)</a></nav>
<h1>connect your AI</h1><p>Connect once in each AI service. Sign in with the same BytesSkills email to use your existing workspace, skills, and artifacts.</p>
<p>Remote MCP server:</p><pre><code>https://api.bytesskills.com/mcp</code></pre>
<nav aria-label="Documentation sections"><a href="#claude">Claude</a> | <a href="#code">Claude Code</a> | <a href="#agent">ask an agent</a> | <a href="#verify">verify &amp; troubleshoot</a></nav><hr>
<section id="claude"><h2>Claude web or Desktop</h2><ol><li>Open Claude's <strong>Customize → Connectors</strong> (some versions place Connectors in Settings).</li><li>Choose <strong>Add → Add custom connector</strong>. Enter <strong>BytesSkills</strong> and the server URL above.</li><li>Keep OAuth authentication. Connect and complete BytesSkills email sign-in and consent. If prompted for OAuth client details, choose automatic registration rather than entering a secret.</li><li>Enable the connector in your conversation and try the verification prompt below.</li></ol><p>Team or Enterprise administrators may need to add the connector for the organization first. Each user then signs in individually. For a remote connector, use this interface rather than editing Desktop's local-server configuration.</p><p><a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude's current connector instructions</a></p></section><hr>
<section id="code"><h2>Claude Code</h2><p>Run in a terminal with Claude Code installed:</p><pre><code>claude mcp add --transport http --scope user bytesskills https://api.bytesskills.com/mcp</code></pre><p>Then open <code>/mcp</code> inside Claude Code and authenticate BytesSkills. This is a user-level connection on that machine. Check <code>claude mcp list</code> before adding it again.</p><p><a href="https://code.claude.com/docs/en/mcp">Claude Code MCP documentation</a></p></section><hr>
<section id="agent"><h2>let an agent help</h2><p>Copy this prompt into your agent. It can configure supported tools; you complete sign-in and consent. If it cannot access settings, it should guide you through the manual steps.</p><pre><code>Read https://bytesskills.com/docs/install.md and help me connect BytesSkills to this AI client. Reuse an existing connection if present, let me complete OAuth sign-in, and verify access with a read-only tool call.</code></pre><details><summary>Full agent setup instructions</summary><pre><code>${escape(agentInstructions)}</code></pre></details></section><hr>
<section id="verify"><h2>check the connection</h2><pre><code>Use the BytesSkills connector to check which workspace I am signed into, then show BytesSkills help. Do not create anything.</code></pre><p><code>/bytes</code> is conversational shorthand. A client may not register it as a slash command; ordinary language works when the connector tools are enabled.</p><ul><li><strong>No BytesSkills tools?</strong> Enable the connector for the conversation, reconnect if needed, and try a new chat. A saved connection alone does not prove authorization succeeded.</li><li><strong>Wrong or empty workspace?</strong> Check that you signed into BytesSkills with the same email used on your other device.</li><li><strong>Sign-in expired?</strong> Start a fresh connection flow. Do not reuse an old authorization URL or email link.</li><li><strong>Missing tools after an update?</strong> Use the host's supported refresh or reconnect flow. Report the missing tool names rather than inventing an action.</li></ul><p>For other AI hosts, use their remote HTTP MCP configuration with OAuth. No Git clone, owner key, or shared API token is required. Connection setup does not install computer-control or image-generation capabilities into a host that lacks them.</p></section>
<footer><hr>Instructions checked October 21, 2026. Client menus can change.</footer></main></body></html>`;
