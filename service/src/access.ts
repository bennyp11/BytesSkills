import { ApiError, type Env } from './common';

const issued = new WeakSet<object>();
/** Server-issued context. Never construct from a body, URL, pointer or header. */
export class WorkspaceAccess {
  private constructor(readonly accountId: string, readonly workspaceId: string,
    readonly canPublishCore: boolean) { issued.add(this); Object.freeze(this); }

  static async authorize(env: Env, accountId: string, workspaceId: string,
    legacyOwner = false, canPublishCore = false): Promise<WorkspaceAccess> {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(workspaceId)) throw new ApiError(403, 'Workspace access denied');
    const membership = await env.DB.prepare(`SELECT a.status FROM accounts a
      JOIN workspace_memberships m ON m.account_id=a.id
      WHERE a.id=? AND m.workspace_id=? AND m.status='active' AND m.role='owner'`)
      .bind(accountId,workspaceId).first<{status:string}>();
    const legacy = legacyOwner && accountId === 'legacy-owner' && workspaceId === env.WORKSPACE_ID;
    if (!membership || (membership.status !== 'active' && !(legacy && membership.status === 'unclaimed')))
      throw new ApiError(403,'Workspace access denied');
    if (canPublishCore && !legacy) throw new ApiError(403,'Core publication access denied');
    return new WorkspaceAccess(accountId,workspaceId,canPublishCore);
  }
}
export function requireAccess(access: WorkspaceAccess): WorkspaceAccess {
  if (!access || !issued.has(access)) throw new ApiError(403,'Authenticated workspace required');
  return access;
}
