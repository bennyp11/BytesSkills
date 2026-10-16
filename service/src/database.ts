import { timed } from './telemetry';
import pg from 'pg';
import { ApiError, type Env } from './common';

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{results:T[]}>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export interface Principal { accountId: string; workspaceId: string; legacyOwner?: boolean }
export type DatabaseRole = 'runtime' | 'publisher' | 'identity';

/** D1 is only the pre-cutover compatibility backend. Never fail over to it. */
export function database(env: Env, principal?: Principal, role: DatabaseRole = 'runtime'): Database {
  if (env.STORAGE_BACKEND === undefined || env.STORAGE_BACKEND === 'd1') {
    if (!env.DB) throw new ApiError(503, 'Database binding unavailable');
    return env.DB;
  }
  if (env.STORAGE_BACKEND !== 'postgres') throw new ApiError(503, 'Unsupported storage backend');
  const binding = role === 'publisher' ? env.PUBLISHER_DB : role === 'identity' ? env.IDENTITY_DB : env.POSTGRES;
  if (!binding) throw new ApiError(503, 'Database binding unavailable');
  return new PostgresDatabase(binding.connectionString, principal, role);
}

/** Only translates parameter markers, never SQL dialect or untrusted SQL. */
export function postgresParameters(sql: string): string {
  let n = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? `$${++n}` : token);
}

export class PostgresDatabase implements Database {
  constructor(private connectionString: string, private principal?: Principal,
    private role: DatabaseRole = 'runtime') {}
  prepare(sql: string): Statement { return new PostgresStatement(this, sql); }
  async batch(statements: Statement[]) {
    if (statements.some(s => !(s instanceof PostgresStatement) || s.db !== this))
      throw new Error('Statements must belong to the same database context');
    return this.execute(statements as PostgresStatement[]);
  }
  async execute(statements: PostgresStatement[]) {
    // One client per operation; Hyperdrive provides the pool. Never retain a client
    // across Worker requests, and never set identity outside this transaction.
    const client = new pg.Client({connectionString: this.connectionString, connectionTimeoutMillis: 10000});
    try {
      await timed("db_connect", () => client.connect());
      await timed("db_setup", async () => {
        // One simple-query exchange for fixed SQL only. PostgreSQL runs these in
        // order and stops on error; BEGIN keeps the transaction open afterward.
        // Identity values stay in the separate parameterized query below.
        await client.query(`BEGIN;
          SET LOCAL search_path = bytes, pg_catalog;
          SET LOCAL statement_timeout = '15s';
          SET LOCAL lock_timeout = '5s';`);
        const check = await client.query(`SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,
          EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='bytes' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_data,
          (SELECT count(*)=17 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity)
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bytes'
            AND c.relname IN ('accounts','account_identities','workspace_memberships','workspace','revisions','heads',
              'tags','edges','requests','library_state','library_decisions','workflow_sessions','revision_workflows','search_documents','private_skills','media_uploads','media_upload_parts')) AS rls_ready
          FROM pg_roles WHERE rolname=current_user`);
        const r = check.rows[0];
        if (r?.name !== `bytes_${this.role}` || r.rolsuper || r.rolbypassrls || r.rolcreaterole || r.owns_data)
          throw new Error('Unsafe database runtime role');
        if (!r.rls_ready) throw new Error('Workspace row security is unavailable');
        await client.query(`SELECT set_config('bytes.account_id',$1,true),
          set_config('bytes.workspace_id',$2,true),set_config('bytes.legacy_owner',$3,true)`,
          [this.principal?.accountId ?? '', this.principal?.workspaceId ?? '', this.principal?.legacyOwner ? 'true' : 'false']);
        // Publishers serialize with adoption writes. Tenant writes serialize within
        // one workspace, closing revision/parent-cycle races without global writes.
        await client.query(this.role === 'publisher'
          ? 'SELECT pg_advisory_xact_lock(17491,1)'
          : 'SELECT pg_advisory_xact_lock_shared(17491,1)');
        const writing = statements.some(s => !/^\s*SELECT\b/i.test(s.sql));
        if (writing && this.principal)
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [this.principal.workspaceId]);
      });
      const results = [];
      for (const s of statements) {
        const result = await timed("db_query", () => client.query(postgresParameters(s.sql), s.values));
        results.push({results:result.rows, meta:{changes:result.rowCount ?? 0}});
      }
      await timed('db_commit', () => client.query('COMMIT'));
      return results;
    } catch (error) {
      await timed('db_rollback', () => client.query('ROLLBACK')).catch(() => {});
      throw error;
    } finally { await timed("db_close", () => client.end()); }
  }
}
class PostgresStatement implements Statement {
  constructor(readonly db: PostgresDatabase, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new PostgresStatement(this.db, this.sql, values); }
  async all<T>() { return (await this.db.execute([this]))[0] as {results:T[]}; }
  async first<T>() { return (await this.all<T>()).results[0] ?? null; }
  async run() { return (await this.db.execute([this]))[0]; }
}
