import { timed } from './telemetry';
import { database, type Database, type Statement } from './database';
import { requireAccess, type WorkspaceAccess } from "./access";
import { z } from "zod";
import { ApiError, canonical, sha, type Env } from "./common";
import registry from "../../plugins/bytesskills-core/skills/bytes/contracts/runtime.json";
export const types = registry.artifact_types as [string, ...string[]];
const statuses = registry.statuses as [string, ...string[]];
const pointer = z.string().regex(new RegExp(
  "^@(" + types.join("|") + ")/[a-f0-9-]{8,36}(:v[1-9][0-9]*)?$",
));
const metadata = z.record(z.string().max(100), z.json());
const relations = z
  .object({
    inputs: z.array(pointer).max(50).optional(),
    derived_from: z.array(pointer).max(50).optional(),
    links: z.array(pointer).max(50).optional(),
    outputs: z.array(pointer).max(50).optional(),
  })
  .strict();
const contentSchema = z
  .object({
    key: z.string().regex(/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().min(0).max(10_000_000),
    media_type: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
  })
  .strict();
export const saveSchema = z
  .object({
    request_id: z.string().uuid(),
    type: z.enum(types).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    text: z.string().max(100_000).optional(),
    content: contentSchema.optional(),
    pointer: pointer.optional(),
    expected_revision: z.number().int().positive().optional(),
    status: z.enum(statuses).optional(),
    tags: z.array(z.string().min(1).max(100)).max(50).optional(),
    settings: metadata.optional(),
    provenance: metadata.optional(),
    parent: pointer.nullable().optional(),
    relations: relations.optional(),
  })
  .strict();
export const recordSchema = z
  .object({
    schema_version: z.literal(1),
    workspace_id: z.string().uuid(),
    type: z.enum(types),
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    pointer,
    previous_checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    title: z.string().min(1).max(500),
    status: z.enum(statuses),
    tags: z.array(z.string().max(100)).max(50),
    settings: metadata,
    provenance: metadata,
    parent: pointer.nullable(),
    relations,
    created_at: z.string().datetime({ offset: true }),
    record_key: z.string(),
    content: contentSchema,
    record_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RecordData = z.infer<typeof recordSchema>;
export const querySchema = z
  .object({
    type: z.enum(types).optional(),
    status: z.enum(statuses).optional(),
    format: z.string().max(100).optional(),
    tag: z.string().max(100).optional(),
    parent: pointer.optional(),
    text: z.string().max(300).optional(),
    after: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
export class Store {
  private db: Database;
  constructor(private env: Env, private access: WorkspaceAccess) {
    requireAccess(access);
    this.db = database(env, access);
  }
  objectKey(key: string) {
    if (!/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(key))
      throw new ApiError(400, "Invalid object key");
    return `${this.access.workspaceId}/${key}`;
  }
  async resolve(input: string): Promise<RecordData> {
    pointer.parse(input);
    const m = /^@([^/]+)\/([^:]+)(?::v(\d+))?$/.exec(input)!;
    const ids = await this.db.prepare(
      "SELECT id FROM heads WHERE workspace_id=? AND type=? AND id LIKE ? LIMIT 2",
    )
      .bind(this.access.workspaceId, m[1], m[2] + "%")
      .all<{ id: string }>();
    if (ids.results.length !== 1)
      throw new ApiError(
        ids.results.length ? 409 : 404,
        "Pointer missing or ambiguous",
      );
    const row = await (
      m[3]
        ? this.db.prepare(
            "SELECT record FROM revisions WHERE workspace_id=? AND id=? AND revision=?",
          ).bind(this.access.workspaceId, ids.results[0].id, Number(m[3]))
        : this.db.prepare(
            "SELECT r.record FROM heads h JOIN revisions r ON r.workspace_id=h.workspace_id AND r.pointer=h.pointer WHERE h.workspace_id=? AND h.id=?",
          ).bind(this.access.workspaceId, ids.results[0].id)
    ).first<{ record: string }>();
    if (!row) throw new ApiError(404, "Revision not found");
    return JSON.parse(row.record);
  }
  async get(input: string, include_content = false) {
    const record = await this.resolve(input);
    if (!include_content) return record;
    if (record.content.media_type.startsWith("text/"))
      return { ...record, text: await this.contentText(record.content) };
    return {
      ...record,
      download_path: `/v1/content?pointer=${encodeURIComponent(record.pointer)}`,
    };
  }
  async contentText(content: RecordData["content"]) {
    if (content.bytes > 300_000)
      throw new ApiError(413, "Text content too large");
    const blob = await timed("blob_get", () => this.env.BLOBS.get(this.objectKey(content.key)));
    if (!blob) throw new ApiError(409, "Missing content");
    const data = await timed("blob_read", () => blob.arrayBuffer());
    if (
      data.byteLength !== content.bytes ||
      (await sha(data)) !== content.sha256
    )
      throw new ApiError(409, "Content checksum mismatch");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      data,
    );
  }
  async putBlob(data: Uint8Array, expected?: string) {
    if (data.byteLength > 10_000_000)
      throw new ApiError(413, "MVP upload limit is 10 MB");
    const hash = await sha(data);
    if (expected && expected !== hash)
      throw new ApiError(409, "Content checksum mismatch");
    const key = `blobs/sha256/${hash.slice(0, 2)}/${hash}`;
    await timed("blob_put", () => this.env.BLOBS.put(this.objectKey(key), data, {
      sha256: hash,
      onlyIf: { etagDoesNotMatch: "*" },
      customMetadata: { sha256: hash },
    }));
    return { key, sha256: hash, bytes: data.byteLength };
  }
  async validateContent(content: RecordData["content"]) {
    if (
      content.key !==
      `blobs/sha256/${content.sha256.slice(0, 2)}/${content.sha256}`
    )
      throw new ApiError(400, "Content key mismatch");
    const obj = await timed("blob_head", () => this.env.BLOBS.head(this.objectKey(content.key)));
    if (
      !obj ||
      obj.size !== content.bytes ||
      obj.customMetadata?.sha256 !== content.sha256
    )
      throw new ApiError(409, "Upload verified content first");
    return content.media_type.startsWith("text/")
      ? this.contentText(content)
      : "";
  }
  async replay(id: string, fingerprint: string) {
    const row = await this.db.prepare(
      "SELECT fingerprint,pointer FROM requests WHERE workspace_id=? AND request_id=?",
    )
      .bind(this.access.workspaceId, id)
      .first<{ fingerprint: string; pointer: string }>();
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new ApiError(
        409,
        "Request ID already used with different arguments",
      );
    return this.resolve(row.pointer);
  }
  async save(raw: unknown, workflowId?: string, migrationId?: string) {
    const req = saveSchema.parse(raw);
    if (new TextEncoder().encode(canonical(req)).length > 250_000)
      throw new ApiError(413, "Metadata/content too large");
    const fingerprint = await sha(canonical(req));
    const replay = await this.replay(req.request_id, fingerprint);
    if (replay) return replay;
    const old = req.pointer ? await this.resolve(req.pointer) : undefined;
    if (
      old &&
      (req.expected_revision !== old.revision ||
        (await this.resolve(`@${old.type}/${old.id}`)).revision !==
          old.revision)
    ) {
      // An identical concurrent request may have committed after the first replay
      // lookup but before these reads. Return its receipt, not a false conflict.
      const duplicate = await this.replay(req.request_id, fingerprint);
      if (duplicate) return duplicate;
      throw new ApiError(409, "Revision conflict: reread latest");
    }
    if (!old && req.expected_revision !== undefined)
      throw new ApiError(400, "expected_revision requires pointer");
    if (req.text !== undefined && req.content)
      throw new ApiError(400, "Choose text or uploaded content");
    const type = req.type ?? old?.type;
    const title = req.title ?? old?.title;
    if (!type || !title)
      throw new ApiError(400, "New artifacts require type and title");
    if (old && old.type !== type)
      throw new ApiError(400, "Cannot change artifact type");
    if (['skill','format'].includes(type) && this.env.STORAGE_BACKEND !== 'postgres')
      throw new ApiError(400, 'Private definitions require the shared PostgreSQL workspace');
    const id = old?.id ?? (migrationId ? z.string().uuid().parse(migrationId) : crypto.randomUUID()),
      revision = (old?.revision ?? 0) + 1;
    const rawParent =
      req.parent === undefined ? (old?.parent ?? null) : req.parent;
    let parent: null | string = null;
    if (rawParent) {
      const p = await this.resolve(rawParent);
      if (type !== "concept" || p.type !== "concept")
        throw new ApiError(400, "Parent requires concepts");
      parent = `@concept/${p.id}`;
    }
    const pinned: RecordData["relations"] = {};
    for (const [kind, refs] of Object.entries(
      req.relations ?? old?.relations ?? {},
    )) {
      const out: string[] = [];
      for (const ref of refs ?? []) out.push((await this.resolve(ref)).pointer);
      (pinned as Record<string, string[]>)[kind] = [...new Set(out)];
    }
    const content =
      req.text !== undefined
        ? {
            ...(await this.putBlob(new TextEncoder().encode(req.text))),
            media_type: "text/markdown",
          }
        : (req.content ?? old?.content);
    if (!content) throw new ApiError(400, "text or content required");
    const body = await this.validateContent(content);
    const settings = req.settings ?? old?.settings ?? {};
    if (settings.format !== undefined && typeof settings.format !== "string")
      throw new ApiError(400, "settings.format must be a string");
    const record = {
      schema_version: 1 as const,
      workspace_id: this.access.workspaceId,
      type,
      id,
      revision,
      pointer: `@${type}/${id}:v${revision}`,
      previous_checksum: old?.record_checksum ?? null,
      title,
      status: req.status ?? old?.status ?? ("draft" as const),
      tags: [...new Set(req.tags ?? old?.tags ?? [])].sort(),
      settings,
      parent,
      relations: pinned,
      provenance: req.provenance ?? old?.provenance ?? {},
      created_at: new Date().toISOString(),
      record_key: `records/${type}/${id}/v${String(revision).padStart(8, "0")}.json`,
      content,
    };
    const complete = recordSchema.parse({
      ...record,
      record_checksum: await sha(canonical(record)),
    });
    try {
      await this.persist(
        complete,
        body,
        req.request_id,
        fingerprint,
        workflowId,
      );
    } catch (error) {
      const duplicate = await this.replay(req.request_id, fingerprint);
      if (duplicate) return duplicate;
      throw error;
    }
    return complete;
  }
  async persist(
    r: RecordData,
    body: string,
    requestId?: string,
    fingerprint?: string,
    workflowId?: string,
  ) {
    if (r.workspace_id !== this.access.workspaceId) throw new ApiError(403, "Workspace access denied");
    const db = this.db;
    const p = (sql: string, ...args: (string | number | null)[]) =>
      db.prepare(sql).bind(this.access.workspaceId, ...args);
    const batch: Statement[] = [];
    if (requestId)
      batch.push(
        p(
          "INSERT INTO requests VALUES (?,?,?,?,?)",
          requestId,
          fingerprint!,
          r.pointer,
          r.created_at,
        ),
      );
    batch.push(
      p(
        workflowId
          ? "INSERT INTO revisions(workspace_id,pointer,id,type,revision,checksum,record) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM workflow_sessions s LEFT JOIN skill_revocations v ON v.skill=s.skill AND v.version=s.version WHERE s.workspace_id=? AND s.id=? AND s.expires_at>? AND v.skill IS NULL)"
          : "INSERT INTO revisions(workspace_id,pointer,id,type,revision,checksum,record) VALUES (?,?,?,?,?,?,?)",
        r.pointer,
        r.id,
        r.type,
        r.revision,
        r.record_checksum,
        canonical(r),
        ...(workflowId ? [this.access.workspaceId, workflowId, new Date().toISOString()] : []),
      ),
    );
    if (workflowId) batch.push(p("INSERT INTO revision_workflows VALUES(?,?,?)", r.pointer, workflowId));
    batch.push(
      p(
        `INSERT INTO heads (workspace_id,id,pointer,type,revision,title,status,format,parent,updated) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET pointer=excluded.pointer,revision=excluded.revision,title=excluded.title,status=excluded.status,format=excluded.format,parent=excluded.parent,updated=excluded.updated`,
        r.id,
        r.pointer,
        r.type,
        r.revision,
        r.title,
        r.status,
        typeof r.settings.format === "string" ? r.settings.format : null,
        r.parent?.split("/")[1] ?? null,
        r.created_at,
      ),
    );
    batch.push(
      p("DELETE FROM tags WHERE workspace_id=? AND id=?", r.id),
      p("DELETE FROM search_documents WHERE workspace_id=? AND id=?", r.id),
      p(
        "INSERT INTO search_documents (workspace_id,id,title,body) VALUES (?,?,?,?)",
        r.id,
        r.title,
        body,
      ),
    );
    for (const tag of r.tags)
      batch.push(p("INSERT INTO tags VALUES (?,?,?)", r.id, tag));
    for (const [kind, refs] of Object.entries(r.relations))
      for (const target of refs ?? [])
        batch.push(
          p("INSERT INTO edges VALUES (?,?,?,?)", r.pointer, kind, target),
        );
    try {
      await db.batch(batch);
    } catch (e) {
      const msg = String(e);
      if (/revision_conflict|UNIQUE constraint|duplicate key/.test(msg))
        throw new ApiError(409, "Revision or request conflict; reread latest");
      if (/parent_cycle|invalid_parent|FOREIGN KEY|foreign key/.test(msg))
        throw new ApiError(409, "Invalid, cyclic or missing relationship");
      throw e;
    }
  }
  async importRecord(raw: unknown) {
    const r = recordSchema.parse(raw);
    const { record_checksum, ...rest } = r;
    if (
      r.workspace_id !== this.access.workspaceId ||
      (await sha(canonical(rest))) !== record_checksum
    )
      throw new ApiError(400, "Workspace or checksum mismatch");
    if (
      r.pointer !== `@${r.type}/${r.id}:v${r.revision}` ||
      r.record_key !==
        `records/${r.type}/${r.id}/v${String(r.revision).padStart(8, "0")}.json`
    )
      throw new ApiError(400, "Identity mismatch");
    const exists = await this.db.prepare(
      "SELECT checksum FROM revisions WHERE workspace_id=? AND pointer=?",
    )
      .bind(this.access.workspaceId, r.pointer)
      .first<{ checksum: string }>();
    if (exists) {
      if (exists.checksum !== r.record_checksum)
        throw new ApiError(409, "Immutable record conflict");
      return r;
    }
    if (r.revision === 1 && r.previous_checksum !== null)
      throw new ApiError(400, "Invalid initial checksum");
    if (r.parent) {
      const parent = await this.resolve(r.parent);
      if (r.parent !== `@concept/${parent.id}` || r.type !== "concept")
        throw new ApiError(400, "Invalid parent");
    }
    for (const refs of Object.values(r.relations))
      for (const ptr of refs ?? [])
        if ((await this.resolve(ptr)).pointer !== ptr)
          throw new ApiError(400, "Relations must be pinned");
    await this.persist(r, await this.validateContent(r.content));
    return r;
  }
  async query(raw: unknown) {
    const q = querySchema.parse(raw),
      terms: string[] = ["h.workspace_id=?"],
      args: (string | number)[] = [this.access.workspaceId];
    for (const col of ["type", "status", "format"] as const)
      if (q[col]) {
        terms.push(`h.${col}=?`);
        args.push(q[col]!);
      }
    if (!q.status) terms.push("h.status!='archived'");
    if (q.tag) {
      terms.push("h.id IN (SELECT id FROM tags WHERE workspace_id=h.workspace_id AND tag=?)");
      args.push(q.tag);
    }
    if (q.parent) {
      terms.push("h.parent=?");
      args.push((await this.resolve(q.parent)).id);
    }
    if (q.text) {
      const words = q.text.match(/[\p{L}\p{N}_]+/gu);
      if (!words?.length) throw new ApiError(400, "Search needs words");
      if (this.env.STORAGE_BACKEND === 'postgres') {
        terms.push("h.id IN (SELECT id FROM search_documents WHERE workspace_id=h.workspace_id AND document @@ plainto_tsquery('simple',?))");
        args.push(words.join(' '));
      } else {
        terms.push("h.id IN (SELECT id FROM search WHERE workspace_id=h.workspace_id AND search MATCH ?)");
        args.push(words.map((w) => '"' + w + '"').join(" AND "));
      }
    }
    if (q.after) {
      terms.push("h.id>?");
      args.push(q.after);
    }
    const rows = await this.db.prepare(
      `SELECT h.* FROM heads h ${terms.length ? "WHERE " + terms.join(" AND ") : ""} ORDER BY h.id LIMIT ?`,
    )
      .bind(...args, q.limit + 1)
      .all<{ id: string; pointer: string; title: string }>();
    return {
      items: rows.results.slice(0, q.limit),
      next_cursor:
        rows.results.length > q.limit ? rows.results[q.limit - 1].id : null,
    };
  }
  async history(input: string, after = 0, limit = 20) {
    if (
      !Number.isInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ApiError(400, "Invalid pagination");
    const r = await this.resolve(input);
    const rows = await this.db.prepare(
      "SELECT record FROM revisions WHERE workspace_id=? AND id=? AND revision>? ORDER BY revision LIMIT ?",
    )
      .bind(this.access.workspaceId, r.id, after, limit + 1)
      .all<{ record: string }>();
    const all = rows.results.map((x) => JSON.parse(x.record));
    return {
      items: all.slice(0, limit),
      next_cursor: all.length > limit ? all[limit - 1].revision : null,
    };
  }
  async related(input: string, after = "", limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApiError(400, "Invalid limit");
    const r = await this.resolve(input);
    const rows = await this.db.prepare(
      "SELECT source,kind,target,source||'|'||kind AS cursor FROM edges WHERE workspace_id=? AND target=? AND source||'|'||kind>? ORDER BY source,kind LIMIT ?",
    )
      .bind(this.access.workspaceId, r.pointer, after, limit + 1)
      .all<{ cursor: string }>();
    return {
      items: rows.results.slice(0, limit),
      next_cursor:
        rows.results.length > limit ? rows.results[limit - 1].cursor : null,
    };
  }
  async export(after = "", limit = 20, snapshot?: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApiError(400, "Invalid limit");
    if (snapshot === undefined)
      snapshot = (await this.db.prepare(
        "SELECT COALESCE(MAX(rowid),0) AS n FROM revisions WHERE workspace_id=?",
      ).bind(this.access.workspaceId).first<{ n: number }>())!.n;
    if (!Number.isSafeInteger(snapshot) || snapshot < 0)
      throw new ApiError(400, "Invalid snapshot");
    const rows = await this.db.prepare(
      "SELECT pointer,record FROM revisions WHERE workspace_id=? AND pointer>? AND rowid<=? ORDER BY pointer LIMIT ?",
    )
      .bind(this.access.workspaceId, after, snapshot, limit + 1)
      .all<{ pointer: string; record: string }>();
    return {
      workspace_id: this.access.workspaceId,
      snapshot,
      records: rows.results.slice(0, limit).map((x) => JSON.parse(x.record)),
      next_cursor:
        rows.results.length > limit ? rows.results[limit - 1].pointer : null,
    };
  }
}
