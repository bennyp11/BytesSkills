import { database, type Database, type Statement } from './database';
import { requireAccess, type WorkspaceAccess } from "./access";
import { z } from "zod";
import { ApiError, canonical, sha, type Env } from "./common";
import registry from "../../plugins/bytesskills-core/skills/bytes/contracts/runtime.json";
import { Definitions, definitionPointer, privateExecutionInstructions, type DefinitionSnapshot } from './definitions';
export const skills = Object.keys(registry.skills) as [keyof typeof registry.skills, ...(keyof typeof registry.skills)[]];
const skillSchema = z.enum(skills);
export const releaseSchema = z
  .object({
    skill: skillSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    summary: z.string().min(1).max(2000),
    protocol: z.literal(1),
    required_scopes: z
      .array(z.enum(["bytes:read", "bytes:write", "bytes:manage"]))
      .min(1)
      .max(3),
    instructions: z.string().min(1).max(50000),
    resources: z.record(z.string().max(200), z.string().max(100000)),
  })
  .strict();
export const publishSchema = z
  .object({ releases: z.array(releaseSchema).min(1).max(20) })
  .strict();
export const beginSchema = z
  .object({
    request_id: z.string().uuid(),
    command: z.string().trim().min(1).max(16000),
    skill_pointer: definitionPointer.optional(),
    format_pointers: z.array(definitionPointer).max(20).optional(),
  })
  .strict();
export const adoptSchema = z
  .object({
    request_id: z.string().uuid(),
    expected_revision: z.number().int().nonnegative(),
    catalog_hash: z.string().regex(/^[a-f0-9]{64}$/),
    skill: skillSchema.optional(),
    action: z.enum(["update", "keep", "auto", "ask", "sync"]),
  })
  .strict();
type Release = z.infer<typeof releaseSchema>;
type Row = {
  skill: string;
  version: string;
  sequence: number;
  checksum: string;
  payload: string;
  revoked: string | null;
};
type State = {
  revision: number;
  selections: Record<string, string>;
  policies: Record<string, string>;
  dismissed: Record<string, string>;
};
export function commandSkill(command: string): (typeof skills)[number] {
  if (!/^\/bytes(?:\s|$)/.test(command))
    throw new ApiError(400, "Use the /bytes namespace");
  const words = command.trim().split(/\s+/);
  const verb = words[1] ?? "help";
  if (verb === "--help" || verb === "help" || words.includes("--help"))
    return "help";
  const map = Object.fromEntries(Object.entries(registry.skills).flatMap(
    ([skill, spec]) => spec.commands.map(command => [command, skill as (typeof skills)[number]]),
  ));
  if (!Object.hasOwn(map, verb))
    throw new ApiError(400, "Unknown /bytes command; use /bytes help");
  return map[verb];
}
export class Releases {
  private db: Database;
  constructor(private env: Env, private access: WorkspaceAccess) {
    requireAccess(access);
    this.db = database(env, access);
  }
  async revoke(raw: unknown) {
    if (!this.access.canPublishCore) throw new ApiError(403, "Core publication access denied");
    const r = z
      .object({
        skill: skillSchema,
        version: z.string(),
        reason: z.string().min(1).max(1000),
      })
      .strict()
      .parse(raw);
    const exists = (await this.rows()).find(
      (x) => x.skill === r.skill && x.version === r.version,
    );
    if (!exists) throw new ApiError(404, "Release not found");
    if (exists.revoked) return { revoked: true };
    await database(this.env, undefined, 'publisher').prepare("INSERT INTO skill_revocations VALUES(?,?,?)")
      .bind(r.skill, r.version, r.reason)
      .run();
    return { revoked: true };
  }
  async state(): Promise<State> {
    const r = await this.db.prepare(
      "SELECT * FROM library_state WHERE workspace_id=?",
    ).bind(this.access.workspaceId).first<any>();
    if (!r) throw new ApiError(403, "Workspace state unavailable");
    return {
      revision: r.revision,
      selections: JSON.parse(r.selections),
      policies: JSON.parse(r.policies),
      dismissed: JSON.parse(r.dismissed),
    };
  }
  async rows() {
    return (
      await this.db.prepare(
        "SELECT r.*,v.reason AS revoked FROM skill_releases r LEFT JOIN skill_revocations v ON v.skill=r.skill AND v.version=r.version ORDER BY r.skill,r.sequence",
      ).all<Row>()
    ).results;
  }
  async verified(row: Row): Promise<Release> {
    const p = releaseSchema.parse(JSON.parse(row.payload));
    if ((await sha(canonical(p))) !== row.checksum)
      throw new ApiError(409, "Skill release integrity check failed");
    return p;
  }
  async catalog() {
    const rows = await this.rows();
    const hash = await sha(
      canonical(rows.map((r) => [r.skill, r.version, r.checksum, r.revoked])),
    );
    return { rows, hash };
  }
  async updates() {
    const state = await this.state(),
      { rows, hash } = await this.catalog();
    const items = await Promise.all(
      skills.map(async (skill) => {
        const available = rows.filter((r) => r.skill === skill && !r.revoked),
          latest = available.at(-1);
        const selected = rows.find(
          (r) => r.skill === skill && r.version === state.selections[skill],
        );
        return {
          skill,
          selected: selected?.version ?? null,
          latest: latest?.version ?? null,
          policy: state.policies[skill] ?? "ask",
          dismissed: state.dismissed[skill] ?? null,
          revoked: selected?.revoked ?? null,
          summary: latest ? (await this.verified(latest)).summary : null,
        };
      }),
    );
    return {
      state_revision: state.revision,
      catalog_hash: hash,
      skills: items,
    };
  }
  async publish(raw: unknown) {
    if (!this.access.canPublishCore) throw new ApiError(403, "Core publication access denied");
    const db = database(this.env, undefined, 'publisher');
    const { releases } = publishSchema.parse(raw);
    if (new TextEncoder().encode(canonical(releases)).length > 250000)
      throw new ApiError(413, "Release batch too large");
    if (new Set(releases.map((r) => r.skill)).size !== releases.length)
      throw new ApiError(400, "One release per skill per batch");
    const rows = await this.rows(),
      statements = [];
    for (const r of releases) {
      const payload = canonical(r),
        checksum = await sha(payload),
        old = rows.find((x) => x.skill === r.skill && x.version === r.version);
      if (old) {
        if (old.checksum !== checksum)
          throw new ApiError(
            409,
            "Published versions are immutable; use a new version",
          );
        continue;
      }
      const last = rows.filter((x) => x.skill === r.skill).at(-1);
      if (last) {
        const a = r.version.split(".").map(Number),
          b = last.version.split(".").map(Number);
        const delta = a.findIndex((n, i) => n !== b[i]);
        if (delta < 0 || a[delta] < b[delta])
          throw new ApiError(409, "New release version must increase");
      }
      const seq =
        Math.max(
          0,
          ...rows.filter((x) => x.skill === r.skill).map((x) => x.sequence),
        ) + 1;
      statements.push(
        db.prepare(
          "INSERT INTO skill_releases(skill,version,sequence,checksum,payload,published_at) VALUES(?,?,?,?,?,?)",
        ).bind(
          r.skill,
          r.version,
          seq,
          checksum,
          payload,
          new Date().toISOString(),
        ),
      );
    }
    if (statements.length) await db.batch(statements);
    return {
      published: releases.map((r) => ({ skill: r.skill, version: r.version })),
    };
  }
  async adopt(raw: unknown, scopes: string[]) {
    const a = adoptSchema.parse(raw),
      fingerprint = await sha(canonical(a));
    const receipt = await this.db.prepare(
      "SELECT fingerprint,result FROM library_decisions WHERE workspace_id=? AND request_id=?",
    )
      .bind(this.access.workspaceId, a.request_id)
      .first<any>();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new ApiError(409, "Request ID reused with different decision");
      return JSON.parse(receipt.result);
    }
    if (!scopes.includes("bytes:write"))
      throw new ApiError(
        403,
        "Write permission required to change version preferences",
      );
    const state = await this.state(),
      { rows, hash } = await this.catalog();
    if (state.revision !== a.expected_revision || hash !== a.catalog_hash)
      throw new ApiError(
        409,
        "Library changed; check updates again before deciding",
      );
    if ((a.action === "sync") === Boolean(a.skill))
      throw new ApiError(
        400,
        "Sync targets all skills; other actions require one skill",
      );
    const targets = a.action === "sync" ? [...skills] : [a.skill!];
    for (const skill of targets) {
      const latest = rows.filter((r) => r.skill === skill && !r.revoked).at(-1);
      if (!latest) throw new ApiError(409, "No published release for " + skill);
      if (a.action === "keep") {
        if (!state.selections[skill])
          throw new ApiError(409, "No selected version to keep");
        state.dismissed[skill] = latest.version;
        state.policies[skill] = "ask";
      } else if (a.action === "ask") {
        state.policies[skill] = "ask";
        delete state.dismissed[skill];
      } else {
        const r = await this.verified(latest);
        if (r.required_scopes.some((s) => !scopes.includes(s)))
          throw new ApiError(
            403,
            "Reconnect with required permissions before adopting " + skill,
          );
        state.selections[skill] = latest.version;
        delete state.dismissed[skill];
        if (a.action === "auto") state.policies[skill] = "auto";
      }
    }
    const result = {
      state_revision: state.revision + 1,
      selections: state.selections,
      policies: state.policies,
    };
    // Trigger checks expected revision inside this atomic transaction. No lost updates.
    try {
      await this.db.batch([
        this.db.prepare(
          "UPDATE library_state SET revision=?,selections=?,policies=?,dismissed=? WHERE workspace_id=?",
        ).bind(
          state.revision + 1,
          canonical(state.selections),
          canonical(state.policies),
          canonical(state.dismissed),
          this.access.workspaceId,
        ),
        this.db.prepare(
          "INSERT INTO library_decisions VALUES(?,?,?,?,?)",
        ).bind(
          this.access.workspaceId,
          a.request_id,
          fingerprint,
          canonical(result),
          new Date().toISOString(),
        ),
      ]);
    } catch (e) {
      const retry = await this.db.prepare(
        "SELECT fingerprint,result FROM library_decisions WHERE workspace_id=? AND request_id=?",
      )
        .bind(this.access.workspaceId, a.request_id)
        .first<any>();
      if (retry?.fingerprint === fingerprint) return JSON.parse(retry.result);
      throw new ApiError(
        409,
        "Adoption conflict; refresh updates before deciding again",
      );
    }
    return result;
  }
  async begin(raw: unknown, scopes: string[]) {
    const a = beginSchema.parse(raw),
      fingerprint = await sha(canonical(a));
    const old = await this.db.prepare(
      "SELECT * FROM workflow_sessions WHERE workspace_id=? AND id=?",
    )
      .bind(this.access.workspaceId, a.request_id)
      .first<any>();
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw new ApiError(409, "Request ID reused with different command");
      return this.session(old, scopes);
    }
    const definitions = new Definitions(this.env,this.access);
    const snapshot = await definitions.snapshot(a.skill_pointer,a.format_pointers??[]);
    if(a.skill_pointer && !/^\/bytes run(?:\s|$)/.test(a.command))
      throw new ApiError(400,'Use /bytes run for an explicitly selected private skill');
    const skill = snapshot.skill?.definition.base_skill ?? commandSkill(a.command);
    if(snapshot.formats.length && !registry.skills[skill].can_save)
      throw new ApiError(400,'Private formats apply to creative workflows');
    let state = await this.state();
    const { rows, hash } = await this.catalog();
    let selected = rows.find(
      (r) => r.skill === skill && r.version === state.selections[skill],
    );
    const latest = rows.filter((r) => r.skill === skill && !r.revoked).at(-1);
    if (!latest) throw new ApiError(409, "Skill not published");
    if (!selected || selected.version !== latest.version) {
      if (selected && !selected.revoked && state.policies[skill] === "auto") {
        const previous = await this.verified(selected),
          next = await this.verified(latest);
        // Automatic preference never expands privileges, even when the caller has them.
        if (
          next.required_scopes.every((s) =>
            previous.required_scopes.includes(s),
          ) &&
          scopes.includes("bytes:write")
        ) {
          await this.adopt(
            {
              request_id: crypto.randomUUID(),
              expected_revision: state.revision,
              catalog_hash: hash,
              skill,
              action: "auto",
            },
            scopes,
          );
          selected = latest;
          state = await this.state();
        }
      }
      if (
        !selected ||
        selected.revoked ||
        (selected.version !== latest.version &&
          state.dismissed[skill] !== latest.version)
      )
        return {
          status: "update_available",
          skill,
          current: selected?.version ?? null,
          latest: latest.version,
          summary: (await this.verified(latest)).summary,
          state_revision: state.revision,
          catalog_hash: hash,
          choices:
            selected && !selected.revoked
              ? ["update", "keep", "auto"]
              : ["update"],
          instruction:
            "Ask the user which version to use. Do not generate or save until they decide. Apply their choice with bytes_adopt, then retry bytes_begin with the same request_id. A /bytes sync --latest request authorizes one bulk adoption after bytes_updates; do not ask per skill.",
        };
    }
    if (selected.revoked)
      throw new ApiError(409, "Selected skill release has been revoked");
    const now = new Date(),
      session = {
        id: a.request_id,
        fingerprint,
        skill,
        version: selected.version,
        command: a.command,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 86400000).toISOString(),
        definition_snapshot: snapshot.skill||snapshot.formats.length ? canonical(snapshot) : null,
      };
    const response = await this.session(session, scopes);
    try {
      await this.db.prepare(
        session.definition_snapshot
          ? "INSERT INTO workflow_sessions(workspace_id,id,fingerprint,skill,version,command,created_at,expires_at,definition_snapshot) VALUES(?,?,?,?,?,?,?,?,?)"
          : "INSERT INTO workflow_sessions(workspace_id,id,fingerprint,skill,version,command,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          this.access.workspaceId,
          session.id,
          fingerprint,
          skill,
          session.version,
          session.command,
          session.created_at,
          session.expires_at,
          ...(session.definition_snapshot ? [session.definition_snapshot] : []),
        )
        .run();
    } catch (e) {
      const retry = await this.db.prepare(
        "SELECT * FROM workflow_sessions WHERE workspace_id=? AND id=?",
      )
        .bind(this.access.workspaceId, session.id)
        .first<any>();
      if (retry?.fingerprint === fingerprint)
        return this.session(retry, scopes);
      throw new ApiError(409, "Workflow request conflict");
    }
    return response;
  }
  async session(session: any, scopes: string[]) {
    const row = (await this.rows()).find(
      (r) => r.skill === session.skill && r.version === session.version,
    );
    if (!row || row.revoked)
      throw new ApiError(
        409,
        "Workflow release unavailable or revoked; start again",
      );
    if (Date.parse(session.expires_at) <= Date.now())
      throw new ApiError(409, "Workflow expired; begin again");
    const release = await this.verified(row);
    if (release.required_scopes.some((s) => !scopes.includes(s)))
      throw new ApiError(403, "Workflow requires additional permissions");
    const snapshot:DefinitionSnapshot|null=session.definition_snapshot?JSON.parse(session.definition_snapshot):null;
    if(snapshot)await new Definitions(this.env,this.access).verifySnapshot(snapshot);
    return {
      status: "ready",
      workflow_id: session.id,
      skill: row.skill,
      version: row.version,
      checksum: row.checksum,
      expires_at: session.expires_at,
      instructions: snapshot?.skill ? privateExecutionInstructions : release.instructions + (snapshot?.formats.length ? '\nUse the attached private format snapshots for this request instead of similarly named core formats. Their pinned revisions are authoritative for the selected format.' : ''),
      resources: release.resources,
      ...(snapshot ? {private_definitions:snapshot} : {}),
    };
  }
  async provenance(id: string, scopes: string[], outputType?:string) {
    const session = await this.db.prepare(
      "SELECT * FROM workflow_sessions WHERE workspace_id=? AND id=?",
    )
      .bind(this.access.workspaceId, id)
      .first<any>();
    if (!session)
      throw new ApiError(409, "Unknown workflow; call bytes_begin first");
    const r = await this.session(session, scopes);
    if (!registry.skills[session.skill as keyof typeof registry.skills]?.can_save)
      throw new ApiError(403, "This workflow cannot save artifacts");
    if(r.private_definitions?.skill&&outputType&&outputType!=='run'&&
      !r.private_definitions.skill.definition.contract.outputs.some((o:any)=>o.artifact_type===outputType))
      throw new ApiError(400,'Output type is not declared by the private skill contract');
    return {
      workflow_id: id,
      skill: r.skill,
      version: r.version,
      checksum: r.checksum,
      ...(r.private_definitions ? {private_definitions: {
        skill:r.private_definitions.skill ? {pointer:r.private_definitions.skill.pointer,checksum:r.private_definitions.skill.checksum} : null,
        formats:r.private_definitions.formats.map(f=>({pointer:f.pointer,checksum:f.checksum})),
      }} : {}),
    };
  }
}
