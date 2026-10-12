import { database } from './database';
import { ApiError, type Env } from './common';

/** Internal identity adapter entry point. Caller MUST verify provider issuer/subject.
 * This is deliberately not exposed as an HTTP/MCP registration endpoint.
 * Email never links accounts; an existing identity is never reassigned.
 */
export async function provisionVerifiedIdentity(env: Env, issuer: string, subject: string) {
  if (!issuer.startsWith('https://') || issuer.length > 2048 || !subject || subject.length > 512)
    throw new ApiError(400, 'Invalid verified identity');
  if (env.STORAGE_BACKEND === 'postgres') {
    const row = await database(env, undefined, 'identity').prepare(
      'SELECT * FROM provision_identity(?,?,?,?)').bind(issuer,subject,crypto.randomUUID(),crypto.randomUUID())
      .first<{account_id:string;workspace_id:string}>();
    if (!row) throw new ApiError(403,'Account unavailable');
    return row;
  }
  const accountId = crypto.randomUUID(), workspaceId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO accounts(id,status) SELECT ?,'active'
      WHERE NOT EXISTS (SELECT 1 FROM account_identities WHERE issuer=? AND subject=?)`)
      .bind(accountId,issuer,subject),
    env.DB.prepare(`INSERT INTO workspace(id,name) SELECT ?,'My workspace'
      WHERE EXISTS (SELECT 1 FROM accounts WHERE id=?)`).bind(workspaceId,accountId),
    env.DB.prepare(`INSERT INTO workspace_memberships(workspace_id,account_id,role,status)
      SELECT ?,?,'owner','active' WHERE EXISTS (SELECT 1 FROM accounts WHERE id=?)`)
      .bind(workspaceId,accountId,accountId),
    env.DB.prepare(`INSERT INTO account_identities(issuer,subject,account_id)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM accounts WHERE id=?)`)
      .bind(issuer,subject,accountId,accountId),
  ]);
  const row = await env.DB.prepare(`SELECT a.id AS account_id,m.workspace_id FROM account_identities i
    JOIN accounts a ON a.id=i.account_id JOIN workspace_memberships m ON m.account_id=a.id
    WHERE i.issuer=? AND i.subject=? AND a.status='active' AND m.status='active' AND m.role='owner'
    ORDER BY m.workspace_id LIMIT 2`).bind(issuer,subject).all<{account_id:string;workspace_id:string}>();
  if (row.results.length !== 1) throw new ApiError(403,'Account unavailable');
  return row.results[0];
}
